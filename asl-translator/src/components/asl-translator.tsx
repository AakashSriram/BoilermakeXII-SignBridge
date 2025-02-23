"use client";

import React, { useState, useEffect, useRef } from "react";
import { Camera as IconCamera, Settings } from "lucide-react";
import { useAuth0 } from "@auth0/auth0-react";
import { motion, AnimatePresence } from "framer-motion";
import { FaAmericanSignLanguageInterpreting } from "react-icons/fa";

// Futuristic loader component
const statuses = [
  "Uploading Video",
  "Processing Video",
  "Running Demographic Predictions",
  "Synthesizing Voice",
  "Generating Speech",
  "Allowing Sync to Work Its Magic"
];

const SimpleGlowLoader = () => {
  const [statusIndex, setStatusIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStatusIndex((prev) => {
        if (prev < statuses.length - 1) {
          return prev + 1;
        } else {
          clearInterval(interval);
          return prev;
        }
      });
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      {/* Glowing Circle */}
      <motion.div
        className="w-20 h-20 bg-blue-500 rounded-full"
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.7, 1, 0.7],
          boxShadow: [
            "0 0 0px rgba(0, 0, 0, 0)",
            "0 0 20px rgba(0, 0, 255, 0.8)",
            "0 0 0px rgba(0, 0, 0, 0)"
          ]
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />
      {/* Loading Text that cycles through statuses */}
      <AnimatePresence mode="wait">
        <motion.p
          key={statuses[statusIndex]}
          className="text-white text-lg mt-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.5 }}
        >
          {statuses[statusIndex]}
        </motion.p>
      </AnimatePresence>
    </div>
  );
};

