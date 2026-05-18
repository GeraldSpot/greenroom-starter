/**
 * Gemini 2.0 Flash adapter for the Smart Expense Audit feature.
 *
 * One job: take an uploaded receipt/email/PDF + the contract context that
 * Mariana actually trusts (deal notes, current recoups, sign-off prose),
 * and return a structured audit verdict.
 *
 * The model is instructed to:
 *   - Read past surface-level statuses ("Disputed" badge can be a lie if the
 *     sign-off prose says "Looks good — TM").
 *   - Constrain the category to the existing Recoup enum so we can persist
 *     directly into settlements.recoupsJson without a translation layer.
 */
import { GoogleGenAI, Type } from "@google/genai";

const RECOUP_CATEGORIES = [
  "marketing",
  "hospitality_overage",
  "production_overage",
  "prior_advance",
  "damages",
  "other",
] as const;

export type RecoupCategory = (typeof RECOUP_CATEGORIES)[number];

export type AuditVerdict = {
  amount: number;
  category: RecoupCategory;
  status: "Approved" | "Flagged";
  audit_note: string;
};

export type AuditContext = {
  showLabel: string; // e.g. "Sunday Drivers · 2026-07-10"
  dealNotesFreetext: string | null;
  signoffText: string | null;
  settlementStatus: string | null;
  existingRecoups: Array<{
    label: string;
    category: string;
    amount: number;
    status: string;
  }>;
};

const SYSTEM_PROMPT = `You are an expert music venue settlement auditor working alongside Mariana, the lead booker at The Crescent (650-cap, Nashville). It is 2:00 AM after a show. The tour manager is standing at her desk demanding the final payout. Your job is to audit a single receipt or expense email she just uploaded, against the contract context, and produce a verdict that builds trust with the tour manager.

You will receive:
1) An image, PDF, or email of the expense.
2) The deal notes (free-text — this is what Mariana ACTUALLY trusts; the structured fields in the database are unreliable).
3) The current recoup line items already on the settlement.
4) The official settlement status AND the human sign-off prose from the artist team.

CRITICAL — read past surface-level statuses:
- The settlement status field may say "Disputed" while the sign-off prose says something like "Looks good — TM" or "ok wire monday" or just "👍". When that contradiction exists, the prose is the truth. Treat the dispute as effectively resolved.
- Conversely, if the status says "signed" but the prose flags an open question, treat it as unresolved.

Your output MUST be a single JSON object matching the schema. Rules:
1. amount: the total dollar amount on the receipt/email. If you cannot read it, return 0 and explain in the audit_note.
2. category: choose ONE of: marketing, hospitality_overage, production_overage, prior_advance, damages, other. Map aggressively — a Spotify ad spend → marketing; a deli tray overage → hospitality_overage; broken mic stand → damages; a generic Uber receipt → other.
3. status: "Approved" if the expense fits cleanly within the contract caps/rules in the deal notes; "Flagged" if it exceeds a cap, contradicts a rule, or duplicates an existing recoup line item.
4. audit_note: ONE OR TWO sentences, plain English, addressed implicitly to the tour manager. Cite the specific contract clause when possible (e.g. 'Within the $700 expense cap noted in the deal terms.') or the specific reason for flagging (e.g. 'Exceeds the $500 marketing cap by $87; recommend recouping only $500.'). Be precise with dollar figures. Do not editorialize.

Never output anything outside the JSON.`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    amount: {
      type: Type.NUMBER,
      description: "Total dollar amount extracted from the receipt or email.",
    },
    category: {
      type: Type.STRING,
      enum: [...RECOUP_CATEGORIES],
      description: "Recoup category. Must be one of the enum values.",
    },
    status: {
      type: Type.STRING,
      enum: ["Approved", "Flagged"],
      description:
        "Approved if within contract limits, Flagged if it violates a cap or rule.",
    },
    audit_note: {
      type: Type.STRING,
      description:
        "1-2 sentence transparent justification. Cite the specific contract clause or cap when possible.",
    },
  },
  required: ["amount", "category", "status", "audit_note"],
  propertyOrdering: ["amount", "category", "status", "audit_note"],
};

