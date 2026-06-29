"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle } from "lucide-react";
import { createCardAction } from "@/lib/actions/cards";
import CardForm from "@/components/cards/CardForm";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { FieldDefinitionShape } from "@/lib/validation/types";

const TEXT = {
  CREATED_PRE:  "Carnet",
  CREATED_POST: "creado.",
  VIEW_CARD:    "Ver carnet →",
  SUBMIT:       "Crear carnet",
} as const;

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
      {/* Success banner — shown after a card is created.
          Neutral Alert: card creation is a CRUD confirmation, not an
          access-control outcome, so the reserved --state-granted token is
          intentionally NOT used here. */}
      {createdCode && (
        <Alert className="mb-5">
          <CheckCircle strokeWidth={2} />
          <AlertDescription className="text-card-foreground">
            <span>
              {TEXT.CREATED_PRE} <strong>{createdCode}</strong>{" "}
              {TEXT.CREATED_POST}{" "}
              <Link
                href={`/cards/${encodeURIComponent(createdCode)}`}
                className="font-bold text-primary underline"
              >
                {TEXT.VIEW_CARD}
              </Link>
            </span>
          </AlertDescription>
        </Alert>
      )}

      {/* key={resetKey} forces a full remount (clearing state) after each success */}
      <CardForm
        key={resetKey}
        fields={fields}
        onSubmit={handleSubmit}
        onCancel={() => router.push("/cards")}
        submitLabel={TEXT.SUBMIT}
      />
    </div>
  );
}
