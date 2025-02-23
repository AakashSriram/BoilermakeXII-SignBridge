"use client";

import React, { useState, useEffect, useRef } from "react";
import { Camera as IconCamera, Settings } from "lucide-react";
import { useAuth0 } from "@auth0/auth0-react";
import { motion, AnimatePresence } from "framer-motion";
import { FaAmericanSignLanguageInterpreting } from "react-icons/fa";
import * as THREE from "three";

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
        if (prev < statuses.length - 1) return prev + 1;
        else {
          clearInterval(interval);
          return prev;
        }
      });
    }, 3000);
    return () => clearInterval(interval);
  }, []);
  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
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
  // Mode state: "hearingAbled" or "hearingDisabled"
  const [mode, setMode] = useState("hearingDisabled");

  // Refs and state
  const finalVideoRef = useRef(null);
  const containerRef = useRef(null); // For THREE.js reference rendering
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

  // Media recorder and THREE.js refs.
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const holisticRef = useRef<any>(null);
  const cameraInstanceRef = useRef<any>(null);


// Add this function inside your SignBridge component, alongside your other functions.
// Add these functions inside your SignBridge component:

// This function will run through each word in the phrase sequentially.
const [currentWord, setCurrentWord] = useState("");
const [fullTranscript, setFullTranscript] = useState("");

// Function to run through each word in the phrase sequentially.
const runPhrase = (phrase) => {
  const words = phrase.split(/\s+/);
  words.forEach((word, index) => {
    setTimeout(() => {
      setCurrentWord(word);
      console.log("Animating word:", word);
    }, index * 3000); // Adjust the delay as needed.
  });
};

