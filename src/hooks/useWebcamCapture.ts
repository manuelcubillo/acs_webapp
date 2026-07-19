"use client";

/**
 * useWebcamCapture — encapsulates the browser MediaDevices lifecycle for a
 * single still-photo capture.
 *
 * Responsibilities (UI-free, reusable by any capture surface):
 *  - Request camera access via `getUserMedia`, preferring the rear/environment
 *    camera on mobile when several exist.
 *  - Expose the live `MediaStream` through a `<video>` ref for preview.
 *  - Enumerate video inputs and cycle between them (`switchCamera`).
 *  - Grab the current frame as an image `File` (`capture`).
 *  - Guarantee the stream is released: every track is `stop()`-ed on teardown,
 *    on unmount, and whenever a new stream replaces the old one.
 *
 * Error conditions are normalised into `WebcamErrorKind` so the UI can show a
 * meaningful message for "no camera", "permission denied", an insecure origin,
 * or an unsupported browser.
 *
 * This hook is browser-only; it must be used from a client component.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type WebcamStatus = "idle" | "starting" | "streaming" | "error";

export type WebcamErrorKind =
  | "no-camera"
  | "permission-denied"
  | "insecure-context"
  | "unsupported"
  | "in-use"
  | "unknown";

export interface WebcamError {
  kind: WebcamErrorKind;
  message: string;
}

export interface UseWebcamCaptureResult {
  /** Attach to a `<video autoPlay playsInline muted />` element for preview. */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  status: WebcamStatus;
  error: WebcamError | null;
  /** Available video input devices (labels populate only after permission). */
  devices: MediaDeviceInfo[];
  hasMultipleCameras: boolean;
  /** Request permission and begin streaming (prefers the rear camera). */
  start: () => Promise<void>;
  /** Stop every track and clear the preview. Safe to call repeatedly. */
  stop: () => void;
  /** Cycle to the next available camera. No-op with a single camera. */
  switchCamera: () => Promise<void>;
  /**
   * Capture the current frame as a PNG `File`. PNG keeps the still lossless so
   * the downstream crop + WebP re-encode is the only lossy step. Returns null
   * if the video is not ready.
   */
  capture: () => Promise<File | null>;
}

/** User-facing messages, kept out of JSX in line with the i18n convention. */
const MESSAGES: Record<WebcamErrorKind, string> = {
  "no-camera": "No se detectó ninguna cámara en este dispositivo.",
  "permission-denied": "Permiso de cámara denegado.",
  "insecure-context":
    "La cámara requiere una conexión segura (HTTPS o localhost).",
  unsupported: "Este navegador no permite el acceso a la cámara.",
  "in-use": "La cámara está en uso por otra aplicación.",
  unknown: "No se pudo iniciar la cámara.",
};

/** Map a raw getUserMedia rejection onto a normalised error kind. */
function classifyError(err: unknown): WebcamErrorKind {
  if (err instanceof DOMException) {
    switch (err.name) {
      case "NotAllowedError":
      case "SecurityError":
        return "permission-denied";
      case "NotFoundError":
      case "OverconstrainedError":
        return "no-camera";
      case "NotReadableError":
      case "AbortError":
        return "in-use";
      default:
        return "unknown";
    }
  }
  return "unknown";
}

export function useWebcamCapture(): UseWebcamCaptureResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /** Guards against a stream started by an effect that already unmounted. */
  const mountedRef = useRef(true);

  const [status, setStatus] = useState<WebcamStatus>("idle");
  const [error, setError] = useState<WebcamError | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);

  /** Stop and detach whatever stream is currently live. */
  const stop = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const setErrorState = useCallback((kind: WebcamErrorKind) => {
    setStatus("error");
    setError({ kind, message: MESSAGES[kind] });
  }, []);

  /** Refresh the list of video inputs (labels require an active permission). */
  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const cams = all.filter((d) => d.kind === "videoinput");
      if (mountedRef.current) setDevices(cams);
    } catch {
      // Device enumeration is best-effort; ignore failures.
    }
  }, []);

  /**
   * Attach a freshly obtained stream to the preview element and record the
   * device it resolved to. Replaces any previous stream.
   */
  const attachStream = useCallback(
    async (stream: MediaStream) => {
      // Release a previous stream before swapping in the new one.
      if (streamRef.current && streamRef.current !== stream) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      streamRef.current = stream;

      const track = stream.getVideoTracks()[0];
      setActiveDeviceId(track?.getSettings().deviceId ?? null);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch {
          // Autoplay can reject if the element is not yet visible; the
          // `autoPlay` attribute retries once painted.
        }
      }
    },
    [],
  );

  const openStream = useCallback(
    async (constraints: MediaStreamConstraints) => {
      setStatus("starting");
      setError(null);

      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        // A secure context is the usual cause on http:// origins.
        setErrorState(
          typeof window !== "undefined" && !window.isSecureContext
            ? "insecure-context"
            : "unsupported",
        );
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (!mountedRef.current) {
          // Unmounted while awaiting permission — do not leak the stream.
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        await attachStream(stream);
        await refreshDevices();
        setStatus("streaming");
      } catch (err) {
        if (mountedRef.current) setErrorState(classifyError(err));
      }
    },
    [attachStream, refreshDevices, setErrorState],
  );

  const start = useCallback(async () => {
    // Prefer the rear camera on phones; harmless on single-camera laptops.
    await openStream({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
  }, [openStream]);

  const switchCamera = useCallback(async () => {
    if (devices.length < 2) return;
    const currentIndex = devices.findIndex((d) => d.deviceId === activeDeviceId);
    const next = devices[(currentIndex + 1) % devices.length];
    if (!next) return;
    await openStream({
      video: { deviceId: { exact: next.deviceId } },
      audio: false,
    });
  }, [devices, activeDeviceId, openStream]);

  const capture = useCallback(async (): Promise<File | null> => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return null;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) return null;

    return new File([blob], `webcam-${Date.now()}.png`, { type: "image/png" });
  }, []);

  // Release the camera on unmount — the core safety guarantee of this hook.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stop();
    };
  }, [stop]);

  return {
    videoRef,
    status,
    error,
    devices,
    hasMultipleCameras: devices.length > 1,
    start,
    stop,
    switchCamera,
    capture,
  };
}
