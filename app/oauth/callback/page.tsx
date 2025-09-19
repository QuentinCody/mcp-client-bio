"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

const SUCCESS_MESSAGE = "Authentication complete. You can close this window.";
const ERROR_MESSAGE = "Authentication failed. Please return to the application.";
const DEFAULT_MESSAGE = "Completing authentication…";

export default function OAuthCallbackPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background text-foreground px-6">
      <div className="max-w-md w-full text-center space-y-4">
        <h1 className="text-xl font-semibold">BioMCP Authentication</h1>
        <Suspense fallback={<StatusMessage message={DEFAULT_MESSAGE} />}>
          <CallbackStatus />
        </Suspense>
      </div>
    </main>
  );
}

function CallbackStatus() {
  const searchParams = useSearchParams();
  const [statusMessage, setStatusMessage] = useState(DEFAULT_MESSAGE);
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error") || searchParams.get("error_description");
    const provider = searchParams.get("provider");

    if (typeof window === "undefined") return;

    const payload = {
      type: "mcp-oauth-callback",
      code,
      state,
      error,
      provider,
    };

    if (window.opener && !window.opener.closed) {
      try {
        window.opener.postMessage(payload, window.location.origin);
      } catch (postMessageError) {
        console.error("Failed to post OAuth callback message", postMessageError);
      }

      const success = !error && !!code;
      setStatusMessage(success ? SUCCESS_MESSAGE : ERROR_MESSAGE);
      window.setTimeout(() => {
        try {
          window.close();
        } catch {
          // Some browsers block programmatic close; ignore.
        }
      }, 1200);
    } else {
      setStatusMessage(
        error
          ? ERROR_MESSAGE
          : "Authentication received. You may return to the application to continue."
      );
    }
  }, [searchParams]);

  return <StatusMessage message={statusMessage} />;
}

function StatusMessage({ message }: { message: string }) {
  return <p className="text-sm text-muted-foreground leading-relaxed">{message}</p>;
}
