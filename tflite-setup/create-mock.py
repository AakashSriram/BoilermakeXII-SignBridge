import mediapipe as mp
import cv2
import numpy as np
import os
import json

mp_drawing = mp.solutions.drawing_utils
mp_hands = mp.solutions.hands

# Folder containing video files
video_folder = "videos/"

# Initialize MediaPipe Hands
with mp_hands.Hands(min_detection_confidence=0.8, min_tracking_confidence=0.5) as hands:
    data = {}

    for idx, filename in enumerate(
        filter(lambda f: f.endswith(".mp4"), os.listdir(video_folder))
    ):
        video_file = os.path.join(video_folder, filename)
        file_name = os.path.splitext(filename)[0]
        data[file_name] = []

        cap = cv2.VideoCapture(video_file)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        frame_number = 0

        while cap.isOpened():
            ret, frame = cap.read()

            if not ret:
                break

            frame = cv2.resize(frame, (800, 750))
            image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = hands.process(image_rgb)

            if results.multi_hand_landmarks and results.multi_handedness:
                left_hand_coordinates = []
                right_hand_coordinates = []

                for hand_landmarks, hand_label in zip(
                    results.multi_hand_landmarks, results.multi_handedness
                ):
                    hand_coordinates = [
                        {
                            "Joint Index": joint_id,
                            "Coordinates": [landmark.x, landmark.y, landmark.z],
                        }
                        for joint_id, landmark in enumerate(hand_landmarks.landmark)
                    ]

                    handedness = hand_label.classification[0].label
                    if handedness == "Left":
                        left_hand_coordinates = hand_coordinates
                    else:
                        right_hand_coordinates = hand_coordinates

                data[file_name].append(
                    {
                        "Frame": frame_number,
                        "Left Hand Coordinates": left_hand_coordinates,
                        "Right Hand Coordinates": right_hand_coordinates,
                    }
                )

                frame_number += 1

        cap.release()
        print(f"Processed video {idx + 1}/{len(os.listdir(video_folder))}: {file_name}")

# Write to JSON file
with open("reference.json", "w") as json_file:
    json.dump(data, json_file)

cv2.destroyAllWindows()