export default function SignBridge() {
  const finalVideoRef = useRef(null);
  // Use a ref to track removed signs for immediate updates
  const removedSignsRef = useRef<string[]>([]);

  const [demographics, setDemographics] = useState({
    predicted_race: "",
    race_confidence: 0,
    predicted_ethnicity: "",
    ethnicity_confidence: 0,
    predicted_gender: "",
    gender_confidence: 0,
  });

  const { user } = useAuth0();
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [detectedText, setDetectedText] = useState("");
  const [landmarksBatch, setLandmarksBatch] = useState<number[][][]>([]);
  const framesToSend = 20;
  const [detectedTexts, setDetectedTexts] = useState<string[]>([]);
  const [generatedSentence, setGeneratedSentence] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [finalLipsyncedLink, setFinalLipsyncedLink] = useState("");
  const [isGeneratingLipSync, setIsGeneratingLipSync] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const holisticRef = useRef<any>(null);
  const cameraInstanceRef = useRef<any>(null);

  // Reset function to clear all states and refs
  const resetAll = () => {
    setDetectedText("");
    setDetectedTexts([]);
    setGeneratedSentence("");
    setFinalLipsyncedLink("");
    setIsRecording(false);
    setIsGenerating(false);
    setIsGeneratingLipSync(false);
    setLandmarksBatch([]);
    setDemographics({
      predicted_race: "",
      race_confidence: 0,
      predicted_ethnicity: "",
      ethnicity_confidence: 0,
      predicted_gender: "",
      gender_confidence: 0,
    });
    removedSignsRef.current = [];
    // Optionally reset media recorder and camera here if needed.
  };

  useEffect(() => {
    if (finalLipsyncedLink && finalVideoRef.current) {
      finalVideoRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [finalLipsyncedLink]);

  const addDetectedText = (text: string) => {
    setDetectedTexts((prev) => {
      if (
        !text ||
        text === "No signs detected" ||
        prev.length >= 5 ||
        prev.includes(text) ||
        removedSignsRef.current.includes(text)
      ) {
        return prev;
      }
      return [...prev, text];
    });
  };

  const removeDetectedText = (index: number) => {
    setDetectedTexts((prev) => {
      const removed = prev[index];
      if (removed) {
        removedSignsRef.current = [...removedSignsRef.current, removed];
      }
      return prev.filter((_, i) => i !== index);
    });
  };

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

  const extract = (landmarks: any, count: number) => {
    if (!landmarks || landmarks.length === 0) {
      return Array(count).fill({ x: 0, y: 0, z: 0 });
    }
    if (landmarks.length < count) {
      const missing = Array(count - landmarks.length).fill({ x: 0, y: 0, z: 0 });
      return [...landmarks, ...missing];
    }
    return landmarks.slice(0, count);
  };

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

  const uploadAudio = async (sentence: string) => {
    try {
      const response = await fetch("http://localhost:8000/uploadaudio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sentence, name: user.name }),
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        console.log("Audio uploaded successfully:", data);
      } else {
        console.error("Failed to upload audio.");
      }
    } catch (error) {
      console.error("Error uploading audio:", error);
    }
  };

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
        startRecording();
      } else {
        console.error(
          "Camera initialization error. Ensure the video element is mounted and window.Camera is defined."
        );
      }
    } else {
      if (cameraInstanceRef.current) {
        cameraInstanceRef.current.stop();
      }
      stopRecording();
      setIsGeneratingLipSync(true);
    }
    setIsRecording((prev) => !prev);
  };

  const startRecording = async () => {
    setIsGeneratingLipSync(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 800, height: 600 },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        console.log("Video stream attached to video element.");
        const videoTracks = stream.getVideoTracks();
        if (videoTracks.length > 0) {
          console.log("Video track readyState:", videoTracks[0].readyState);
          console.log("Video track label:", videoTracks[0].label);
        } else {
          console.error("No video tracks found in the stream!");
          return;
        }
      } else {
        console.error("Video element not found!");
        return;
      }
      recordedChunksRef.current = [];
      const mimeType = "video/webm";
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        console.error(`MIME type ${mimeType} is not supported in this browser.`);
        return;
      } else {
        console.log(`MIME type ${mimeType} is supported.`);
      }
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current.ondataavailable = (event) => {
        console.log("Data available from MediaRecorder:", event.data.size, "bytes");
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };
      mediaRecorderRef.current.onstart = () => {
        console.log("MediaRecorder started recording.");
      };
      mediaRecorderRef.current.onstop = () => {
        console.log("MediaRecorder stopped.");
        if (recordedChunksRef.current.length > 0) {
          const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
          console.log("Final Blob size:", blob.size);
          if (blob.size > 0) {
            uploadVideoToBackend(blob);
          } else {
            console.error("The recorded video blob is empty!");
          }
        } else {
          console.error("No recorded chunks available!");
        }
        recordedChunksRef.current = [];
      };
      mediaRecorderRef.current.onerror = (error) => {
        console.error("MediaRecorder error:", error);
      };
      mediaRecorderRef.current.start(1000);
      console.log("Recording started");
    } catch (error) {
      console.error("Error accessing media devices or starting recording:", error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      console.log("Stopping recording...");
      setTimeout(() => {
        mediaRecorderRef.current?.stop();
        if (generatedSentence) {
          uploadAudio(generatedSentence);
        }
      }, 1000);
    } else {
      console.warn("MediaRecorder is not in a recording state.");
    }
    if (cameraInstanceRef.current) {
      console.log("Stopping MediaPipe camera...");
      cameraInstanceRef.current.stop();
      cameraInstanceRef.current = null;
    }
    setIsGeneratingLipSync(true);
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      const tracks = stream.getTracks();
      tracks.forEach((track) => {
        console.log(`Stopping track: ${track.kind}`);
        track.stop();
      });
      videoRef.current.srcObject = null;
    }
    console.log("Recording and camera stopped");
  };

  const uploadVideoToBackend = async (blob: Blob) => {
    const formData = new FormData();
    formData.append("file", blob, "recorded_video.webm");
    console.log("FormData created, uploading to backend...");
    try {
      const response = await fetch("http://localhost:8000/uploadvideo", {
        method: "POST",
        body: formData,
      });
      if (response.ok) {
        const data = await response.json();
        console.log("Video uploaded to Google Drive:", data.shareable_link);
        console.log("Final lipsynced link:", data.final_lipsynced_link);
        setFinalLipsyncedLink(data.final_lipsynced_link);
        if (data.predicted_race) {
          setDemographics({
            predicted_race: data.predicted_race,
            race_confidence: data.race_confidence,
            predicted_ethnicity: data.predicted_ethnicity,
            ethnicity_confidence: data.ethnicity_confidence,
            predicted_gender: data.predicted_gender,
            gender_confidence: data.gender_confidence,
          });
        }
      } else {
        console.error("Failed to upload video to the backend.");
      }
    } catch (error) {
      console.error("Error uploading video:", error);
    }
  };

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
      className={`min-h-screen overflow-y-auto overflow-x-hidden font-sans flex flex-col transition-colors duration-500 ${
        isDarkMode
          ? "bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white"
          : "bg-gradient-to-br from-gray-200 via-gray-300 to-gray-400 text-gray-900"
      }`}
    >
      {/* Navbar */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-gray-500">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center p-4 bg-gradient-to-br from-purple-800 to-blue-900 rounded-full shadow-md hover:shadow-lg transition-all duration-300">
            <FaAmericanSignLanguageInterpreting size={30} className="text-gray-300" />
          </div>
          <span
            className="text-3xl font-light tracking-wide text-white drop-shadow-md"
            style={{ fontFamily: "Poppins, sans-serif" }}
          >
            SignBridge
          </span>
        </div>
        <div className="flex items-center gap-4">
          <button className="p-2 rounded-full hover:bg-gray-700 transition-colors">
            <Settings size={24} />
          </button>
          {user && (
            <div className="flex items-center gap-2">
              <img
                src={user.picture}
                alt={user.name}
                className="w-10 h-10 rounded-full border-2 border-blue-400 shadow-md"
              />
              <span className="text-lg font-medium bg-opacity-20 p-1 px-3 rounded-md">{user.name}</span>
            </div>
          )}
        </div>
      </nav>

      {/* Main Content: Two-column layout */}
      <main className="flex flex-grow flex-col lg:flex-row items-center justify-center p-4">
        {/* Left: Camera Feed */}
        <div className="w-full lg:w-1/2 p-2 flex justify-center">
          <AnimatePresence mode="wait">
            {!isGeneratingLipSync ? (
              <div className="relative w-full max-w-3xl rounded-3xl overflow-hidden shadow-2xl">
                <motion.div
                  key="video-container"
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="relative"
                >
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
                </motion.div>
              </div>
            ) : (
              <SimpleGlowLoader />
            )}
          </AnimatePresence>
        </div>

        {/* Right: Controls and Predictions */}
        <div className="w-full lg:w-1/2 p-2 flex flex-col items-center justify-center">
          <div className="bg-gray-800 bg-opacity-70 backdrop-blur-sm rounded-2xl p-8 shadow-xl w-full max-w-md mb-6">
            <h2 className="text-xl font-semibold mb-4 text-center">Detected Sign</h2>
            <p className="text-2xl tracking-wider text-center">
              {detectedText || "Waiting for prediction..."}
            </p>
          </div>

          {/* Detected Signs History */}
          <div className="w-full max-w-md bg-gray-800 bg-opacity-70 backdrop-blur-sm rounded-2xl p-4 shadow-xl mb-6">
            <h3 className="text-lg font-semibold mb-2 text-center">Detected Signs History</h3>
            {detectedTexts.length > 0 ? (
              <ul className="space-y-2">
                {detectedTexts.map((text, index) => (
                  <li key={index} className="flex items-center justify-between bg-gray-700 rounded-lg p-2">
                    <span>{text}</span>
                    <button onClick={() => removeDetectedText(index)} className="text-sm text-red-400 hover:text-red-600">
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-center text-gray-400">No signs detected yet.</p>
            )}
          </div>

          {/* Sentence Generation */}
          <div className="w-full max-w-md bg-gray-800 bg-opacity-70 backdrop-blur-sm rounded-2xl p-4 shadow-xl">
            <h3 className="text-lg font-semibold mb-2 text-center">Generate Sentence</h3>
            <p className="mb-4 text-center text-sm text-gray-300">
              {detectedTexts.length === 5
                ? `Words: ${detectedTexts.join(" ")}`
                : "Accumulate 5 words to generate a sentence."}
            </p>
            <button
              onClick={handleGenerateSentence}
              disabled={detectedTexts.length !== 5 || isGenerating}
              className={`w-full px-4 py-2 rounded-full ${
                detectedTexts.length === 5 ? "bg-purple-600 hover:bg-purple-700" : "bg-gray-500 cursor-not-allowed"
              } text-white`}
            >
              {isGenerating ? "Generating..." : "Generate Sentence"}
            </button>
            {generatedSentence && <p className="mt-4 text-center text-lg font-medium">{generatedSentence}</p>}
          </div>
        </div>
      </main>

      {finalLipsyncedLink && (
        <section ref={finalVideoRef} className="min-h-screen w-full flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-6xl bg-gradient-to-br from-gray-900 via-gray-800 to-black bg-opacity-90 backdrop-blur-lg rounded-3xl shadow-2xl p-12 flex flex-col lg:flex-row">
            {/* Left: Final Video */}
            <div className="lg:w-2/3 w-full relative pb-[56.25%] lg:pb-0">
              <video
                src={finalLipsyncedLink}
                controls
                autoPlay
                className="absolute lg:relative top-0 left-0 w-full h-full object-contain rounded-3xl"
              />
            </div>
            {/* Right: Smaller Demographics Card with Download and Reset Buttons */}
            <div className="lg:w-1/3 w-full mt-6 lg:mt-0 lg:ml-8 flex flex-col items-center">
  <div className="relative p-4 h-full rounded-2xl overflow-hidden shadow-md w-full">
    <div className="absolute h-full inset-0 bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 opacity-30 blur-md"></div>
    <div className="relative z-10 h-full bg-black bg-opacity-75 p-4 rounded-2xl border border-gray-700">
      <h3 className="text-3xl font-bold mb-3 text-center text-white drop-shadow-lg">
        Demographic Predictions
      </h3>
      <div className="flex flex-col space-y-4">
        <motion.p
          className="text-lg text-white"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <span className="font-semibold">Race:</span> {demographics.predicted_race || "N/A"}{" "}
          ({demographics.race_confidence ? (demographics.race_confidence * 100).toFixed(2) : "N/A"}%)
        </motion.p>
        <motion.p
          className="text-lg text-white"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          <span className="font-semibold">Ethnicity:</span> {demographics.predicted_ethnicity || "N/A"}{" "}
          ({demographics.ethnicity_confidence ? (demographics.ethnicity_confidence * 100).toFixed(2) : "N/A"}%)
        </motion.p>
        <motion.p
          className="text-lg text-white"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.0 }}
        >
          <span className="font-semibold">Gender:</span> {demographics.predicted_gender || "N/A"}{" "}
          ({demographics.gender_confidence ? (demographics.gender_confidence * 100).toFixed(2) : "N/A"}%)
        </motion.p>
      </div>
    </div>
  </div>
  <div className="flex mt-4 space-x-4">
    <a
      href={finalLipsyncedLink}
      download="final_video.webm"
      className="inline-block px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-full shadow transition-colors duration-300"
    >
      Download Video
    </a>
    <button
      onClick={resetAll}
      className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-full shadow transition-colors duration-300"
    >
      Reset
    </button>
  </div>
</div>

          </div>
        </section>
      )}
    </div>
  );
}
