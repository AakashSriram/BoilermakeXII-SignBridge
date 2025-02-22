// app/layout.tsx
import "./globals.css";
import Script from "next/script";

export const metadata = {
  title: "ASL Translator",
  description: "Translate ASL to text",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Load MediaPipe scripts before your interactive code */}
        <Script
          src="https://cdn.jsdelivr.net/npm/@mediapipe/holistic/holistic.js"
          strategy="beforeInteractive"
        />
        <Script
          src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js"
          strategy="beforeInteractive"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
