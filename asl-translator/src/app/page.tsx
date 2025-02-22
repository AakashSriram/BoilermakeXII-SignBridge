"use client";

import React from "react";
import { useAuth0 } from "@auth0/auth0-react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import SignBrige from "@/components/asl-translator"; // Adjust path if necessary

export default function ProtectedPage() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white">
        <SignBrige />
      </div>
    </ProtectedRoute>
  );
}