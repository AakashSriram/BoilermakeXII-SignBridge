"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Camera as IconCamera,
  Mic,
  Sun,
  Moon,
  Settings,
} from "lucide-react";

export default function ASLTranslator() {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [detectedText, setDetectedText] = useState("");
  const [landmarksBatch, setLandmarksBatch] = useState<number[][][]>([]);
  const framesToSend = 10;

  const videoRef = useRef<HTMLVideoElement>(null);
  const holisticRef = useRef<any>(null);
  const cameraInstanceRef = useRef<any>(null);

  // Initialize MediaPipe Holistic via the global window object
  useEffect(() => {
    if (typeof window !== "undefined" && window.Holistic) {
      const holistic = new window.Holistic({
        locateFile: (file: string) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`,
      });
      holistic.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        refineFaceLandmarks: true,
      });
      holistic.onResults(onResults);
      holisticRef.current = holistic;
    } else {
      console.error(
        "window.Holistic is undefined. Ensure the CDN scripts are loaded in layout.tsx."
      );
    }
  }, []);

  // Process MediaPipe results and batch landmark frames for prediction
  const onResults = (results: any) => {
    const extract = (landmarks: any, count: number) => {
      if (!landmarks || landmarks.length === 0) {
        return Array(count).fill({ x: 0, y: 0, z: 0 });
      }
      if (landmarks.length < count) {
        const missing = Array(count - landmarks.length).fill({
          x: 0,
          y: 0,
          z: 0,
        });
        return [...landmarks, ...missing];
      }
      return landmarks.slice(0, count);
    };

    const faceLandmarks = extract(results.faceLandmarks, 468);
    const leftHandLandmarks = extract(results.leftHandLandmarks, 21);
    const poseLandmarks = extract(results.poseLandmarks, 33);
    const rightHandLandmarks = extract(results.rightHandLandmarks, 21);

    const landmarks = [
      ...faceLandmarks.map((lm: any) => [lm.x, lm.y, lm.z]),
      ...leftHandLandmarks.map((lm: any) => [lm.x, lm.y, lm.z]),
      ...poseLandmarks.map((lm: any) => [lm.x, lm.y, lm.z]),
      ...rightHandLandmarks.map((lm: any) => [lm.x, lm.y, lm.z]),
    ];

    if (landmarks.length !== 543) {
      console.error("Incorrect landmark count:", landmarks.length);
      return;
    }

    setLandmarksBatch((prev) => {
      const updated = [...prev, landmarks];
      if (updated.length === framesToSend) {
        sendLandmarks(updated);
        return [];
      }
      return updated;
    });
  };

  // Send the accumulated landmark frames to the backend for prediction
  const sendLandmarks = async (frames: number[][][]) => {
    try {
      const response = await fetch("http://localhost:8000/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frames }),
      });
      const data = await response.json();
      if (data.predicted_sign) {
        setDetectedText(data.predicted_sign);
      } else {
        console.error("Prediction error:", data.error);
        setDetectedText("Prediction error");
      }
    } catch (err) {
      console.error("Error sending landmarks:", err);
      setDetectedText("Error sending landmarks");
    }
  };

  // Toggle recording: start or stop the camera feed and processing
  const toggleRecording = () => {
    if (!isRecording) {
      if (videoRef.current && holisticRef.current && window.Camera) {
        const camera = new window.Camera(videoRef.current, {
          onFrame: async () => {
            await holisticRef.current.send({ image: videoRef.current });
          },
          width: 800,
          height: 600,
        });
        camera.start();
        cameraInstanceRef.current = camera;
      } else {
        console.error(
          "Camera initialization error. Ensure the video element is mounted and window.Camera is defined."
        );
      }
    } else {
      if (cameraInstanceRef.current) {
        cameraInstanceRef.current.stop();
      }
    }
    setIsRecording((prev) => !prev);
  };

  return (
    <div
      className={`h-screen font-sans flex flex-col ${
        isDarkMode
          ? "bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white"
          : "bg-gradient-to-br from-gray-100 via-white to-gray-200 text-gray-900"
      }`}
    >
      {/* Navbar */}
      <nav className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <div className="text-lg font-extrabold tracking-wider">
          ASL TRANSLATOR
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2 rounded-full hover:bg-gray-700 transition-colors"
          >
            {isDarkMode ? <Sun size={24} /> : <Moon size={24} />}
          </button>
          <button className="p-2 rounded-full hover:bg-gray-700 transition-colors">
            <Settings size={24} />
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-grow flex flex-col items-center justify-center px-4">
        {/* Enlarged Camera Feed */}
        <div className="relative w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl mb-4">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-auto object-cover brightness-90"
          />
          <button
            onClick={toggleRecording}
            className="absolute bottom-4 right-4 bg-blue-600 hover:bg-blue-700 transition-colors p-4 rounded-full shadow-lg transform hover:scale-105"
          >
            <IconCamera size={28} />
          </button>
        </div>

        {/* Prediction Card */}
        <div className="bg-gray-800 bg-opacity-70 backdrop-blur-sm rounded-2xl p-4 shadow-xl w-full max-w-sm mb-4">
          <h2 className="text-lg font-semibold mb-2">Detected Sign</h2>
          <p className="text-xl tracking-wide">
            {detectedText || "Waiting for prediction..."}
          </p>
        </div>

        {/* Controls */}
        <div className="flex gap-4">
          <button
            onClick={() => setDetectedText("")}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 transition-colors rounded-full shadow-md text-sm"
          >
            Clear Text
          </button>
          <button className="px-4 py-2 bg-green-600 hover:bg-green-700 transition-colors rounded-full shadow-md flex items-center gap-2 text-sm">
            <Mic size={16} />
            Speak Text
          </button>
        </div>
      </main>
    </div>
  );
}
