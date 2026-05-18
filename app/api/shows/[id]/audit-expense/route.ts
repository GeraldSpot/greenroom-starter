/**
 * POST /api/shows/[id]/audit-expense
 *
 * Accepts a single uploaded file (image, PDF, or .eml) plus the show id,
 * loads the contract context Mariana actually trusts (deal_notes_freetext,
 * recoups_json, signoff_text), passes it all to Gemini 2.0 Flash, and
 * returns a structured audit verdict.
 *
 * No DB writes here — commit happens in /audit-expense/commit when Mariana
 * clicks "Approve & Add to Settlement".
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  shows,
  artists,
  deals,
  settlements,
  type Recoup,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { auditExpense, type AuditContext } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

const ACCEPTED_MIME_PREFIXES = ["image/"];
const ACCEPTED_EXACT_MIME = new Set([
  "application/pdf",
  "message/rfc822", // .eml
  "text/plain", // some browsers report .eml as text/plain
]);
const ACCEPTED_EXTENSIONS = [".pdf", ".eml", ".png", ".jpg", ".jpeg", ".webp", ".heic"];
const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB — Gemini inline-data ceiling is 20MB; we stay well under.

function fileLooksAccepted(file: File): boolean {
  const mime = file.type || "";
  if (ACCEPTED_MIME_PREFIXES.some((p) => mime.startsWith(p))) return true;
  if (ACCEPTED_EXACT_MIME.has(mime)) return true;
  const lower = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function inferMimeType(file: File): string {
  // Gemini needs a real mime type. Browsers sometimes hand us "" for .eml.
  if (file.type) return file.type;
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".eml")) return "message/rfc822";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic")) return "image/heic";
  return "application/octet-stream";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // 1. Parse the multipart upload.
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Could not read multipart form body." },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing 'file' field in upload." },
      { status: 400 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Uploaded file is empty." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `File is larger than ${MAX_FILE_BYTES / (1024 * 1024)}MB.` },
      { status: 413 },
    );
  }
  if (!fileLooksAccepted(file)) {
    return NextResponse.json(
      {
        error: `Unsupported file type: ${file.type || "unknown"}. Accept image, PDF, or .eml.`,
      },
      { status: 415 },
    );
  }

  // 2. Load the show + deal + settlement so the model gets the truth, not the badge.
  const showRows = await db
    .select({
      show: shows,
      artist: artists,
      deal: deals,
      settlement: settlements,
    })
    .from(shows)
    .leftJoin(artists, eq(shows.artistId, artists.id))
    .leftJoin(deals, eq(deals.showId, shows.id))
    .leftJoin(settlements, eq(settlements.showId, shows.id))
    .where(eq(shows.id, id));

  if (showRows.length === 0) {
    return NextResponse.json({ error: "Show not found." }, { status: 404 });
  }
  const { show, artist, deal, settlement } = showRows[0];

  let existingRecoups: Recoup[] = [];
  if (settlement?.recoupsJson) {
    try {
      const parsed = JSON.parse(settlement.recoupsJson);
      if (Array.isArray(parsed)) existingRecoups = parsed;
    } catch {
      // Malformed JSON in seed → ignore. The LLM will see "(none)".
    }
  }

  const ctx: AuditContext = {
    showLabel: `${artist?.name ?? "Unknown artist"} · ${show.date}`,
    dealNotesFreetext: deal?.dealNotesFreetext ?? null,
    signoffText: settlement?.signoffText ?? null,
    settlementStatus: settlement?.status ?? null,
    existingRecoups: existingRecoups.map((r) => ({
      label: r.label,
      category: r.category,
      amount: r.amount,
      status: r.status,
    })),
  };

  // 3. Base64-encode the file payload for Gemini inline-data.
  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");
  const mimeType = inferMimeType(file);

  // 4. Call Gemini.
  try {
    const verdict = await auditExpense({ mimeType, data: base64 }, ctx);
    return NextResponse.json({
      verdict,
      context: {
        showLabel: ctx.showLabel,
        dealNotesFreetext: ctx.dealNotesFreetext,
        signoffText: ctx.signoffText,
        settlementStatus: ctx.settlementStatus,
        existingRecoupCount: existingRecoups.length,
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error calling Gemini.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
