/**
 * SettingsSection
 *
 * Top-level layout wrapper for a settings sub-page.
 * Renders a page heading, optional description, and a stacked list of
 * SettingsCard or other content below.
 *
 * Server-compatible — no client-side logic.
 *
 * Usage:
 *   <SettingsSection title="Cuenta" description="Información de tu organización.">
 *     <SettingsCard ...>...</SettingsCard>
 *   </SettingsSection>
 */

interface SettingsSectionProps {
  /** Page section title — displayed as an <h1>. */
  title: string;
  /** Optional subtitle shown below the title. */
  description?: string;
  children: React.ReactNode;
}

export default function SettingsSection({
  title,
  description,
  children,
}: SettingsSectionProps) {
  return (
    <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Page heading */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 800,
            fontFamily: "var(--font-heading)",
            color: "var(--color-dark)",
            margin: "0 0 6px",
          }}
        >
          {title}
        </h1>
        {description && (
          <p style={{ fontSize: 13.5, color: "var(--color-secondary)", margin: 0 }}>
            {description}
          </p>
        )}
      </div>

      {/* Content area — cards stacked vertically */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {children}
      </div>
    </div>
  );
}
