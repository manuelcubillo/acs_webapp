"use client";

/**
 * Client-side loader for CardDesignEditor.
 *
 * next/dynamic with ssr:false must live in a Client Component — it cannot be
 * called from a Server Component (Turbopack enforces this).  This thin wrapper
 * is the Client boundary; page.tsx (a Server Component) imports this file.
 */

import dynamic from "next/dynamic";
import type { CardDesign, CardTypeWithFields } from "@/lib/dal";

const CardDesignEditor = dynamic(() => import("./CardDesignEditor"), { ssr: false });

interface Props {
  design: CardDesign;
  linkedCardTypes: CardTypeWithFields[];
}

export default function CardDesignEditorLoader({ design, linkedCardTypes }: Props) {
  return <CardDesignEditor design={design} linkedCardTypes={linkedCardTypes} />;
}
