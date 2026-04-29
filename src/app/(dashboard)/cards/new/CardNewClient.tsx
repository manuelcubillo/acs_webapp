"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle } from "lucide-react";
import { createCardAction } from "@/lib/actions/cards";
import CardForm from "@/components/cards/CardForm";
import type { FieldDefinitionShape } from "@/lib/validation/types";

interface CardNewClientProps {
  cardTypeId: string;
  fields: FieldDefinitionShape[];
}

export default function CardNewClient({
  cardTypeId,
  fields,
}: CardNewClientProps) {
  const router = useRouter();
  const [resetKey, setResetKey] = useState(0);
  const [createdCode, setCreatedCode] = useState<string | null>(null);

  async function handleSubmit(
    code: string,
    values: Record<string, unknown>,
  ) {
    const res = await createCardAction({ cardTypeId, code, values });
    if (!res.success) throw new Error(res.error);
    // Success: show banner and remount the form (clears all fields)
    setCreatedCode(code);
    setResetKey((k) => k + 1);
  }

  return (
    <div>
      {/* Success banner — shown after a card is created */}
      {createdCode && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 16px",
            borderRadius: 8,
            background: "#dcfce7",
            color: "#166534",
            fontSize: 13,
            fontWeight: 500,
            marginBottom: 20,
          }}
        >
          <CheckCircle size={16} strokeWidth={2} style={{ flexShrink: 0 }} />
          <span>
            Carnet <strong>{createdCode}</strong> creado.{" "}
            <Link
              href={`/cards/${encodeURIComponent(createdCode)}`}
              style={{
                color: "#166534",
                fontWeight: 700,
                textDecoration: "underline",
              }}
            >
              Ver carnet →
            </Link>
          </span>
        </div>
      )}

      {/* key={resetKey} forces a full remount (clearing state) after each success */}
      <CardForm
        key={resetKey}
        fields={fields}
        onSubmit={handleSubmit}
        onCancel={() => router.back()}
        submitLabel="Crear carnet"
      />
    </div>
  );
}
