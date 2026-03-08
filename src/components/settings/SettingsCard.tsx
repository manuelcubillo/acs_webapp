/**
 * SettingsCard
 *
 * Card container for a logical group of settings within a SettingsSection.
 * Renders a header (title + optional description), a content area, and an
 * optional footer (typically used for the Save button and status message).
 *
 * Server-compatible — no client-side logic.
 *
 * Usage:
 *   <SettingsCard
 *     title="Información del tenant"
 *     description="Nombre visible de tu organización."
 *     footer={<button className="btn btn-primary">Guardar</button>}
 *   >
 *     <input ... />
 *   </SettingsCard>
 */

interface SettingsCardProps {
  /** Card section title — displayed inside the header. */
  title: string;
  /** Optional description shown below the title in the header. */
  description?: string;
  children: React.ReactNode;
  /**
   * Content rendered in the card footer (below a hairline separator).
   * Typically contains a "Save" button and an inline status message.
   */
  footer?: React.ReactNode;
}

export default function SettingsCard({
  title,
  description,
  children,
  footer,
}: SettingsCardProps) {
  return (
    <div className="settings-card">
      {/* Header */}
      <div className="settings-card-header">
        <h2
          style={{
            fontSize: 15,
            fontWeight: 700,
            fontFamily: "var(--font-heading)",
            color: "var(--color-dark)",
            margin: description ? "0 0 4px" : "0",
          }}
        >
          {title}
        </h2>
        {description && (
          <p style={{ fontSize: 13, color: "var(--color-muted)", margin: 0 }}>
            {description}
          </p>
        )}
      </div>

      {/* Hairline separator */}
      <div className="settings-card-divider" />

      {/* Body */}
      <div className="settings-card-body">{children}</div>

      {/* Optional footer */}
      {footer && <div className="settings-card-footer">{footer}</div>}
    </div>
  );
}
