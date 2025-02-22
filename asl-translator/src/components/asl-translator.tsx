"use client"

import React, { useState, useRef } from 'react';
import { Camera, Mic, Sun, Moon, Settings } from 'lucide-react';

const ASLTranslator = () => {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [detectedText, setDetectedText] = useState('');
  const videoRef = useRef(null);

  // Start camera feed
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
    }
  };

  const toggleRecording = () => {
    if (!isRecording) {
      startCamera();
    } else {
      // Stop the camera
      const stream = videoRef.current?.srcObject;
      stream?.getTracks().forEach(track => track.stop());
    }
    setIsRecording(!isRecording);
  };

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}`}>
      {/* Navbar */}
      <nav className="flex items-center justify-between p-4 border-b">
        <div className="text-xl font-bold">ASL Translator</div>
        <div className="flex gap-4">
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            {isDarkMode ? <Sun size={24} /> : <Moon size={24} />}
          </button>
          <button className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">
            <Settings size={24} />
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="container mx-auto p-4 max-w-4xl">
        {/* Camera Feed */}
        <div className="relative aspect-video bg-gray-800 rounded-lg overflow-hidden mb-4">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          <button
            onClick={toggleRecording}
            className="absolute bottom-4 right-4 bg-blue-500 text-white p-2 rounded-full hover:bg-blue-600"
          >
            {isRecording ? <Camera size={24} /> : <Camera size={24} />}
          </button>
        </div>

        {/* Text Display */}
        <div className="mb-4">
          <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg min-h-24">
            <p className="text-lg">{detectedText || 'Detected text will appear here...'}</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex gap-4">
          <button 
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            onClick={() => setDetectedText('')}
          >
            Clear Text
          </button>
          <button className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600">
            <Mic className="inline mr-2" size={18} />
            Speak Text
          </button>
        </div>
      </main>
    </div>
  );
};

export default ASLTranslator;