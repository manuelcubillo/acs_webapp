"use client";

/**
 * DashboardSettingsView
 *
 * Top-level layout for the /settings/dashboard page.
 * Wraps content in a SettingsSection and renders all settings cards:
 *   1. ActiveCardFieldsSection — per-card-type 3×3 grid for the "last scanned
 *      card" panel. First because it configures the dashboard's focal surface.
 *   2. FeedSettingsSection     — feed limit + entry type toggles
 *   3. SummaryFieldsSection    — per-card-type field selection for feed entries
 *
 * Sections 1 and 3 look similar but configure different surfaces and are stored
 * in different tables — see ADR 2026-08-04-active-card-summary-grid.md.
 */

import SettingsSection from "@/components/settings/SettingsSection";
import ActiveCardFieldsSection from "./ActiveCardFieldsSection";
import FeedSettingsSection from "./FeedSettingsSection";
import SummaryFieldsSection from "./SummaryFieldsSection";
import type {
  DashboardSettings,
  CardType,
  FieldDefinition,
  CardTypeSummaryField,
  CardTypeActiveZoneField,
} from "@/lib/dal";

interface DashboardSettingsViewProps {
  settings: DashboardSettings | null;
  cardTypes: CardType[];
  fieldsByCardType: Record<string, FieldDefinition[]>;
  summaryByCardType: Record<string, CardTypeSummaryField[]>;
  activeZoneByCardType: Record<string, CardTypeActiveZoneField[]>;
}

export default function DashboardSettingsView({
  settings,
  cardTypes,
  fieldsByCardType,
  summaryByCardType,
  activeZoneByCardType,
}: DashboardSettingsViewProps) {
  return (
    <SettingsSection
      title="Dashboard"
      description="Personaliza qué información aparece en el panel operacional y cómo se muestra."
    >
      <ActiveCardFieldsSection
        cardTypes={cardTypes}
        fieldsByCardType={fieldsByCardType}
        activeZoneByCardType={activeZoneByCardType}
      />
      <FeedSettingsSection settings={settings} />
      <SummaryFieldsSection
        cardTypes={cardTypes}
        fieldsByCardType={fieldsByCardType}
        summaryByCardType={summaryByCardType}
      />
    </SettingsSection>
  );
}
