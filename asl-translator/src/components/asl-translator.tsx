"use client";

import React, { useState, useEffect, useRef } from "react";
import { Camera as IconCamera, Mic, Sun, Moon, Settings, Link2 } from "lucide-react";
import { useAuth0 } from "@auth0/auth0-react";

export default function SignBrige() {
  const { user } = useAuth0();
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [detectedText, setDetectedText] = useState("");
  const [landmarksBatch, setLandmarksBatch] = useState<number[][][]>([]);
  const framesToSend = 20;
  const [detectedTexts, setDetectedTexts] = useState<string[]>([]);
  const [generatedSentence, setGeneratedSentence] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  // Refs for video processing and MediaRecorder
  const videoRef = useRef<HTMLVideoElement>(null);
  const holisticRef = useRef<any>(null);
  const cameraInstanceRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);

  // Adds a new detected word if the array has less than 5 items.
  const addDetectedText = (text: string) => {
    setDetectedTexts((prev) => {
      if (
        !text ||
        text === "No signs detected" ||
        prev.length >= 5 ||
        prev.includes(text)
      ) {
        return prev;
      }
      return [...prev, text];
    });
  };

  const removeDetectedText = (index: number) => {
    setDetectedTexts((prev) => prev.filter((_, i) => i !== index));
  };

    // Initialize MediaPipe Holistic from the global window object (via CDN)
    useEffect(() => {
        if (typeof window !== "undefined" && window.Holistic) {
            const holistic = new window.Holistic({
                locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`,
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
            console.error("window.Holistic is undefined. Ensure the CDN scripts are loaded in layout.tsx.");
        }
    }, []);

    // Helper: extracts landmarks and fills missing entries.
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

  // Process MediaPipe results
  const onResults = (results: any) => {
    const faceLandmarks = extract(results.faceLandmarks, 468);
    const poseLandmarks = extract(results.poseLandmarks, 33);
    let leftHandLandmarks = extract(results.leftHandLandmarks, 21);
    const rightHandRaw = extract(results.rightHandLandmarks, 21);

    const leftIsEmpty = leftHandLandmarks.every(
      (lm: any) => lm.x === 0 && lm.y === 0 && lm.z === 0
    );

    let rightHandLandmarks;
    if (leftIsEmpty) {
      leftHandLandmarks = rightHandRaw.map((lm: any) => ({
        x: 1 - lm.x,
        y: lm.y,
        z: lm.z,
      }));
      rightHandLandmarks = Array(21).fill({ x: 0, y: 0, z: 0 });
    } else {
      rightHandLandmarks = rightHandRaw.map((lm: any) => ({
        x: 1 - lm.x,
        y: lm.y,
        z: lm.z,
      }));
    }

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

  // Send accumulated landmark frames to the backend for prediction.
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
        addDetectedText(data.predicted_sign);
      } else {
        console.error("Prediction error:", data.error);
        setDetectedText("Prediction error");
      }
    } catch (err) {
      console.error("Error sending landmarks:", err);
      setDetectedText("Error sending landmarks");
    }
  };

  // Helper: Get a valid stream for recording.
  const getValidStream = async () => {
    // Attempt to use the existing srcObject or captureStream (or prefixed version)
    let stream =
      videoRef.current?.srcObject ||
      videoRef.current?.captureStream?.() ||
      videoRef.current?.webkitCaptureStream?.();

    // Check if the stream has a video track
    if (!stream || stream.getVideoTracks().length === 0) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Error getting media stream:", err);
        return null;
      }
    }
    return stream;
  };

  // Toggle recording: start/stop camera feed, processing, and a 5-second video capture.
  const toggleRecording = async () => {
    if (!isRecording) {
      if (videoRef.current && holisticRef.current && window.Camera) {
        // Start MediaPipe camera processing.
        const camera = new window.Camera(videoRef.current, {
          onFrame: async () => {
            await holisticRef.current.send({ image: videoRef.current });
          },
          width: 800,
          height: 600,
        });
        camera.start();
        cameraInstanceRef.current = camera;

        // Ensure we have a valid media stream.
        const stream = await getValidStream();
        if (!stream) {
          console.error("Unable to obtain a valid media stream.");
          return;
        }

        try {
          const mediaRecorder = new MediaRecorder(stream, {
            mimeType: "video/webm",
          });
          recordedChunks.current = [];
          mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              recordedChunks.current.push(event.data);
            }
          };
          mediaRecorder.onstop = async () => {
            const blob = new Blob(recordedChunks.current, {
              type: "video/webm",
            });
            const file = new File([blob], "recorded_video.webm", {
              type: "video/webm",
            });
            const formData = new FormData();
            formData.append("video", file);
            try {
              const response = await fetch("http://localhost:8000/upload_video", {
                method: "POST",
                body: formData,
              });
              const data = await response.json();
              if (data.message) {
                console.log("Video upload successful:", data.message);
              } else {
                console.error("Video upload error:", data.error);
              }
            } catch (error) {
              console.error("Error uploading video:", error);
            }
          };
          mediaRecorder.start();
          mediaRecorderRef.current = mediaRecorder;

          // Automatically stop recording after 5 seconds.
          setTimeout(() => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
              mediaRecorderRef.current.stop();
            }
          }, 5000);
        } catch (error) {
          console.error("MediaRecorder initialization error:", error);
        }
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

    // Generate a coherent sentence using the accumulated words.
    const handleGenerateSentence = async () => {
        if (detectedTexts.length !== 5) {
            console.warn("Need exactly 5 words to generate a sentence.");
            return;
        }
        setIsGenerating(true);
        try {
            const wordsString = detectedTexts.join(" ");
            const response = await fetch("http://localhost:8000/generate_sentence", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ words: wordsString }),
            });
            const data = await response.json();
            if (data.sentence) {
                setGeneratedSentence(data.sentence);
            } else {
                setGeneratedSentence("Error generating sentence.");
                console.error("Generation error:", data.error);
            }
        } catch (error) {
            console.error("Error during sentence generation:", error);
            setGeneratedSentence("Error during sentence generation.");
        } finally {
            setIsGenerating(false);
        }
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
            <nav className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
                <div className="flex items-center gap-2">
                    <Link2 size={28} className="text-blue-400" />
                    <span className="text-2xl font-extrabold tracking-widest">SignBrige</span>
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
                    {user && (
                        <div className="flex items-center gap-2">
                            <img
                                src={user.picture}
                                alt={user.name}
                                className="w-10 h-10 rounded-full border-2 border-blue-400"
                            />
                            <span className="text-lg font-medium">{user.name}</span>
                        </div>
                    )}
                </div>
            </nav>

      {/* Main Content: Two-column layout */}
      <main className="flex flex-grow flex-col lg:flex-row items-center justify-center p-4">
        {/* Left: Enlarged Camera Feed */}
        <div className="w-full lg:w-1/2 p-2 flex justify-center">
          <div className="relative w-full max-w-3xl rounded-3xl overflow-hidden shadow-2xl">
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
        </div>
        {/* Right: Prediction Card, Controls, History & Sentence Generation */}
        <div className="w-full lg:w-1/2 p-2 flex flex-col items-center justify-center">
          <div className="bg-gray-800 bg-opacity-70 backdrop-blur-sm rounded-2xl p-8 shadow-xl w-full max-w-md mb-6">
            <h2 className="text-xl font-semibold mb-4 text-center">
              Detected Sign
            </h2>
            <p className="text-2xl tracking-wider text-center">
              {detectedText || "Waiting for prediction..."}
            </p>
          </div>
          {/* Detected Signs History */}
          <div className="w-full max-w-md bg-gray-800 bg-opacity-70 backdrop-blur-sm rounded-2xl p-4 shadow-xl mb-6">
            <h3 className="text-lg font-semibold mb-2 text-center">
              Detected Signs History
            </h3>
            {detectedTexts.length > 0 ? (
              <ul className="space-y-2">
                {detectedTexts.map((text, index) => (
                  <li
                    key={index}
                    className="flex items-center justify-between bg-gray-700 rounded-lg p-2"
                  >
                    <span>{text}</span>
                    <button
                      onClick={() => removeDetectedText(index)}
                      className="text-sm text-red-400 hover:text-red-600"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-center text-gray-400">
                No signs detected yet.
              </p>
            )}
          </div>
          {/* Sentence Generation Section */}
          <div className="w-full max-w-md bg-gray-800 bg-opacity-70 backdrop-blur-sm rounded-2xl p-4 shadow-xl">
            <h3 className="text-lg font-semibold mb-2 text-center">
              Generate Sentence
            </h3>
            <p className="mb-4 text-center text-sm text-gray-300">
              {detectedTexts.length === 5
                ? `Words: ${detectedTexts.join(" ")}`
                : "Accumulate 5 words to generate a sentence."}
            </p>
            <button
              onClick={handleGenerateSentence}
              disabled={detectedTexts.length !== 5 || isGenerating}
              className={`w-full px-4 py-2 rounded-full ${
                detectedTexts.length === 5
                  ? "bg-purple-600 hover:bg-purple-700"
                  : "bg-gray-500 cursor-not-allowed"
              } text-white`}
            >
              {isGenerating ? "Generating..." : "Generate Sentence"}
            </button>
            {generatedSentence && (
              <p className="mt-4 text-center text-lg font-medium">
                {generatedSentence}
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