function buildContextBlock(ctx: AuditContext): string {
  const recoupsLine =
    ctx.existingRecoups.length > 0
      ? ctx.existingRecoups
          .map(
            (r) =>
              `  - [${r.status}] ${r.category}: ${r.label} ($${r.amount.toFixed(2)})`,
          )
          .join("\n")
      : "  (none)";

  return [
    `SHOW: ${ctx.showLabel}`,
    "",
    "DEAL NOTES (free text — what Mariana trusts):",
    ctx.dealNotesFreetext?.trim() || "  (none on file)",
    "",
    `SETTLEMENT STATUS (badge): ${ctx.settlementStatus ?? "n/a"}`,
    "",
    "ARTIST-TEAM SIGN-OFF PROSE (read this past the badge):",
    ctx.signoffText?.trim()
      ? `"${ctx.signoffText.trim()}"`
      : "  (no sign-off text yet)",
    "",
    "EXISTING RECOUP LINE ITEMS:",
    recoupsLine,
  ].join("\n");
}

export async function auditExpense(
  file: { mimeType: string; data: string }, // base64-encoded
  ctx: AuditContext,
): Promise<AuditVerdict> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to .env.local and restart the dev server.",
    );
  }

  const ai = new GoogleGenAI({ apiKey });

  const contextBlock = buildContextBlock(ctx);

  // .eml files and other text/* types can't be sent as inlineData (Gemini
  // rejects message/rfc822). Decode them as UTF-8 and pass as a labeled text
  // part. Images and PDFs go as inlineData which Gemini handles natively.
  const isTextFile =
    file.mimeType === "message/rfc822" ||
    file.mimeType.startsWith("text/");

  const fileParts = isTextFile
    ? [
        {
          text:
            "--- UPLOADED FILE (email / text) ---\n" +
            Buffer.from(file.data, "base64").toString("utf-8"),
        },
      ]
    : [
        {
          inlineData: {
            mimeType: file.mimeType,
            data: file.data,
          },
        },
      ];

  let response;
  try {
    response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: `${SYSTEM_PROMPT}\n\n--- CONTEXT ---\n${contextBlock}` },
            ...fileParts,
            {
              text: "Now produce the JSON verdict for the uploaded expense.",
            },
          ],
        },
      ],
      config: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    });
  } catch (err) {
    throw new Error(humanizeGeminiError(err));
  }

  const text = response.text;
  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Gemini returned non-JSON: ${text.slice(0, 200)}`);
  }

  return validateVerdict(parsed);
}

function validateVerdict(raw: unknown): AuditVerdict {
  if (!raw || typeof raw !== "object") {
    throw new Error("Audit verdict is not an object.");
  }
  const r = raw as Record<string, unknown>;
  const amount = typeof r.amount === "number" ? r.amount : Number(r.amount);
  if (!Number.isFinite(amount)) {
    throw new Error("Audit verdict missing valid 'amount'.");
  }
  const category = String(r.category ?? "");
  if (!RECOUP_CATEGORIES.includes(category as RecoupCategory)) {
    throw new Error(`Audit verdict has invalid category: ${category}`);
  }
  const status = String(r.status ?? "");
  if (status !== "Approved" && status !== "Flagged") {
    throw new Error(`Audit verdict has invalid status: ${status}`);
  }
  const audit_note = String(r.audit_note ?? "").trim();
  if (!audit_note) {
    throw new Error("Audit verdict missing 'audit_note'.");
  }
  return {
    amount: Math.round(amount * 100) / 100,
    category: category as RecoupCategory,
    status: status as "Approved" | "Flagged",
    audit_note,
  };
}

/**
 * Gemini SDK errors arrive as JSON-stringified Google API errors. Strip the
 * envelope so the UI shows something a 2am booker can actually read.
 */
function humanizeGeminiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);

  // Try to peel the nested JSON ({error:{code,message,status,...}}).
  const jsonStart = raw.indexOf("{");
  if (jsonStart !== -1) {
    try {
      const parsed = JSON.parse(raw.slice(jsonStart));
      const inner = parsed?.error ?? parsed;
      const code: number | undefined = inner?.code;
      const status: string | undefined = inner?.status;
      const message: string | undefined = inner?.message;

      if (code === 429 || status === "RESOURCE_EXHAUSTED") {
        return "Gemini API quota exceeded for this key. Either enable billing on the Google AI Studio project, or swap in a key with available quota, then try again.";
      }
      if (code === 401 || code === 403 || status === "PERMISSION_DENIED" || status === "UNAUTHENTICATED") {
        return "Gemini API rejected the key (401/403). Check that GEMINI_API_KEY in .env.local is valid and has access to gemini-2.0-flash.";
      }
      if (code === 400 || status === "INVALID_ARGUMENT") {
        return `Gemini rejected the request: ${message ?? "invalid argument"}.`;
      }
      if (message) return `Gemini error: ${message}`;
    } catch {
      // fall through to raw
    }
  }
  return raw || "Unknown error calling Gemini.";
}
