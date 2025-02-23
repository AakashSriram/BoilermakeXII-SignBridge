import os
import json
import time
import threading
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
import tensorflow as tf
import subprocess
from google import genai
from pydrive2.auth import GoogleAuth
from pydrive2.drive import GoogleDrive
from werkzeug.utils import secure_filename
from gtts import gTTS
import requests
from typing import Any
import re
import ssl

ssl._create_default_https_context = ssl._create_unverified_context

app = Flask(__name__)
CORS(
    app,
    resources={r"/*": {"origins": "http://localhost:3000"}},
    supports_credentials=True,
)

# -------------------------
# GLOBAL CONFIG & VARIABLES
# -------------------------
MODEL_PATH = "model.tflite"
JSON_MAP_PATH = "sign_to_prediction_index_map.json"
UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Store various shareable links in memory
video_shareable_link = None
audio_shareable_link = None
lipsynced_video_link = None
actual_text = None  # We'll store the last TTS text here globally.

# Sync.so API Keys (example: you may have different keys for GET & POST)
SYNC_GET_API_KEY = "sk-atK2Yhh0QMO_DXiPwy4fmA.qdBeLshHzVC8kDdKlVrkrf6U1Y2f03bS"
SYNC_POST_API_KEY = "sk-atK2Yhh0QMO_DXiPwy4fmA.qdBeLshHzVC8kDdKlVrkrf6U1Y2f03bS"

# -------------------------
# HELPER FUNCTIONS
# -------------------------
def convert_drive_link(original_link):
    """
    Converts a Google Drive view link (with '/file/d/...') to a direct download link.
    """
    match = re.search(r'/d/([a-zA-Z0-9_-]+)', original_link)
    if match:
        file_id = match.group(1)
        download_link = f"https://drive.google.com/uc?export=download&id={file_id}"
        print("Converted drive link:", download_link)
        return download_link
    else:
        return "Invalid Google Drive link format"


def authenticate_service_account():
    """
    Authenticates with Google Drive using PyDrive2 and a service account.
    """
    gauth = GoogleAuth()
    gauth.settings = {
        "client_config_backend": "service",
        "service_config": {
            "client_json_file_path": "service_account.json",
            "client_user_email": "pydrive-service-account@signbridge-451708.iam.gserviceaccount.com",
        },
        "oauth_scope": [
            "https://www.googleapis.com/auth/drive",
            "https://www.googleapis.com/auth/drive.file",
            "https://www.googleapis.com/auth/drive.appdata",
        ],
    }
    gauth.ServiceAuth()
    return GoogleDrive(gauth)


def upload_file_to_drive(file_path: str, folder_id: str = None):
    """
    Uploads a file to Google Drive and returns the shareable link.
    """
    drive = authenticate_service_account()

    file_name = os.path.basename(file_path)
    file_size = os.path.getsize(file_path)
    print(f"Preparing to upload file: {file_name}, Size: {file_size} bytes")

    file_metadata = {"title": file_name}
    if folder_id:
        file_metadata["parents"] = [{"id": folder_id}]

    drive_file = drive.CreateFile(file_metadata)
    drive_file.SetContentFile(file_path)

    try:
        drive_file.Upload({"convert": True})
        print(f"Successfully uploaded {file_name} to Google Drive.")
    except Exception as e:
        print(f"Failed to upload file: {e}")

    file_id = drive_file["id"]
    shareable_link = f"https://drive.google.com/file/d/{file_id}/view?usp=sharing"
    return shareable_link


def get_sync(job_id, poll_interval=5, max_retries=60):
    """
    Polls Sync.so for the generated lipsynced video.
    Returns the output URL if job completes successfully, else None.
    """
    url = f"https://api.sync.so/v2/generate/{job_id}"
    headers = {"x-api-key": SYNC_GET_API_KEY}
    print(url)
    print(headers)

    for attempt in range(max_retries):
        response = requests.request("GET", url, headers=headers)
        if response.status_code == 200:
            data = response.json()
            print(data)

            # Check the status that Sync.so returns. 
            # If "outputUrl" is directly available and the status is "complete":
            status = data.get("status", "").lower()
            if status == "completed":
                output_url = data.get("outputUrl")
                if output_url:
                    return output_url
            elif status == "pending":
                print("pending")
            elif status in ["error", "failed"]:
                print(f"[Sync Job] The job failed. Full response:\n{data}")
                return None
            # Otherwise it's likely "processing"/"queued" - keep polling.
        else:
            print(f"[Attempt {attempt+1}] Failed to fetch status: {response.text}")

        time.sleep(poll_interval)

    print("Timed out waiting for lipsync to complete.")
    return None


