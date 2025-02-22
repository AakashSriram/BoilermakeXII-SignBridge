import cv2
import mediapipe as mp
import numpy as np
import tensorflow as tf
import json

def load_sign_map(json_path):
    """Load the sign-to-prediction index mapping from a JSON file."""
    with open(json_path, 'r') as f:
        s2p_map = json.load(f)
    # Lower-case keys and create a reverse mapping
    s2p_map = {k.lower(): v for k, v in s2p_map.items()}
    p2s_map = {v: k for k, v in s2p_map.items()}
    return s2p_map, p2s_map

def get_dummy_landmarks(num):
    """Return a list of dummy landmarks with zeros when detection fails."""
    class Dummy:
        x = 0.0
        y = 0.0
        z = 0.0
    return [Dummy() for _ in range(num)]

def extract_landmarks(results):
    """
    Extract exactly 543 landmarks (x, y, z) in the following order:
      - Face: 468 points
      - Left Hand: 21 points
      - Pose: 33 points
      - Right Hand: 21 points
    If any landmark set is missing, fill with dummy zeros.
    """
    face = results.face_landmarks.landmark if results.face_landmarks else get_dummy_landmarks(468)
    left_hand = results.left_hand_landmarks.landmark if results.left_hand_landmarks else get_dummy_landmarks(21)
    pose = results.pose_landmarks.landmark if results.pose_landmarks else get_dummy_landmarks(33)
    right_hand = results.right_hand_landmarks.landmark if results.right_hand_landmarks else get_dummy_landmarks(21)

    landmarks = []
    for lm in face:
        landmarks.append([lm.x, lm.y, lm.z])
    for lm in left_hand:
        landmarks.append([lm.x, lm.y, lm.z])
    for lm in pose:
        landmarks.append([lm.x, lm.y, lm.z])
    for lm in right_hand:
        landmarks.append([lm.x, lm.y, lm.z])
    
    return np.array(landmarks, dtype=np.float32)  # Shape: (543, 3)

def main():
    # Load the TFLite model
    model_path = "model.tflite"
    interpreter = tf.lite.Interpreter(model_path=model_path)
    interpreter.allocate_tensors()
    try:
        # Try to get a signature runner if available
        predict_fn = interpreter.get_signature_runner('serving_default')
    except Exception as e:
        predict_fn = None
        print("Signature runner not available; will use interpreter.invoke()")

    # Load the sign-to-index maps
    s2p_map, p2s_map = load_sign_map("sign_to_prediction_index_map.json")
    
    # Set up MediaPipe Holistic for landmark detection
    mp_holistic = mp.solutions.holistic
    holistic = mp_holistic.Holistic(
        static_image_mode=False,
        model_complexity=1,
        smooth_landmarks=True
    )
    
    # Open the default camera
    cap = cv2.VideoCapture(0)
    frames_to_collect = 10  # Number of frames to form one prediction sample
    collected_frames = []
    
    print("Starting camera. Press 'q' to quit.")
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        
        # Optionally flip the frame for a mirror effect
        frame = cv2.flip(frame, 1)
        image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # Process the frame with MediaPipe to get landmarks
        results = holistic.process(image_rgb)
        landmarks = extract_landmarks(results)  # (543, 3) array
        collected_frames.append(landmarks)
        
        # Show the camera feed
        cv2.imshow("Camera", frame)
        
        # Once we have enough frames, run the prediction
        if len(collected_frames) == frames_to_collect:
            # Prepare the input with shape (frames, 543, 3)
            input_data = np.array(collected_frames, dtype=np.float32)
            if predict_fn:
                output = predict_fn(inputs=input_data)
                preds = output['outputs']
            else:
                # Fallback to manual tensor setting and invoking
                input_details = interpreter.get_input_details()
                output_details = interpreter.get_output_details()
                interpreter.set_tensor(input_details[0]['index'], input_data)
                interpreter.invoke()
                preds = interpreter.get_tensor(output_details[0]['index'])
            
            # Process prediction result
            preds = preds.reshape(-1)
            predicted_index = np.argmax(preds)
            predicted_sign = p2s_map.get(predicted_index, "Unknown")
            print("Predicted Sign:", predicted_sign)
            
            # Clear collected frames for next prediction
            collected_frames = []
        
        # Exit on pressing 'q'
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break
    
    cap.release()
    cv2.destroyAllWindows()
    
if __name__ == '__main__':
    main()
