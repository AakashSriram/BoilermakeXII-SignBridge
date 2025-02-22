"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loginWithRedirect, isLoading, error } = useAuth0();
  const [showLoading, setShowLoading] = useState(true);

  console.log("Auth0 Debug →", { isAuthenticated, isLoading, error });

  useEffect(() => {
    if (!isAuthenticated && !isLoading) {
      console.log("Redirecting to Auth0 login...");
      loginWithRedirect().catch((err) => console.error("Auth0 Redirect Error:", err));
    }
  }, [isAuthenticated, isLoading, loginWithRedirect]);

  // 🔄 Ensures the loading screen stays visible for at least 4 seconds
  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (isLoading) {
      setShowLoading(true); // Show loading immediately
      timer = setTimeout(() => {
        setShowLoading(false); // Hide loading after 4 seconds
      }, 4000);
    } else {
      timer = setTimeout(() => setShowLoading(false), 4000); // Ensure min 4s visibility
    }

    return () => clearTimeout(timer); // Cleanup timer
  }, [isLoading]);

  // 🔴 Error State
  if (error) {
    console.error("Auth0 Error:", error);
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900 text-white">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md text-center"
        >
          <h1 className="text-3xl font-bold text-red-500">Authentication Error</h1>
          <p className="mt-3 text-gray-300">{error.message}</p>
          <button
            onClick={() => loginWithRedirect()}
            className="mt-5 rounded-lg bg-red-600 px-6 py-2 font-semibold text-white transition hover:bg-red-500"
          >
            Retry Login
          </button>
        </motion.div>
      </div>
    );
  }

  // ⏳ Simplified & Smooth Loading Animation (Minimum 4 Seconds)
  if (showLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900 text-white">
        <motion.div
          className="h-8 w-8 rounded-full bg-blue-500"
          animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
    );
  }

  // 🔐 Redirecting State
  if (!isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900 text-white">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.5 }}
          className="text-lg"
        >
          Redirecting to login...
        </motion.p>
      </div>
    );
  }

  return <>{children}</>;
}
