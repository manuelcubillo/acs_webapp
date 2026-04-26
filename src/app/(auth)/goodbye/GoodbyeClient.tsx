"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Heart, Loader2, CheckCircle2 } from "lucide-react";
import { submitDepartureFeedbackAction } from "@/lib/actions/account";

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

const REASON_OPTIONS = [
  { value: "", label: "Selecciona un motivo (opcional)" },
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
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden"
      style={{ background: "var(--color-page-bg)" }}
    >
      {/* Animated blobs */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -top-40 -left-32 h-[580px] w-[580px] rounded-full opacity-20 blur-[90px]"
          style={{
            background: "radial-gradient(circle, #a5b4fc 0%, #818cf8 60%, transparent 100%)",
            animation: "drift1 22s linear infinite",
          }}
        />
        <div
          className="absolute top-1/2 -right-20 h-[420px] w-[420px] rounded-full opacity-15 blur-[80px]"
          style={{
            background: "radial-gradient(circle, #c7d2fe 0%, #a5b4fc 60%, transparent 100%)",
            animation: "drift2 28s linear infinite",
          }}
        />
      </div>

      {/* Card */}
      <div
        className="animate-fadein relative z-10 w-full max-w-sm"
        style={{ padding: "0 16px" }}
      >
        <div
          className="card"
          style={{
            padding: "40px 36px 32px",
            background: "rgba(255,255,255,0.85)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(79,91,255,0.12)",
            boxShadow: "0 20px 60px rgba(79,91,255,0.08), inset 0 1px 0 rgba(255,255,255,0.9)",
          }}
        >
          {submitted ? (
            /* ── Thank-you view ─────────────────────────────────────────── */
            <div className="flex flex-col items-center gap-4 text-center">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-2xl"
                style={{ background: "#f0fdf4" }}
              >
                <CheckCircle2 size={24} style={{ color: "#16a34a" }} />
              </div>
              <div>
                <h1
                  className="text-2xl font-bold tracking-tight"
                  style={{ fontFamily: "var(--font-heading)", color: "var(--color-dark)" }}
                >
                  {LABELS.thankYouTitle}
                </h1>
                <p className="mt-2 text-sm" style={{ color: "var(--color-muted)" }}>
                  {LABELS.thankYouBody}
                </p>
              </div>
              <Link
                href="/login"
                className="btn btn-primary w-full py-2.5 text-center"
                style={{ fontSize: "14px", marginTop: 8 }}
              >
                {LABELS.backToLogin}
              </Link>
            </div>
          ) : (
            /* ── Feedback form view ─────────────────────────────────────── */
            <>
              <div className="mb-6 flex flex-col items-center gap-2">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-2xl"
                  style={{ background: "var(--color-primary-light)" }}
                >
                  <Heart size={22} style={{ color: "var(--color-primary)" }} />
                </div>
                <h1
                  className="text-2xl font-bold tracking-tight text-center"
                  style={{ fontFamily: "var(--font-heading)", color: "var(--color-dark)" }}
                >
                  {LABELS.title}
                </h1>
                <p className="text-sm text-center" style={{ color: "var(--color-muted)" }}>
                  {LABELS.subtitle}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <p className="text-sm font-medium" style={{ color: "var(--color-dark)" }}>
                  {LABELS.feedbackQuestion}{" "}
                  <span style={{ color: "var(--color-muted)", fontWeight: 400 }}>
                    {LABELS.feedbackOptional}
                  </span>
                </p>

                {/* Reason dropdown */}
                <div className="flex flex-col gap-1.5">
                  <select
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="form-input"
                    disabled={isLoading}
                  >
                    {REASON_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Comment textarea */}
                <div className="flex flex-col gap-1.5">
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    className="form-input"
                    placeholder={LABELS.commentPlaceholder}
                    rows={3}
                    maxLength={1000}
                    disabled={isLoading}
                    style={{ resize: "vertical", minHeight: 72 }}
                  />
                </div>

                {error && (
                  <p
                    className="rounded-lg px-3 py-2 text-sm font-medium"
                    style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}
                  >
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="btn btn-primary w-full py-2.5"
                  style={{ fontSize: "14px" }}
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      {LABELS.submitting}
                    </>
                  ) : (
                    LABELS.submit
                  )}
                </button>
              </form>

              <div className="mt-4 flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSubmitted(true)}
                  className="text-sm"
                  style={{
                    color: "var(--color-muted)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  {LABELS.skip}
                </button>
                <Link href="/login" className="text-sm" style={{ color: "var(--color-primary)" }}>
                  {LABELS.backToLogin}
                </Link>
              </div>
            </>
          )}
        </div>

        <p className="mt-4 text-center text-xs" style={{ color: "var(--color-muted)" }}>
          {LABELS.footer}
        </p>
      </div>
    </div>
  );
}
