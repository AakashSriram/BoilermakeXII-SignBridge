"use client";

import { useEffect } from "react";
import Script from "next/script"; // Use Next.js Script component
import { Auth0Provider } from "@auth0/auth0-react";
import "@/app/globals.css"; 

export default function RootLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window !== "undefined") {
      console.log("Checking for Holistic:", window.Holistic);
    }
  }, []);

  return (
    <html lang="en">
      <head>
        {/* Dynamically load the MediaPipe Holistic script */}
        <Script
          src="https://cdn.jsdelivr.net/npm/@mediapipe/holistic"
          strategy="beforeInteractive"
          onLoad={() => console.log("Holistic script loaded!")}
          onError={(e) => console.error("Failed to load Holistic script", e)}
        />
        <script
  src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js"
  defer
></script>

      </head>
      <body>
        <Auth0Provider
          domain={process.env.NEXT_PUBLIC_AUTH0_DOMAIN!}
          clientId={process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID!}
          authorizationParams={{
            redirect_uri: process.env.NEXT_PUBLIC_AUTH0_REDIRECT_URI!,
            scope: process.env.NEXT_PUBLIC_AUTH0_SCOPE!,
            audience: process.env.NEXT_PUBLIC_AUTH0_AUDIENCE!,
            responseType: "code",
          }}
          cacheLocation="localstorage"
        >
          {children}
        </Auth0Provider>
      </body>
    </html>
  );
}
