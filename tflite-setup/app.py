import os
import json
import threading
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
import tensorflow as tf
from google import genai  # Import the Google Generative AI client
from werkzeug.utils import secure_filename
from pydrive2.auth import GoogleAuth
from pydrive2.drive import GoogleDrive

app = Flask(__name__)
# Allow requests from http://localhost:3000
CORS(app, origins=["http://localhost:3000"])

MODEL_PATH = "model.tflite"
JSON_MAP_PATH = "sign_to_prediction_index_map.json"

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

print("Current working directory:", os.getcwd())

# Global lock for thread-safe TFLite inference
inference_lock = threading.Lock()

# Load the TFLite model.
try:
    interpreter = tf.lite.Interpreter(model_path=MODEL_PATH)
    interpreter.allocate_tensors()
    try:
        predict_fn = interpreter.get_signature_runner("serving_default")
    except Exception as e:
        predict_fn = None
        print("Signature runner not available; falling back to manual invocation.")
except Exception as e:
    print("Error loading TFLite model:", e)
    raise

with open(JSON_MAP_PATH, "r") as f:
    s2p_map = json.load(f)
s2p_map = {k.lower(): v for k, v in s2p_map.items()}
p2s_map = {v: k for k, v in s2p_map.items()}


# Authenticate using a Service Account
def authenticate_service_account():
    gauth = GoogleAuth()

    # Configure the settings for the service account
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

    # Authenticate with the service account
    gauth.ServiceAuth()
    return GoogleDrive(gauth)


def upload_file_to_drive(file_path: str, folder_id: str = None):
    drive = authenticate_service_account()

    file_name = os.path.basename(file_path)
    file_metadata = {"title": file_name}
    if folder_id:
        file_metadata["parents"] = [{"id": folder_id}]

    file = drive.CreateFile(file_metadata)
    file.SetContentFile(file_path)
    file.Upload()

    file_id = file["id"]
    shareable_link = f"https://drive.google.com/file/d/{file_id}/view?usp=sharing"
    print(f"Uploaded {file_name} to Google Drive.")
    return shareable_link


@app.route("/upload", methods=["POST"])
def upload_video():
    if "file" not in request.files:
        return jsonify({"error": "No file part"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No selected file"}), 400

    if file:
        filename = secure_filename(file.filename)
        file_path = os.path.join(UPLOAD_FOLDER, filename)

        file.save(file_path)
        file_size = os.path.getsize(file_path)
        print(f"Received file size on server: {file_size} bytes")

        if file_size == 0:
            print("Received an empty file. Aborting upload.")
            os.remove(file_path)
            return jsonify({"error": "Uploaded file is empty"}), 400

        folder_id = "1VkEY_uqLp5O66zGqpTr8o5TNi_K4rf20"
        shareable_link = upload_file_to_drive(file_path, folder_id)

        os.remove(file_path)

        return jsonify({"shareable_link": shareable_link}), 200

    return jsonify({"error": "File upload failed"}), 500


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
            return (
                jsonify(
                    {
                        "error": f"Invalid input shape: expected (N, 543, 3), got {input_data.shape}"
                    }
                ),
                400,
            )

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

        if predicted_sign.lower() == "lion":
            predicted_sign = "No sign detected"

        return jsonify({"predicted_sign": predicted_sign, "confidence": max_confidence})
    except Exception as e:
        print("Error during prediction:", e)
        return jsonify({"error": str(e)}), 500


# --- Google Generative AI (Gemini 2.0flash) Setup ---

# For security, store your API key in an environment variable.
GEN_AI_API_KEY = os.environ.get(
    "GEN_AI_API_KEY", "AIzaSyDceXe1mqRSvkafKu2f5UvbZ2C867ZDqUA"
)

if not GEN_AI_API_KEY:
    raise Exception("Please set the GEN_AI_API_KEY environment variable.")

# Instantiate the client.
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

        # Build the prompt for Gemini.
        query = f"Convert these words into a coherent sentence: {words}. Just give me the sentence. Make it sound normal."

        # Call the Gemini 2.0flash model via the client.
        response = client.models.generate_content(
            model="gemini-2.0-flash", contents=[query]
        )

        # Assume the response object has a 'text' attribute.
        sentence = response.text

        return jsonify({"sentence": sentence})
    except Exception as e:
        print("Error during sentence generation:", e)
        return jsonify({"error": str(e)}), 500

# --- New endpoint for uploading video ---

@app.route('/upload_video', methods=['POST', 'OPTIONS'])
def upload_video():
    if request.method == "OPTIONS":
        return app.make_default_options_response()
    try:
        if 'video' not in request.files:
            return jsonify({"error": "No video file in the request"}), 400

        video_file = request.files['video']
        if video_file.filename == '':
            return jsonify({"error": "No selected file"}), 400

        # Secure the filename and save locally
        filename = secure_filename(video_file.filename)
        local_path = os.path.join(os.getcwd(), filename)
        video_file.save(local_path)
        print(f"Video saved locally at {local_path}")

        # Path to the service account credentials file.
        service_account_file = 'service_account_credentials.json'
        if not os.path.exists(service_account_file):
            error_msg = f"Service account credentials file '{service_account_file}' does not exist."
            print(error_msg)
            return jsonify({"error": error_msg}), 500

        # Load the service account credentials JSON.
        # Load the service account credentials JSON.
        with open(service_account_file, 'r') as f:
            client_json = json.load(f)

        # Use service account for authentication with PyDrive2.
        gauth = GoogleAuth()
        gauth.settings['client_config_backend'] = 'service'
        # Provide the credentials using both keys.
        gauth.settings['client_json_dict'] = client_json
        gauth.settings['service_config'] = client_json
        gauth.ServiceAuth()  # Authenticate using the service account


        drive = GoogleDrive(gauth)

        # Create and upload the file to Google Drive.
        drive_file = drive.CreateFile({'title': filename})
        drive_file.SetContentFile(local_path)
        drive_file.Upload()
        print(f"Video uploaded to Google Drive with file ID: {drive_file['id']}")

        return jsonify({
            "message": "Video uploaded successfully to Google Drive",
            "drive_file_id": drive_file['id']
        })
    except Exception as e:
        print("Error during video upload:", e)
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(host="0.0.0.0", port=8000)
