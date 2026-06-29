"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Heart, Loader2, CheckCircle2 } from "lucide-react";
import { submitDepartureFeedbackAction } from "@/lib/actions/account";
import { AuthShell } from "@/components/auth/AuthShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const LABELS = {
  title: "Tu cuenta ha sido eliminada",
  subtitle: "Gracias por haber confiado en nosotros.",
  feedbackQuestion: "¿Quieres contarnos por qué te vas?",
  feedbackOptional: "(opcional)",
  commentPlaceholder: "Cuéntanos más (opcional)…",
  submit: "Enviar comentario",
  submitting: "Enviando…",
  skip: "No, gracias",
  backToLogin: "Volver al inicio de sesión",
  thankYouTitle: "¡Gracias por tu feedback!",
  thankYouBody: "Lo tendremos en cuenta para seguir mejorando.",
  footer: "Sistema de Control de Acceso",
  errorFallback: "Error al enviar el comentario",
} as const;

const REASON_PLACEHOLDER = "Selecciona un motivo (opcional)";
const REASON_OPTIONS = [
  { value: "no_longer_needed", label: "Ya no lo necesito" },
  { value: "too_complex", label: "Es demasiado complejo de usar" },
  { value: "missing_features", label: "Faltan funcionalidades que necesito" },
  { value: "switching_product", label: "Cambio a otro producto" },
  { value: "cost", label: "El coste no se ajusta a mis necesidades" },
  { value: "other", label: "Otro motivo" },
];

export default function GoodbyeClient() {
  const searchParams = useSearchParams();
  const feedbackId = searchParams.get("fid");

  const [submitted, setSubmitted] = useState(false);
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!feedbackId) { setSubmitted(true); return; }
    setError(null);
    setIsLoading(true);
    const result = await submitDepartureFeedbackAction({
      feedbackId,
      reason: reason || null,
      comment: comment || null,
    });
    setIsLoading(false);
    if (result.success) {
      setSubmitted(true);
    } else {
      setError(result.error ?? LABELS.errorFallback);
    }
  }

  return (
    <AuthShell footer={LABELS.footer}>
      {submitted ? (
        /* ── Thank-you view — neutral confirmation (not a state outcome). ── */
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-accent">
            <CheckCircle2 className="size-6 text-primary" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
              {LABELS.thankYouTitle}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{LABELS.thankYouBody}</p>
          </div>
          <Button asChild className="mt-2 w-full">
            <Link href="/login">{LABELS.backToLogin}</Link>
          </Button>
        </div>
      ) : (
        /* ── Feedback form view ─────────────────────────────────────── */
        <>
          <div className="mb-6 flex flex-col items-center gap-2">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-accent">
              <Heart className="size-5.5 text-primary" />
            </div>
            <h1 className="text-center font-heading text-2xl font-bold tracking-tight text-foreground">
              {LABELS.title}
            </h1>
            <p className="text-center text-sm text-muted-foreground">{LABELS.subtitle}</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <p className="text-sm font-medium text-foreground">
              {LABELS.feedbackQuestion}{" "}
              <span className="font-normal text-muted-foreground">
                {LABELS.feedbackOptional}
              </span>
            </p>

            {/* Reason dropdown */}
            <Select value={reason} onValueChange={setReason} disabled={isLoading}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={REASON_PLACEHOLDER} />
              </SelectTrigger>
              <SelectContent>
                {REASON_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Comment textarea */}
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={LABELS.commentPlaceholder}
              rows={3}
              maxLength={1000}
              disabled={isLoading}
              className="min-h-18 resize-y"
            />

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" disabled={isLoading} className="w-full">
              {isLoading ? (
                <>
                  <Loader2 className="animate-spin" />
                  {LABELS.submitting}
                </>
              ) : (
                LABELS.submit
              )}
            </Button>
          </form>

          <div className="mt-4 flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => setSubmitted(true)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {LABELS.skip}
            </button>
            <Link href="/login" className="text-sm text-primary hover:underline">
              {LABELS.backToLogin}
            </Link>
          </div>
        </>
      )}
    </AuthShell>
  );
}
