"use client";

/**
 * WebcamCaptureDialog — UI shell around `useWebcamCapture`.
 *
 * Shows a live camera preview inside the shadcn `Dialog`, a capture button, a
 * camera switch when more than one camera exists, and clear messaging for the
 * "no camera", "permission denied", "insecure origin" and "unsupported" cases.
 *
 * The stream is started when the dialog opens and stopped when it closes,
 * after a capture, or on unmount (the hook guarantees track release). On a
 * successful capture the still `File` is handed to the parent, which routes it
 * into the crop step.
 *
 * The `<video>` `srcObject` is live runtime media (set by the hook); all other
 * chrome uses tokens + shadcn primitives.
 */

import { useEffect } from "react";
import { Camera, Loader2, SwitchCamera, TriangleAlert } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useWebcamCapture } from "@/hooks/useWebcamCapture";

const TEXT = {
  title:        "Tomar foto",
  description:  "Vista previa de la cámara. Captura una foto o cambia de cámara.",
  starting:     "Iniciando cámara…",
  capture:      "Capturar",
  switchCamera: "Cambiar cámara",
  retry:        "Reintentar",
  cancel:       "Cancelar",
} as const;

interface WebcamCaptureDialogProps {
  open: boolean;
  /** A still frame was captured. The stream is already stopped. */
  onCapture: (file: File) => void;
  /** Dismissed without capturing. */
  onCancel: () => void;
}

export default function WebcamCaptureDialog({
  open,
  onCapture,
  onCancel,
}: WebcamCaptureDialogProps) {
  const {
    videoRef,
    status,
    error,
    hasMultipleCameras,
    start,
    stop,
    switchCamera,
    capture,
  } = useWebcamCapture();

  // Start streaming while open; release the camera as soon as it closes.
  useEffect(() => {
    if (open) {
      void start();
    } else {
      stop();
    }
  }, [open, start, stop]);

  async function handleCapture() {
    const file = await capture();
    if (file) {
      // Release the camera immediately once we have the frame.
      stop();
      onCapture(file);
    }
  }

  const isStreaming = status === "streaming";
  const isStarting = status === "starting" || status === "idle";
  const isError = status === "error";
  // Permission / hardware errors are recoverable with a retry.
  const canRetry =
    isError && (error?.kind === "permission-denied" || error?.kind === "in-use");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent className="flex max-h-[90dvh] flex-col gap-4 sm:max-w-2xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>{TEXT.title}</DialogTitle>
          <DialogDescription className="sr-only">
            {TEXT.description}
          </DialogDescription>
        </DialogHeader>

        {/* Flexible media area: grows to fill, shrinks so the footer stays put. */}
        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg bg-neutral-950">
          {/* The video is always mounted so the hook's ref can attach to it. */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-contain"
          />

          {isStarting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-white/80">
              <Loader2 className="size-6 animate-spin" />
              {TEXT.starting}
            </div>
          )}

          {isError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
              <TriangleAlert className="size-7 text-destructive" />
              <p className="text-sm font-medium text-white/90">
                {error?.message}
              </p>
            </div>
          )}

          {isStreaming && hasMultipleCameras && (
            <Button
              type="button"
              size="icon"
              variant="secondary"
              onClick={() => void switchCamera()}
              aria-label={TEXT.switchCamera}
              title={TEXT.switchCamera}
              className="absolute right-3 top-3"
            >
              <SwitchCamera className="size-4" />
            </Button>
          )}
        </div>

        <DialogFooter className="shrink-0 sm:justify-between">
          <Button type="button" variant="outline" onClick={onCancel}>
            {TEXT.cancel}
          </Button>

          {canRetry ? (
            <Button type="button" onClick={() => void start()}>
              {TEXT.retry}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => void handleCapture()}
              disabled={!isStreaming}
            >
              <Camera className="size-4" />
              {TEXT.capture}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
