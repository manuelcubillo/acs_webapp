"use client";

import { useRouter } from "next/navigation";
import { updateCardAction } from "@/lib/actions/cards";
import CardForm from "@/components/cards/CardForm";
import type { FieldDefinitionShape } from "@/lib/validation/types";

interface CardEditClientProps {
  cardId: string;
  cardCode: string;
  fields: FieldDefinitionShape[];
  initialValues: Record<string, unknown>;
  photoReadUrls: Record<string, string>;
  /**
   * The card detail to return to on save or cancel. Built by the page so it
   * still carries where the operator came from — a bare `/cards/[code]` would
   * strand them on a detail whose back link points at the dashboard.
   */
  returnHref: string;
}

export default function CardEditClient({
  cardId,
  cardCode,
  fields,
  initialValues,
  photoReadUrls,
  returnHref,
}: CardEditClientProps) {
  const router = useRouter();

  async function handleSubmit(
    _code: string,
    values: Record<string, unknown>,
  ) {
    const res = await updateCardAction(cardCode, { values });
    if (!res.success) throw new Error(res.error);
    router.push(returnHref);
  }

  return (
    <CardForm
      fields={fields}
      initialValues={initialValues}
      initialCode={cardCode}
      cardId={cardId}
      photoReadUrls={photoReadUrls}
      onSubmit={handleSubmit}
      onCancel={() => router.push(returnHref)}
      submitLabel="Guardar cambios"
      codeReadOnly
    />
  );
}
