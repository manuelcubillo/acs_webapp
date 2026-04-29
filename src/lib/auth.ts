import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { resend, FROM_EMAIL } from "@/lib/email/send";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: user.email,
        subject: "Restablecer contraseña — ACS",
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
            <h2 style="margin:0 0 8px;font-size:20px;color:#1a1d2e">Restablecer contraseña</h2>
            <p style="margin:0 0 24px;color:#6b7094;font-size:14px">
              Recibimos una solicitud para restablecer la contraseña de tu cuenta.
              Haz clic en el botón de abajo para continuar.
            </p>
            <a href="${url}"
               style="display:inline-block;padding:12px 24px;background:#4f5bff;color:#fff;
                      text-decoration:none;border-radius:10px;font-size:14px;font-weight:600">
              Restablecer contraseña
            </a>
            <p style="margin:24px 0 0;color:#8b8fa3;font-size:12px">
              Este enlace expira en 1 hora. Si no solicitaste este cambio, puedes ignorar este correo.
            </p>
          </div>
        `,
      });
    },
  },
  plugins: [username()],
  trustedOrigins: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ],
  user: {
    additionalFields: {
      tenantId: {
        type: "string",
        nullable: true,
        defaultValue: null,
      },
    },
  },
});
