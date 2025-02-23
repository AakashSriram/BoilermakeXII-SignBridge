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


import ssl
ssl._create_default_https_context = ssl._create_unverified_context

app = Flask(__name__)
# Allow requests from http://localhost:3000
CORS(
    app,
    resources={r"/*": {"origins": "http://localhost:3000"}},
    supports_credentials=True,
)

MODEL_PATH = "model.tflite"
JSON_MAP_PATH = "sign_to_prediction_index_map.json"

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

print("Current working directory:", os.getcwd())

# Global lock for thread-safe TFLite inference
inference_lock = threading.Lock()

# -------------------------
# LOAD TFLITE MODEL
# -------------------------
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

# -------------------------
# GLOBAL VARIABLES
# -------------------------
video_shareable_link = None
audio_shareable_link = None
lipsynced_video_link = None  # Will store the final Sync.so lipsynced video link

# -------------------------
# GOOGLE DRIVE AUTH & UPLOAD
# -------------------------
def authenticate_service_account():
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

# -------------------------
# SYNC FUNCTIONS
# -------------------------
def get_sync(job_id):
    while True:
        url = f"https://api.sync.so/v2/generate/{job_id}"
        headers = {
            "x-api-key": "sk-s7q39wHaSkqBbkVWRt251g.nDL7ibVAWrjWb2mVOG5f6GrXJuSTdMOf"
        }
        response = requests.get(url, headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            if data.get("outputUrl") is not None:
                return data["outputUrl"]
        else:
            print(f"Failed to fetch job status: {response.text}")

        time.sleep(5)  # Check every 5 seconds for the outputUrl

def post_sync(vLink, aLink):
    url = "https://api.sync.so/v2/generate"
    payload = {
        "model": "lipsync-1.9.0-beta",
        "input": [
            {"type": "video", "url": vLink},
            {"type": "audio", "url": aLink}
        ]
    }
    headers = {
        "x-api-key": "sk-JFVWXbkcQcmlcwH25jGONw.D_T1qHvmbCJ_s_nUDa1Yyk4YW7f4luGA",
        "Content-Type": "application/json"
    }

    response = requests.post(url, json=payload, headers=headers)
    if response.status_code == 200:
        data = response.json()
        job_id = data.get("id")
        # Now wait for the final lipsynced URL
        video_link = get_sync(job_id)
        print("Lipsynced video link:", video_link)
        return video_link
    else:
        print("Failed to fetch job status:", response.text)
        return None

# -------------------------
# FLASK ENDPOINTS
# -------------------------

@app.route("/uploadvideo", methods=["POST"])
def upload_video():
    """
    Accepts a video file (possibly .webm), converts it to .mp4 using ffmpeg,
    uploads it to Google Drive, returns the shareable link,
    and optionally calls post_sync if an audio link is already available.
    """
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

    # Check file size (optional safety check)
    file_size = os.path.getsize(file_path)
    if file_size == 0:
        os.remove(file_path)
        return jsonify({"error": "Uploaded file is empty"}), 400

    # ------------------------------------
    # 1) Convert .webm to .mp4 if needed
    # ------------------------------------
    extension = os.path.splitext(filename)[1].lower()
    if extension == ".webm":
        print("Converting .webm to .mp4 via ffmpeg...")
        mp4_filename = os.path.splitext(filename)[0] + ".mp4"
        mp4_file_path = os.path.join(UPLOAD_FOLDER, mp4_filename)

        ffmpeg_command = [
            "ffmpeg",
            "-y",                 # Overwrite output file if it exists
            "-i", file_path,      # Input
            "-c:v", "libx264",    # Video codec
            "-c:a", "aac",        # Audio codec
            mp4_file_path
        ]

        try:
            subprocess.run(ffmpeg_command, check=True)
            print(f"Converted {filename} to {mp4_filename} successfully.")
        except subprocess.CalledProcessError as e:
            os.remove(file_path)
            return jsonify({"error": f"ffmpeg conversion failed: {str(e)}"}), 500

        # Remove the original .webm file
        os.remove(file_path)
        # Update file_path to .mp4
        file_path = mp4_file_path
        print("Using .mp4 file:", file_path)
    else:
        print("No conversion needed. (File is not .webm)")

    # ------------------------------------
    # 2) Upload final file (.mp4) to Drive
    # ------------------------------------
    try:
        folder_id = "1VkEY_uqLp5O66zGqpTr8o5TNi_K4rf20"  # Example folder
        shareable_link = upload_file_to_drive(file_path, folder_id)
        # Remove the local file after uploading
        os.remove(file_path)
    except Exception as e:
        print("Drive upload failed:", e)
        return jsonify({"error": f"Drive upload failed: {str(e)}"}), 500

    # ------------------------------------
    # 3) Update global state & optionally post_sync
    # ------------------------------------
    video_shareable_link = shareable_link
    print("Stored video link in global variable:", video_shareable_link)

    # If there's already an audio link, do post_sync automatically
    if audio_shareable_link:
        lipsynced_video_link = post_sync(video_shareable_link, audio_shareable_link)
        return jsonify({
             "shareable_link": video_shareable_link,
             "final_lipsynced_link": lipsynced_video_link
        }), 200

        # For demonstration, pretend we have post_sync disabled:

    # Return the shareable link
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
    global audio_shareable_link, video_shareable_link, lipsynced_video_link

    if request.method == "OPTIONS":
        response = jsonify({"message": "CORS preflight passed"})
        response.status_code = 200  # Ensure 200 for preflight
        return response

    try:
        data = request.get_json(force=True)
        sentence = data.get("sentence")
        print("Received sentence:", sentence)

        if not sentence:
            return jsonify({"error": "Missing 'sentence' key in JSON payload"}), 400

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
            "-y",            # Overwrite if file exists
            "-i", mp3_path,  # Input (MP3)
            "-acodec", "pcm_s16le",  # Uncompressed PCM
            "-ar", "44100",  # Sample rate
            wav_path
        ]
        try:
            subprocess.run(ffmpeg_command, check=True)
            print(f"Converted {mp3_filename} to {wav_filename} successfully.")
        except subprocess.CalledProcessError as e:
            os.remove(mp3_path)
            return jsonify({"error": f"ffmpeg conversion failed: {str(e)}"}), 500

        # Remove the original MP3 after successful conversion
        os.remove(mp3_path)

        # Upload the WAV file to Google Drive
        folder_id = "1VkEY_uqLp5O66zGqpTr8o5TNi_K4rf20"  # your folder ID
        shareable_link = upload_file_to_drive(wav_path, folder_id)

        # Remove the local WAV file
        os.remove(wav_path)

        # Store link in global variable
        audio_shareable_link = shareable_link
        print("Stored audio link:", audio_shareable_link)

        # If a video link already exists, do post_sync
        if video_shareable_link:
            lipsynced_video_link = post_sync(video_shareable_link, audio_shareable_link)
            return jsonify({
                "shareable_link": audio_shareable_link,
                "final_lipsynced_link": lipsynced_video_link
            }), 200
        else:
            return jsonify({"shareable_link": audio_shareable_link}), 200

    except Exception as e:
        print("Error during audio generation or upload:", e)
        return jsonify({"error": str(e)}), 500



@app.route("/predict", methods=["POST", "OPTIONS"])
def predict():
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

        # Example: If "lion" was a placeholder for "no sign," handle that:
        if predicted_sign.lower() == "lion":
            predicted_sign = "No sign detected"

        return jsonify({"predicted_sign": predicted_sign, "confidence": max_confidence})

    except Exception as e:
        print("Error during prediction:", e)
        return jsonify({"error": str(e)}), 500


# -------------------------
# GOOGLE GENERATIVE AI (GEMINI 2.0-FLASH)
# -------------------------
GEN_AI_API_KEY = os.environ.get(
    "GEN_AI_API_KEY", "AIzaSyDceXe1mqRSvkafKu2f5UvbZ2C867ZDqUA"
)
if not GEN_AI_API_KEY:
    raise Exception("Please set the GEN_AI_API_KEY environment variable.")

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

        query = f"Convert these words into a coherent sentence: {words}. Just give me the sentence. Make it sound normal."

        response = client.models.generate_content(
            model="gemini-2.0-flash", contents=[query]
        )
        sentence = response.text  # Assumes the response object has a `.text` attribute

        return jsonify({"sentence": sentence})
    except Exception as e:
        print("Error during sentence generation:", e)
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)
