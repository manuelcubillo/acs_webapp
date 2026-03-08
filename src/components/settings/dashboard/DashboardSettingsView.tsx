"use client";

/**
 * DashboardSettingsView
 *
 * Top-level layout for the /settings/dashboard page.
 * Wraps content in a SettingsSection and renders all settings cards:
 *   1. FeedSettingsSection  — feed limit + entry type toggles
 *   2. SummaryFieldsSection — per-card-type field selection for feed entries
 */

import SettingsSection from "@/components/settings/SettingsSection";
import FeedSettingsSection from "./FeedSettingsSection";
import SummaryFieldsSection from "./SummaryFieldsSection";
import type {
  DashboardSettings,
  CardType,
  FieldDefinition,
  CardTypeSummaryField,
} from "@/lib/dal";

interface DashboardSettingsViewProps {
  settings: DashboardSettings | null;
  cardTypes: CardType[];
  fieldsByCardType: Record<string, FieldDefinition[]>;
  summaryByCardType: Record<string, CardTypeSummaryField[]>;
}

export default function DashboardSettingsView({
  settings,
  cardTypes,
  fieldsByCardType,
  summaryByCardType,
}: DashboardSettingsViewProps) {
  return (
    <SettingsSection
      title="Dashboard"
      description="Personaliza qué información aparece en el panel operacional y cómo se muestra."
    >
      <FeedSettingsSection settings={settings} />
      <SummaryFieldsSection
        cardTypes={cardTypes}
        fieldsByCardType={fieldsByCardType}
        summaryByCardType={summaryByCardType}
      />
    </SettingsSection>
  );
}
