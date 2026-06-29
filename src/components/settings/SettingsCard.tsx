/**
 * SettingsCard
 *
 * Card container for a logical group of settings within a SettingsSection.
 * Renders a header (title + optional description), a content area, and an
 * optional footer (typically used for the Save button and status message).
 *
 * Server-compatible — no client-side logic.
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
    <div className="overflow-hidden rounded-xl border bg-card">
      {/* Header */}
      <div className="px-6 pt-5 pb-4">
        <h2 className="font-heading text-[15px] font-bold text-foreground">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>

      {/* Hairline separator */}
      <div className="mx-6 h-px bg-border" />

      {/* Body */}
      <div className="px-6 py-5">{children}</div>

      {/* Optional footer */}
      {footer && (
        <div className="flex items-center gap-3 border-t px-6 py-3.5">
          {footer}
        </div>
      )}
    </div>
  );
}
