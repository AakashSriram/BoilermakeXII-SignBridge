// app/Auth0ProviderWrapper.tsx
"use client";
import React from "react";
import { Auth0Provider } from "@auth0/auth0-react";
import { useRouter } from "next/navigation";

export default function Auth0ProviderWrapper({ children }: { children: React.ReactNode; }) {
  const router = useRouter();
  const domain = process.env.NEXT_PUBLIC_AUTH0_DOMAIN!;
  const clientId = process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID!;
  const redirectUri = typeof window !== "undefined" ? window.location.origin : "";

  const onRedirectCallback = (appState?: { returnTo?: string }) => {
    router.push(appState?.returnTo || "/");
  };

  return (
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      onRedirectCallback={onRedirectCallback}
      authorizationParams={{
        redirect_uri: redirectUri,
      }}
    >
      {children}
    </Auth0Provider>
  );
}