def post_sync(video_link, audio_link, text):
    """
    Submits a lipsync job to Sync.so and polls for completion.
    Returns the final lipsynced URL or None if there's an error.
    """
    url = "https://api.sync.so/v2/generate"
    headers = {
        "x-api-key": SYNC_POST_API_KEY,
        "Content-Type": "application/json",
    }

    payload = {
        "model": "lipsync-1.9.0-beta",
        "input": [
            {"type": "video", "url": video_link},
            {
                "type": "audio",
                "url": audio_link,
                "provider": {
                    "name": "Shivam",
                    "voiceId": "01",
                    # The script, if required by Sync.so
                    "script": text
                }
            }
        ]
    }
    print(payload)
    print(headers)
    try:
        response = requests.request("POST", url, json=payload, headers=headers)
        if response.status_code == 201:
            data = response.json()
            job_id = data.get("id")
            if not job_id:
                print("No job_id returned from Sync.so response.")
                return None

            # (Optional) Wait a few seconds before polling
            time.sleep(5)

            final_url = get_sync(job_id)
            print("Lipsynced video link:", final_url)
            return final_url
        else:
            print("Failed to start Sync job. Response:", response.text)
            return None
    except Exception as e:
        print("Error while calling Sync.so:", str(e))
        return None


# -------------------------
# LOAD TFLITE MODEL
# -------------------------
print("Current working directory:", os.getcwd())

try:
    interpreter = tf.lite.Interpreter(model_path=MODEL_PATH)
    interpreter.allocate_tensors()
    try:
        predict_fn = interpreter.get_signature_runner("serving_default")
    except Exception:
        predict_fn = None
        print("Signature runner not available; falling back to manual invocation.")
except Exception as e:
    print("Error loading TFLite model:", e)
    raise

with open(JSON_MAP_PATH, "r") as f:
    s2p_map = json.load(f)

# Lowercase the keys
s2p_map = {k.lower(): v for k, v in s2p_map.items()}
p2s_map = {v: k for k, v in s2p_map.items()}

# Global lock for thread-safe TFLite inference
inference_lock = threading.Lock()


# -------------------------
# FLASK ROUTES
# -------------------------

