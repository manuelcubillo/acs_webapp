/**
 * Shared Resend email client and transactional email helpers.
 *
 * The Resend client is created once and shared across all email sending.
 * auth.ts imports `resend` and `FROM_EMAIL` from here so the password-reset
 * flow keeps working unchanged.
 */

import { Resend } from "resend";

export const resend = new Resend(process.env.RESEND_APIKEY);

/** Must be a domain verified in your Resend account. */
export const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ?? "noreply@yourdomain.com";

// ─── Role labels (Spanish) ────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  operator: "Operador",
  admin: "Administrador",
  master: "Master",
};

// ─── Invitation email ─────────────────────────────────────────────────────────

interface SendInvitationEmailParams {
  to: string;
  tenantName: string;
  inviterName: string;
  role: string;
  acceptUrl: string;
}

/**
 * Send a member invitation email via Resend.
 * The accept URL embeds the one-time token and expires in 7 days.
 */
export async function sendInvitationEmail({
  to,
  tenantName,
  inviterName,
  role,
  acceptUrl,
}: SendInvitationEmailParams): Promise<void> {
  const roleLabel = ROLE_LABELS[role] ?? role;

  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Invitación a ${tenantName}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="margin:0 0 8px;font-size:20px;color:#1a1d2e">
          Has sido invitado a ${tenantName}
        </h2>
        <p style="margin:0 0 8px;color:#6b7094;font-size:14px">
          <strong>${inviterName}</strong> te ha invitado a unirte a la
          organización <strong>${tenantName}</strong> como
          <strong>${roleLabel}</strong>.
        </p>
        <p style="margin:0 0 24px;color:#6b7094;font-size:14px">
          Haz clic en el botón de abajo para aceptar la invitación y crear tu
          cuenta. Este enlace caduca en 7 días.
        </p>
        <a href="${acceptUrl}"
           style="display:inline-block;padding:12px 24px;background:#4f5bff;color:#fff;
                  text-decoration:none;border-radius:10px;font-size:14px;font-weight:600">
          Aceptar invitación
        </a>
        <p style="margin:24px 0 0;color:#8b8fa3;font-size:12px">
          Si no esperabas esta invitación, puedes ignorar este correo.
        </p>
      </div>
    `,
  });
}
