"use client";

/**
 * ImageCropDialog — interactive crop step shared by every photo source.
 *
 * Wraps `react-easy-crop` inside the shadcn `Dialog`. The user pans/zooms the
 * image inside a fixed crop frame and (optionally) switches the frame's aspect
 * ratio. On confirm it reports the chosen region as a source-pixel `cropRect`
 * plus the original `File`; the caller runs it through `optimizeImage` with the
 * profile it owns. This keeps the cropper decoupled from storage kinds.
 *
 * Note on "Free": react-easy-crop is a pan/zoom cropper with a fixed-aspect
 * frame (it has no free-drag handles). "Free" therefore means "keep the
 * source image's own aspect ratio" — the whole frame at min zoom, trimmed as
 * the user zooms — while the presets impose a square or portrait ratio.
 *
 * The `<img>` the cropper renders is data (an object URL) — that URL is the
 * only inline runtime value here; all chrome uses tokens + shadcn primitives.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Cropper, { type Area, type MediaSize, type Point } from "react-easy-crop";
import { ZoomIn, ZoomOut } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { PixelCropRect } from "@/lib/images";

const TEXT = {
  title:        "Recortar foto",
  description:  "Ajusta el encuadre, la proporción y el zoom antes de guardar.",
  aspectLabel:  "Proporción",
  zoomLabel:    "Zoom",
  free:         "Libre",
  square:       "1:1",
  portrait:     "3:4",
  cancel:       "Cancelar",
  confirm:      "Aplicar recorte",
} as const;

/** Aspect presets. `null` = follow the source image's natural aspect. */
type AspectPreset = "free" | "square" | "portrait";

const ASPECT_VALUE: Record<AspectPreset, number | null> = {
  free: null,
  square: 1,
  portrait: 3 / 4,
};

const ASPECT_ORDER: AspectPreset[] = ["free", "square", "portrait"];
const ASPECT_TEXT: Record<AspectPreset, string> = {
  free: TEXT.free,
  square: TEXT.square,
  portrait: TEXT.portrait,
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

interface ImageCropDialogProps {
  /** Source image to crop. When null the dialog renders nothing. */
  file: File | null;
  open: boolean;
  /** Confirmed: hand back the original file and the chosen pixel crop rect. */
  onConfirm: (file: File, cropRect: PixelCropRect) => void;
  /** Cancelled or dismissed without cropping. */
  onCancel: () => void;
}

export default function ImageCropDialog({
  file,
  open,
  onConfirm,
  onCancel,
}: ImageCropDialogProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [preset, setPreset] = useState<AspectPreset>("free");
  const [naturalAspect, setNaturalAspect] = useState(3 / 4);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  // Object URL for the current file, created in render and revoked when the
  // file changes or the component unmounts (no setState in an effect).
  const imageUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );
  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  // Reset transient crop state whenever a new source file is opened, using the
  // "adjust state during render" pattern (React's recommended alternative to a
  // reset effect). `file` is a fresh reference per pick/capture.
  const [sessionFile, setSessionFile] = useState<File | null>(file);
  if (file !== sessionFile) {
    setSessionFile(file);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setPreset("free");
    setCroppedAreaPixels(null);
  }

  const effectiveAspect = ASPECT_VALUE[preset] ?? naturalAspect;

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const onMediaLoaded = useCallback((media: MediaSize) => {
    if (media.naturalWidth > 0 && media.naturalHeight > 0) {
      setNaturalAspect(media.naturalWidth / media.naturalHeight);
    }
  }, []);

  const handleConfirm = useCallback(() => {
    if (!file || !croppedAreaPixels) return;
    onConfirm(file, {
      x: croppedAreaPixels.x,
      y: croppedAreaPixels.y,
      width: croppedAreaPixels.width,
      height: croppedAreaPixels.height,
    });
  }, [file, croppedAreaPixels, onConfirm]);

  const zoomValue = useMemo(() => [zoom], [zoom]);

  if (!file) return null;

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

        {/* Crop stage — react-easy-crop fills this relatively-positioned box.
            Flexible height so the presets, zoom and footer below stay visible. */}
        <div className="relative min-h-[180px] w-full flex-1 overflow-hidden rounded-lg bg-neutral-950">
          {imageUrl && (
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              aspect={effectiveAspect}
              minZoom={MIN_ZOOM}
              maxZoom={MAX_ZOOM}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              onMediaLoaded={onMediaLoaded}
              showGrid
            />
          )}
        </div>

        {/* Aspect presets */}
        <div className="flex shrink-0 flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground">
            {TEXT.aspectLabel}
          </span>
          <div className="flex gap-2">
            {ASPECT_ORDER.map((key) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={preset === key ? "default" : "outline"}
                onClick={() => setPreset(key)}
                className={cn("min-w-16")}
              >
                {ASPECT_TEXT[key]}
              </Button>
            ))}
          </div>
        </div>

        {/* Zoom */}
        <div className="flex shrink-0 flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground">
            {TEXT.zoomLabel}
          </span>
          <div className="flex items-center gap-3">
            <ZoomOut className="size-4 shrink-0 text-muted-foreground" />
            <Slider
              value={zoomValue}
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              onValueChange={(v) => setZoom(v[0] ?? 1)}
              aria-label={TEXT.zoomLabel}
            />
            <ZoomIn className="size-4 shrink-0 text-muted-foreground" />
          </div>
        </div>

        <DialogFooter className="shrink-0">
          <Button type="button" variant="outline" onClick={onCancel}>
            {TEXT.cancel}
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!croppedAreaPixels}
          >
            {TEXT.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