@app.route("/uploadvideo", methods=["POST"])
def upload_video():
    global video_shareable_link, audio_shareable_link, lipsynced_video_link

    if "file" not in request.files:
        return jsonify({"error": "No file part"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No selected file"}), 400

    # Save the uploaded file locally
    filename = secure_filename(file.filename)
    file_path = os.path.join(UPLOAD_FOLDER, filename)
    file.save(file_path)

    # Optional check for empty file
    file_size = os.path.getsize(file_path)
    if file_size == 0:
        os.remove(file_path)
        return jsonify({"error": "Uploaded file is empty"}), 400

    # 1) Convert .webm to .mp4 (if needed) via ffmpeg
    extension = os.path.splitext(filename)[1].lower()
    if extension == ".webm":
        print("Converting .webm to .mp4 via ffmpeg...")
        mp4_filename = os.path.splitext(filename)[0] + ".mp4"
        mp4_file_path = os.path.join(UPLOAD_FOLDER, mp4_filename)

        ffmpeg_command = [
            "ffmpeg",
            "-y",  # Overwrite
            "-i", file_path,
            "-c:v", "libx264",
            "-c:a", "aac",
            mp4_file_path
        ]
        try:
            subprocess.run(ffmpeg_command, check=True)
            print(f"Converted {filename} to {mp4_filename} successfully.")
        except subprocess.CalledProcessError as e:
            os.remove(file_path)
            return jsonify({"error": f"ffmpeg conversion failed: {str(e)}"}), 500

        os.remove(file_path)
        file_path = mp4_file_path
        print("Using .mp4 file:", file_path)
    else:
        print("No conversion needed. (File is not .webm)")

    # 2) Upload the final (.mp4) to Drive
    try:
        folder_id = "1VkEY_uqLp5O66zGqpTr8o5TNi_K4rf20"  # Your own folder ID
        shareable_link = upload_file_to_drive(file_path, folder_id)
        os.remove(file_path)
    except Exception as e:
        print("Drive upload failed:", e)
        return jsonify({"error": f"Drive upload failed: {str(e)}"}), 500

    video_shareable_link = shareable_link
    print("Stored video link in global variable:", video_shareable_link)

    # Convert it to a downloadable link
    converted_video_link = convert_drive_link(video_shareable_link)

    # If we already have audio, do lipsync
    if audio_shareable_link:
        converted_audio_link = convert_drive_link(audio_shareable_link)
        # Lipsync and get the final link
        lipsynced_video_link = post_sync(converted_video_link, converted_audio_link, actual_text)
        return jsonify({
            "shareable_link": video_shareable_link,
            "final_lipsynced_link": lipsynced_video_link
        }), 200

    # Otherwise return only the shareable link
    return jsonify({"shareable_link": video_shareable_link}), 200


@app.route("/uploadaudio", methods=["POST", "OPTIONS"])
def upload_audio():
    """
    1. Receives text in JSON payload.
    2. Generates MP3 via gTTS.
    3. Converts MP3 to WAV via ffmpeg.
    4. Uploads the WAV to Google Drive, then removes local files.
    5. If a video link is already stored, calls post_sync automatically.
    """
    global audio_shareable_link, video_shareable_link, lipsynced_video_link, actual_text

    if request.method == "OPTIONS":
        response = jsonify({"message": "CORS preflight passed"})
        response.status_code = 200
        return response

    try:
        data = request.get_json(force=True)
        sentence = data.get("sentence")
        if not sentence:
            return jsonify({"error": "Missing 'sentence' key in JSON payload"}), 400

        # Store globally so we can pass to post_sync
        actual_text = sentence
        print("Received sentence:", sentence)

        # Generate MP3 from text
        tts = gTTS(text=sentence, lang="en")
        mp3_filename = "generated_audio.mp3"
        mp3_path = os.path.join(UPLOAD_FOLDER, mp3_filename)
        tts.save(mp3_path)

        # Convert MP3 to WAV using ffmpeg
        wav_filename = "generated_audio.wav"
        wav_path = os.path.join(UPLOAD_FOLDER, wav_filename)
        ffmpeg_command = [
            "ffmpeg",
            "-y",           
            "-i", mp3_path,  
            "-acodec", "pcm_s16le",  
            "-ar", "44100",  
            wav_path
        ]
        try:
            subprocess.run(ffmpeg_command, check=True)
            print(f"Converted {mp3_filename} to {wav_filename} successfully.")
        except subprocess.CalledProcessError as e:
            os.remove(mp3_path)
            return jsonify({"error": f"ffmpeg conversion failed: {str(e)}"}), 500

        # Remove the original MP3
        os.remove(mp3_path)

        # Upload the WAV file to Google Drive
        folder_id = "1VkEY_uqLp5O66zGqpTr8o5TNi_K4rf20"
        shareable_link = upload_file_to_drive(wav_path, folder_id)
        os.remove(wav_path)

        audio_shareable_link = shareable_link
        print("Stored audio link:", audio_shareable_link)

        # If a video link already exists, do lipsync
        if video_shareable_link:
            converted_video_link = convert_drive_link(video_shareable_link)
            converted_audio_link = convert_drive_link(audio_shareable_link)
            lipsynced_video_link = post_sync(converted_video_link, converted_audio_link, actual_text)

            return jsonify({
                "shareable_link": audio_shareable_link,
                "final_lipsynced_link": lipsynced_video_link
            }), 200

        return jsonify({"shareable_link": audio_shareable_link}), 200

    except Exception as e:
        print("Error during audio generation or upload:", e)
        return jsonify({"error": str(e)}), 500


@app.route("/predict", methods=["POST", "OPTIONS"])
def predict():
    """
    Performs sign language prediction using the TFLite model.
    Expects JSON of shape: {"frames": (N, 543, 3)} float data.
    """
    if request.method == "OPTIONS":
        return app.make_default_options_response()

    try:
        data = request.get_json(force=True)
        frames = data.get("frames")
        if frames is None:
            return jsonify({"error": "Missing 'frames' key in JSON payload"}), 400

        input_data = np.array(frames, dtype=np.float32)
        if input_data.ndim != 3 or input_data.shape[1:] != (543, 3):
            return jsonify({
                "error": f"Invalid input shape: expected (N, 543, 3), got {input_data.shape}"
            }), 400

        with inference_lock:
            if predict_fn:
                output = predict_fn(inputs=input_data)
                preds = output["outputs"]
            else:
                input_details = interpreter.get_input_details()
                output_details = interpreter.get_output_details()
                interpreter.set_tensor(input_details[0]["index"], input_data)
                interpreter.invoke()
                preds = interpreter.get_tensor(output_details[0]["index"])

        preds = preds.reshape(-1)
        predicted_index = int(np.argmax(preds))
        max_confidence = float(np.max(preds))
        predicted_sign = p2s_map.get(predicted_index, "Unknown")

        # Example check if "lion" was a placeholder for "no sign"
        if predicted_sign.lower() == "lion":
            predicted_sign = "No sign detected"

        return jsonify({"predicted_sign": predicted_sign, "confidence": max_confidence})

    except Exception as e:
        print("Error during prediction:", e)
        return jsonify({"error": str(e)}), 500


# -------------------------
# GOOGLE GENERATIVE AI (Optional)
# -------------------------
GEN_AI_API_KEY = os.environ.get(
    "GEN_AI_API_KEY", "AIzaSyDceXe1mqRSvkafKu2f5UvbZ2C867ZDqUA"
)
client = genai.Client(api_key=GEN_AI_API_KEY)

@app.route("/generate_sentence", methods=["POST", "OPTIONS"])
def generate_sentence():
    if request.method == "OPTIONS":
        return app.make_default_options_response()
    try:
        data = request.get_json(force=True)
        words = data.get("words")
        if words is None:
            return jsonify({"error": "Missing 'words' key in JSON payload"}), 400

        query = f"Convert these words into a coherent sentence: {words}. Just give me the sentence."

        response = client.models.generate_content(
            model="gemini-2.0-flash", contents=[query]
        )
        # Adjust if your generative AI client returns text differently
        sentence = response.text

        return jsonify({"sentence": sentence})
    except Exception as e:
        print("Error during sentence generation:", e)
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    # Run Flask app
    app.run(host="0.0.0.0", port=8000)
