import os
import json
import threading
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
import tensorflow as tf
from google import genai  # Import the Google Generative AI client

app = Flask(__name__)
# Allow requests from http://localhost:3000
CORS(app, origins=["http://localhost:3000"])

MODEL_PATH = "model.tflite"
JSON_MAP_PATH = "sign_to_prediction_index_map.json"

print("Current working directory:", os.getcwd())

# Global lock for thread-safe TFLite inference
inference_lock = threading.Lock()

# Load the TFLite model.
try:
    interpreter = tf.lite.Interpreter(model_path=MODEL_PATH)
    interpreter.allocate_tensors()
    try:
        predict_fn = interpreter.get_signature_runner('serving_default')
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

@app.route('/predict', methods=['POST', 'OPTIONS'])
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
                preds = output['outputs']
            else:
                input_details = interpreter.get_input_details()
                output_details = interpreter.get_output_details()
                interpreter.set_tensor(input_details[0]['index'], input_data)
                interpreter.invoke()
                preds = interpreter.get_tensor(output_details[0]['index'])
        
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
GEN_AI_API_KEY = os.environ.get("GEN_AI_API_KEY", "AIzaSyDceXe1mqRSvkafKu2f5UvbZ2C867ZDqUA")

if not GEN_AI_API_KEY:
    raise Exception("Please set the GEN_AI_API_KEY environment variable.")

# Instantiate the client.
client = genai.Client(api_key=GEN_AI_API_KEY)

@app.route('/generate_sentence', methods=['POST', 'OPTIONS'])
def generate_sentence():
    if request.method == "OPTIONS":
        return app.make_default_options_response()
    try:
        data = request.get_json(force=True)
        words = data.get("words")
        if words is None:
            return jsonify({"error": "Missing 'words' key in JSON payload"}), 400

        # Build the prompt for Gemini.
        query = f"Convert these words into a coherent sentence: {words}"

        # Call the Gemini 2.0flash model via the client.
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[query]
        )
        
        # Assume the response object has a 'text' attribute.
        sentence = response.text

        return jsonify({"sentence": sentence})
    except Exception as e:
        print("Error during sentence generation:", e)
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host="0.0.0.0", port=8000)