// Modified speech recognition function.
const startSpeechRecognition = () => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("Speech Recognition is not supported in your browser.");
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    console.log("Recognized:", transcript);
    // Store the full phrase.
    setFullTranscript(transcript);
    const words = transcript.split(/\s+/);
    if (words.length > 1) {
      runPhrase(transcript);
    } else {
      setCurrentWord(transcript);
    }
  };
  recognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
  };
  recognition.start();
};


  // Reset function to clear all states and refs.
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
  };

  // Scroll into view when final lipsynced link is set.
  useEffect(() => {
    if (finalLipsyncedLink && finalVideoRef.current) {
      finalVideoRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [finalLipsyncedLink]);

  const addDetectedText = (text: string) => {
    setDetectedTexts((prev) => {
      if (!text || text === "No signs detected" || prev.includes(text) || removedSignsRef.current.includes(text))
        return prev;
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

  // Initialize Holistic for sign detection (remains active regardless of mode)
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
    const leftIsEmpty = leftHandLandmarks.every((lm: any) => lm.x === 0 && lm.y === 0 && lm.z === 0);
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

  // Toggle recording: starts/stops camera and recording based on isRecording state.
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
    if (detectedTexts.length < 2) {
      console.warn("Need at least 2 words to generate a sentence.");
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

  // Conditionally run the reference renderer only if mode is "hearingAbled"
  useEffect(() => {
    if (mode !== "hearingAbled") return;
    const container = containerRef.current;
    if (!container) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x253238);
    
    const cam = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    cam.position.set(150, -150, 120);
    
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);
  
    const drawPoint = (x, y, z) => {
      const geometry = new THREE.SphereGeometry(1.5, 32, 16);
      const material = new THREE.MeshBasicMaterial({ color: 0x84ffff });
      const sphere = new THREE.Mesh(geometry, material);
      sphere.position.set(x, y, z);
      scene.add(sphere);
    };
  
    const drawLine = (x1, y1, z1, x2, y2, z2) => {
      const points = [
        new THREE.Vector3(x1, y1, z1),
        new THREE.Vector3(x2, y2, z2),
      ];
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({ color: 0xffffff });
      const line = new THREE.Line(geometry, material);
      scene.add(line);
    };
  
    const connectLines = (left, right) => {
      const edgeList = [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
        [0, 5],
        [5, 6],
        [6, 7],
        [7, 8],
        [5, 9],
        [9, 10],
        [10, 11],
        [11, 12],
        [9, 13],
        [13, 14],
        [14, 15],
        [15, 16],
        [13, 17],
        [17, 18],
        [18, 19],
        [19, 20],
        [0, 17],
      ];
      edgeList.forEach(([u, v]) => {
        if (left[u] && left[v]) {
          const l1 = left[u]["Coordinates"];
          const l2 = left[v]["Coordinates"];
          drawLine(
            l1[0] * 200,
            l1[1] * -200,
            l1[2] * 200,
            l2[0] * 200,
            l2[1] * -200,
            l2[2] * 200
          );
        }
        if (right[u] && right[v]) {
          const r1 = right[u]["Coordinates"];
          const r2 = right[v]["Coordinates"];
          drawLine(
            r1[0] * 200,
            r1[1] * -200,
            r1[2] * 200,
            r2[0] * 200,
            r2[1] * -200,
            r2[2] * 200
          );
        }
      });
    };
  
    const clearScene = () => {
      while (scene.children.length > 0) {
        scene.remove(scene.children[0]);
      }
    };
  
    fetch("/json/reference.json")
      .then((res) => res.json())
      .then((data) => {
        if (currentWord && data[currentWord]) {
          console.log("Animating word:", currentWord);
          const frames = data[currentWord];
          let frameIndex = 0;
          const fps = 24;
          const frameDelay = 1000 / fps;
  
          const animate = () => {
            if (frameIndex < frames.length) {
              clearScene();
              const frame = frames[frameIndex];
              const left = frame["Left Hand Coordinates"];
              const right = frame["Right Hand Coordinates"];
  
              left.forEach((joint) => {
                const coords = joint["Coordinates"];
                drawPoint(coords[0] * 200, coords[1] * -200, coords[2] * 200);
              });
              right.forEach((joint) => {
                const coords = joint["Coordinates"];
                drawPoint(coords[0] * 200, coords[1] * -200, coords[2] * 200);
              });
              connectLines(left, right);
              renderer.render(scene, cam);
              frameIndex++;
              setTimeout(animate, frameDelay);
            } else {
              renderer.render(scene, cam);
              console.log("Animation completed for word:", currentWord);
            }
          };
          animate();
        } else {
          console.log("No valid currentWord found in JSON");
          renderer.render(scene, cam);
        }
      })
      .catch((error) => {
        console.error("Error loading reference.json:", error);
      });
  
    return () => {
      container.removeChild(renderer.domElement);
    };
  }, [containerRef, currentWord, mode]);

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
          {/* Mode toggle buttons */}
          <button
            onClick={() => setMode("hearingDisabled")}
            className={`px-4 py-2 rounded ${
              mode === "hearingDisabled" ? "bg-blue-600" : "bg-gray-600"
            } text-white`}
          >
            Hearing Disabled
          </button>
          <button
            onClick={() => setMode("hearingAbled")}
            className={`px-4 py-2 rounded ${
              mode === "hearingAbled" ? "bg-blue-600" : "bg-gray-600"
            } text-white`}
          >
            Hearing Abled
          </button>
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
              <span className="text-lg font-medium bg-opacity-20 p-1 px-3 rounded-md">
                {user.name}
              </span>
            </div>
          )}
        </div>
      </nav>

      {/* Render sections based on mode */}
      {mode === "hearingAbled" ? (
        // Only show the animate (reference renderer) section and word form for Hearing Abled mode
        <>
  {/* Top section: Speech recognition control */}
  <div className="flex flex-col items-center justify-center py-8 bg-gradient-to-r from-blue-500 to-purple-600 shadow-lg rounded-lg mx-4">
    <h2 className="text-2xl font-bold text-white mb-4">Speak to Animate</h2>
    <button
      onClick={startSpeechRecognition}
      className="px-6 py-3 bg-white text-blue-600 rounded-full font-semibold shadow-lg hover:bg-gray-200 transition-colors"
    >
      Start Listening
    </button>
    <p className="mt-4 text-lg text-white">
      {currentWord ? `Animating: ${currentWord}` : "Awaiting your voice..."}
    </p>
  </div>

  {/* Main content: Two-column layout */}
  <div className="flex flex-col lg:flex-row mt-6 mx-4 gap-4">
    {/* Left column: Reference animation */}
    <div
      ref={containerRef}
      className="lg:w-2/3 bg-black rounded-lg shadow-2xl overflow-hidden"
      style={{ height: "500px" }}
    />
    {/* Right column: Transcribed text */}
    <div className="lg:w-1/3 bg-gray-800 p-6 rounded-lg shadow-md flex flex-col items-center">
      <h3 className="text-xl font-semibold text-white mb-2">Transcribed Text</h3>
      <p className="px-4 py-2 bg-gray-700 text-white rounded-lg shadow-md text-center">
        {fullTranscript || "Nothing transcribed yet."}
      </p>
    </div>
  </div>
</>

      ) : (
        // Full interface for Hearing Disabled mode.
        <>
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
              <div
                className={`w-full max-w-md bg-gray-800 bg-opacity-70 backdrop-blur-sm rounded-2xl p-4 shadow-xl mb-6 ${
                  detectedTexts.length > 5 ? "overflow-y-auto max-h-60" : ""
                }`}
              >
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
                <h3 className="text-lg font-semibold mb-2 text-center">Generate Sentences</h3>
                <p className="mb-4 text-center text-sm text-gray-300">
                  {detectedTexts.length >= 2
                    ? `Words: ${detectedTexts.join(" ")}`
                    : "Accumulate at least 2 words to generate a sentence."}
                </p>
                <button
                  onClick={handleGenerateSentence}
                  disabled={detectedTexts.length < 2 || isGenerating}
                  className={`w-full px-4 py-2 rounded-full ${
                    detectedTexts.length >= 2 ? "bg-purple-600 hover:bg-purple-700" : "bg-gray-500 cursor-not-allowed"
                  } text-white`}
                >
                  {isGenerating ? "Generating..." : "Generate Sentences"}
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
                {/* Right: Demographics Card with Download and Reset Buttons */}
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
        </>
      )}
    </div>
  );
}
