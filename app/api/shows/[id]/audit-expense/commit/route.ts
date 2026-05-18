/**
 * POST /api/shows/[id]/audit-expense/commit
 *
 * Appends a single audited expense line item to the show's settlement
 * recoups_json. Mariana is the decision-maker — when she clicks
 * "Approve & Add to Settlement" we always persist the recoup with
 * status="agreed". The AI's flag (Approved / Flagged) is folded into
 * the audit_note text so it travels with the line item.
 *
 * If no settlement row exists yet for this show (a brand-new draft),
 * we create one in 'draft' status carrying just the recoup.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { settlements, shows, type Recoup } from "@/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

const RECOUP_CATEGORIES: ReadonlyArray<Recoup["category"]> = [
  "marketing",
  "hospitality_overage",
  "production_overage",
  "prior_advance",
  "damages",
  "other",
];

type CommitBody = {
  amount?: unknown;
  category?: unknown;
  label?: unknown;
  audit_note?: unknown;
  ai_status?: unknown; // "Approved" | "Flagged" — folded into audit_note tag.
};

function isCategory(c: string): c is Recoup["category"] {
  return RECOUP_CATEGORIES.includes(c as Recoup["category"]);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: CommitBody;
  try {
    body = (await request.json()) as CommitBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const amount = Number(body.amount);
  const category = String(body.category ?? "");
  const label = String(body.label ?? "").trim();
  const auditNote = String(body.audit_note ?? "").trim();
  const aiStatus = String(body.ai_status ?? "");

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "amount must be > 0." }, { status: 400 });
  }
  if (!isCategory(category)) {
    return NextResponse.json(
      { error: `category must be one of: ${RECOUP_CATEGORIES.join(", ")}` },
      { status: 400 },
    );
  }
  if (!label) {
    return NextResponse.json({ error: "label is required." }, { status: 400 });
  }
  if (!auditNote) {
    return NextResponse.json({ error: "audit_note is required." }, { status: 400 });
  }

  // Confirm show exists.
  const showRows = await db.select().from(shows).where(eq(shows.id, id));
  if (showRows.length === 0) {
    return NextResponse.json({ error: "Show not found." }, { status: 404 });
  }

  const settlementRows = await db
    .select()
    .from(settlements)
    .where(eq(settlements.showId, id));
  const existing = settlementRows[0];

  // Carry the AI flag into the audit_note so the line item is self-explanatory
  // when an agent later asks why this recoup is here. Mariana's click controls
  // the persisted status (always "agreed"); the AI's read controls the prose.
  const flagTag = aiStatus === "Flagged" ? "[AI: Flagged] " : "[AI: Approved] ";
  const newRecoup: Recoup = {
    id: `recoup_${id}_audit_${Date.now()}`,
    category: category as Recoup["category"],
    label,
    amount: Math.round(amount * 100) / 100,
    status: "agreed",
  };

  let recoupsArr: Recoup[] = [];
  if (existing?.recoupsJson) {
    try {
      const parsed = JSON.parse(existing.recoupsJson);
      if (Array.isArray(parsed)) recoupsArr = parsed;
    } catch {
      recoupsArr = [];
    }
  }
  recoupsArr.push(newRecoup);
  const nextRecoupsJson = JSON.stringify(recoupsArr);

  // Stitch the audit note onto the settlement.notes field too — that's where
  // future-Mariana reads the paper trail.
  const auditTrailLine = `${new Date().toISOString()} — Smart Audit · ${flagTag}${label} ($${newRecoup.amount.toFixed(2)} · ${category}): ${auditNote}`;
  const nextNotes = existing?.notes
    ? `${existing.notes}\n${auditTrailLine}`
    : auditTrailLine;

  if (existing) {
    await db
      .update(settlements)
      .set({ recoupsJson: nextRecoupsJson, notes: nextNotes })
      .where(eq(settlements.id, existing.id));
  } else {
    const newId = `set_${id}_${Date.now()}`;
    await db.insert(settlements).values({
      id: newId,
      showId: id,
      status: "draft",
      draftedAt: new Date(),
      recoupsJson: nextRecoupsJson,
      notes: nextNotes,
    });
  }

  return NextResponse.json({
    ok: true,
    recoup: newRecoup,
    totalRecoups: recoupsArr.length,
  });
}
