/**
 * Upload API — POST /api/upload
 *
 * Accepts a multipart/form-data request with a "file" field (image).
 * Saves the file to /public/uploads/[tenantId]/[year]/[month]/[uuid].[ext]
 * and returns the relative URL.
 *
 * Auth: requires an active session with tenant membership (operator+).
 * Max file size: 5 MB. Allowed types: JPEG, PNG, WebP, GIF.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getMemberByUserId } from "@/lib/dal/members";

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function POST(request: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = (session.user as { tenantId?: string | null }).tenantId;
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant associated" }, { status: 403 });
  }

  // Verify active membership (lightweight check).
  try {
    await getMemberByUserId(tenantId, session.user.id);
  } catch {
    return NextResponse.json({ error: "Not a tenant member" }, { status: 403 });
  }

  // ── Parse form data ──────────────────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // ── Validate ────────────────────────────────────────────────────────────────
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Tipo de archivo no permitido. Solo se permiten JPEG, PNG, WebP y GIF." },
      { status: 400 },
    );
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: "El archivo es demasiado grande. Máximo 5 MB." },
      { status: 400 },
    );
  }

  // ── Save ─────────────────────────────────────────────────────────────────────
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = String(now.getMonth() + 1).padStart(2, "0");

  const uploadDir = path.join(
    process.cwd(),
    "public",
    "uploads",
    tenantId,
    year,
    month,
  );
  await mkdir(uploadDir, { recursive: true });

  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
  const filename = `${crypto.randomUUID()}.${ext}`;
  const filePath = path.join(uploadDir, filename);

  const bytes = await file.arrayBuffer();
  await writeFile(filePath, Buffer.from(bytes));

  const url = `/uploads/${tenantId}/${year}/${month}/${filename}`;
  return NextResponse.json({ url });
}
