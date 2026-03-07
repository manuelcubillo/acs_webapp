"use client";

import { useRouter } from "next/navigation";
import { updateCardAction } from "@/lib/actions/cards";
import CardForm from "@/components/cards/CardForm";
import type { FieldDefinitionShape } from "@/lib/validation/types";

interface CardEditClientProps {
  cardCode: string;
  fields: FieldDefinitionShape[];
  initialValues: Record<string, unknown>;
  tenantId: string;
}

export default function CardEditClient({
  cardCode,
  fields,
  initialValues,
  tenantId,
}: CardEditClientProps) {
  const router = useRouter();

  async function handleSubmit(
    _code: string,
    values: Record<string, unknown>,
  ) {
    const res = await updateCardAction(cardCode, { values });
    if (!res.success) throw new Error(res.error);
    router.push(`/cards/${encodeURIComponent(cardCode)}`);
    router.refresh();
  }

  return (
    <CardForm
      fields={fields}
      initialValues={initialValues}
      initialCode={cardCode}
      tenantId={tenantId}
      onSubmit={handleSubmit}
      onCancel={() =>
        router.push(`/cards/${encodeURIComponent(cardCode)}`)
      }
      submitLabel="Guardar cambios"
      codeReadOnly
    />
  );
}
