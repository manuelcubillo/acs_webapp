"use client";

import { useRouter } from "next/navigation";
import { createCardAction } from "@/lib/actions/cards";
import CardForm from "@/components/cards/CardForm";
import type { FieldDefinitionShape } from "@/lib/validation/types";

interface CardNewClientProps {
  cardTypeId: string;
  fields: FieldDefinitionShape[];
  tenantId: string;
}

export default function CardNewClient({
  cardTypeId,
  fields,
  tenantId,
}: CardNewClientProps) {
  const router = useRouter();

  async function handleSubmit(
    code: string,
    values: Record<string, unknown>,
  ) {
    const res = await createCardAction({ cardTypeId, code, values });
    if (!res.success) throw new Error(res.error);
    router.push(`/cards/${encodeURIComponent(code)}`);
    router.refresh();
  }

  return (
    <CardForm
      fields={fields}
      tenantId={tenantId}
      onSubmit={handleSubmit}
      onCancel={() => router.back()}
      submitLabel="Crear carnet"
    />
  );
}
