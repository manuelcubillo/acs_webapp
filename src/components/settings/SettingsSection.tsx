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
    <div className="flex max-w-[720px] flex-col">
      {/* Page heading */}
      <div className="mb-6">
        <h1 className="mb-1.5 font-heading text-[22px] font-extrabold text-foreground">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>

      {/* Content area — cards stacked vertically */}
      <div className="flex flex-col gap-5">{children}</div>
    </div>
  );
}
