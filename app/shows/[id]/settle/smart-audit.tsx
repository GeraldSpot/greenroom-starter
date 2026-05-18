"use client";

/**
 * Smart Expense Audit — client component.
 *
 * Drops onto /shows/[id]/settle. Mariana picks a receipt/email, the server
 * route hits Gemini 2.0 Flash, and we render the verdict with two big
 * decision buttons. Designed for 2:00 AM: high contrast, large hit targets,
 * one obvious next action.
 *
 * State machine:
 *   idle  →  auditing  →  verdict  →  committing  →  committed (router.refresh)
 *                                  ↘  idle (Reject)
 *   any   →  error  →  idle (Try again)
 */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Upload,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  X,
  RotateCcw,
  FileText,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";

type AuditVerdict = {
  amount: number;
  category:
    | "marketing"
    | "hospitality_overage"
    | "production_overage"
    | "prior_advance"
    | "damages"
    | "other";
  status: "Approved" | "Flagged";
  audit_note: string;
};

type AuditContextEcho = {
  showLabel: string;
  dealNotesFreetext: string | null;
  signoffText: string | null;
  settlementStatus: string | null;
  existingRecoupCount: number;
};

const CATEGORY_LABEL: Record<AuditVerdict["category"], string> = {
  marketing: "Marketing",
  hospitality_overage: "Hospitality overage",
  production_overage: "Production overage",
  prior_advance: "Prior advance",
  damages: "Damages",
  other: "Other",
};

type Phase =
  | { kind: "idle" }
  | { kind: "auditing"; fileName: string }
  | {
      kind: "verdict";
      fileName: string;
      verdict: AuditVerdict;
      context: AuditContextEcho;
    }
  | {
      kind: "committing";
      fileName: string;
      verdict: AuditVerdict;
      context: AuditContextEcho;
    }
  | { kind: "committed"; verdict: AuditVerdict }
  | { kind: "error"; message: string };

export function SmartExpenseAudit({ showId }: { showId: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  function reset() {
    setPhase({ kind: "idle" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhase({ kind: "auditing", fileName: file.name });

    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch(`/api/shows/${showId}/audit-expense`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? `Audit failed (${res.status}).`);
      }
      setPhase({
        kind: "verdict",
        fileName: file.name,
        verdict: json.verdict as AuditVerdict,
        context: json.context as AuditContextEcho,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error.";
      setPhase({ kind: "error", message });
    }
  }

  async function onApprove() {
    if (phase.kind !== "verdict") return;
    const { verdict, fileName } = phase;
    setPhase({ ...phase, kind: "committing" });
    try {
      const res = await fetch(`/api/shows/${showId}/audit-expense/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: verdict.amount,
          category: verdict.category,
          // Keep the source filename in the label so the line item is traceable.
          label: deriveLabel(verdict, fileName),
          audit_note: verdict.audit_note,
          ai_status: verdict.status,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? `Commit failed (${res.status}).`);
      }
      setPhase({ kind: "committed", verdict });
      // Pull the freshly-written recoup into the server-rendered Recoups section.
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error.";
      setPhase({ kind: "error", message });
    }
  }

  return (
    <Card accent="brand">
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-brand-700" />
            Smart Expense Audit
          </CardTitle>
          <CardDescription>
            Upload a receipt, an emailed invoice, or a PDF. Greenroom reads it
            against the deal terms and existing sign-off prose, then drafts an
            audit note you can hand the tour manager.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {phase.kind === "idle" && <Dropzone inputRef={fileInputRef} onChange={onFileChosen} />}

        {phase.kind === "auditing" && <AuditingState fileName={phase.fileName} />}

        {(phase.kind === "verdict" || phase.kind === "committing") && (
          <VerdictView
            verdict={phase.verdict}
            context={phase.context}
            fileName={phase.fileName}
            committing={phase.kind === "committing"}
            onApprove={onApprove}
            onReject={reset}
          />
        )}

        {phase.kind === "committed" && (
          <CommittedState verdict={phase.verdict} onAuditAnother={reset} />
        )}

        {phase.kind === "error" && <ErrorState message={phase.message} onRetry={reset} />}
      </CardContent>
    </Card>
  );
}

function deriveLabel(verdict: AuditVerdict, fileName: string): string {
  const trimmed = fileName.replace(/\.[^.]+$/, "").slice(0, 60);
  return `${CATEGORY_LABEL[verdict.category]} · ${trimmed}`;
}

// ---------- States ----------

function Dropzone({
  inputRef,
  onChange,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label
      htmlFor="smart-audit-file"
      className="block cursor-pointer rounded-lg border-2 border-dashed border-ink-200 bg-canvas-soft hover:border-brand-700/60 hover:bg-brand-50/40 transition-colors px-6 py-10 text-center"
    >
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white ring-1 ring-ink-200/80 mb-4">
        <Upload className="h-5 w-5 text-ink-700" />
      </div>
      <div className="text-[15px] font-semibold text-ink-900">
        Drop a receipt, photo, or email
      </div>
      <div className="text-[12.5px] text-ink-500 mt-1">
        Image, PDF, or .eml — up to 8MB. Mobile camera supported.
      </div>
      <div className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-ink-900 text-white px-3 py-1.5 text-[12px] font-medium">
        <Upload className="h-3.5 w-3.5" /> Choose file
      </div>
      <input
        ref={inputRef}
        id="smart-audit-file"
        type="file"
        accept="image/*,.pdf,.eml"
        className="sr-only"
        onChange={onChange}
      />
    </label>
  );
}

function AuditingState({ fileName }: { fileName: string }) {
  return (
    <div
      className="rounded-lg bg-canvas-soft ring-1 ring-ink-200/60 px-6 py-10 text-center"
      role="status"
      aria-live="polite"
    >
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white ring-1 ring-ink-200/80 mb-4">
        <Loader2 className="h-5 w-5 text-brand-700 animate-spin" />
      </div>
      <div className="text-[15px] font-semibold text-ink-900">
        Reading the receipt…
      </div>
      <div className="text-[12.5px] text-ink-500 mt-1.5 max-w-md mx-auto leading-relaxed">
        Cross-checking against the deal terms and the artist team&apos;s
        sign-off prose. This usually takes 3–8 seconds.
      </div>
      <div className="mt-4 inline-flex items-center gap-1.5 text-[11.5px] text-ink-400 font-mono">
        <FileText className="h-3 w-3" /> {fileName}
      </div>
    </div>
  );
}

function VerdictView({
  verdict,
  context,
  fileName,
  committing,
  onApprove,
  onReject,
}: {
  verdict: AuditVerdict;
  context: AuditContextEcho;
  fileName: string;
  committing: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const flagged = verdict.status === "Flagged";

  // Detect the "badge says one thing, prose says another" seam so we can
  // surface it in the verdict UI — that's the trust-builder for the TM.
  const proseOverride =
    context.settlementStatus === "disputed" &&
    !!context.signoffText &&
    /looks good|👍|ok|good night|wire|approve|all good/i.test(
      context.signoffText,
    );

  return (
    <div className="space-y-5">
      <div
        className={`rounded-lg ring-1 px-5 py-5 ${
          flagged
            ? "bg-rose-50/50 ring-rose-200/80"
            : "bg-emerald-50/40 ring-emerald-200/80"
        }`}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            {flagged ? (
              <AlertTriangle className="h-4 w-4 text-rose-700" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-700" />
            )}
            <span
              className={`text-[12px] font-semibold uppercase tracking-wider ${
                flagged ? "text-rose-800" : "text-emerald-800"
              }`}
            >
              {flagged ? "Flagged" : "Approved by audit"}
            </span>
          </div>
          <span className="text-[11px] text-ink-400 font-mono truncate max-w-[40%]">
            {fileName}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-5 items-end">
          <div>
            <div className="eyebrow text-[10px] text-ink-500 mb-1">
              Category
            </div>
            <div className="text-[16px] font-medium text-ink-900">
              {CATEGORY_LABEL[verdict.category]}
            </div>
          </div>
          <div className="text-right">
            <div className="eyebrow text-[10px] text-ink-500 mb-1">
              Extracted total
            </div>
            <div
              className="text-[40px] font-mono tabular font-bold text-ink-900 leading-none"
              style={{ letterSpacing: "-0.02em" }}
            >
              {formatMoney(verdict.amount)}
            </div>
          </div>
        </div>

        <div className="mt-5 pt-5 border-t border-ink-100/80">
          <div className="eyebrow text-[10px] text-ink-500 mb-1.5">
            Audit note
          </div>
          <p className="text-[14px] text-ink-900 leading-relaxed">
            {verdict.audit_note}
          </p>
        </div>

        {proseOverride && (
          <div className="mt-4 flex gap-2 rounded-md bg-amber-50/80 ring-1 ring-amber-200/80 px-3 py-2">
            <Sparkles className="h-3.5 w-3.5 text-amber-700 mt-0.5 shrink-0" />
            <div className="text-[11.5px] text-amber-900 leading-snug">
              <span className="font-semibold">Heads up:</span> the settlement
              badge still reads <span className="font-mono">disputed</span>,
              but the artist team&apos;s sign-off prose (
              <span className="italic">
                &ldquo;{context.signoffText}&rdquo;
              </span>
              ) reads as approved. The audit treated this as resolved.
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col-reverse sm:flex-row gap-3 sm:items-center sm:justify-end">
        <Button
          variant="ghost"
          size="lg"
          onClick={onReject}
          disabled={committing}
          aria-label="Reject this audit"
        >
          <X className="h-4 w-4" />
          Reject
        </Button>
        <Button
          variant={flagged ? "default" : "brand"}
          size="lg"
          onClick={onApprove}
          disabled={committing}
          aria-label="Approve and add to settlement"
        >
          {committing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Adding…
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Approve & Add to Settlement
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function CommittedState({
  verdict,
  onAuditAnother,
}: {
  verdict: AuditVerdict;
  onAuditAnother: () => void;
}) {
  return (
    <div className="rounded-lg bg-emerald-50/40 ring-1 ring-emerald-200/80 px-5 py-5 flex items-start gap-3">
      <CheckCircle2 className="h-5 w-5 text-emerald-700 mt-0.5 shrink-0" />
      <div className="flex-1">
        <div className="text-[13.5px] font-semibold text-emerald-900">
          Added to settlement · {formatMoney(verdict.amount)}{" "}
          {CATEGORY_LABEL[verdict.category]}
        </div>
        <div className="text-[12px] text-ink-600 mt-1 leading-relaxed">
          The recoup line item now appears below in <em>Recoups</em>, with the
          audit note attached for the paper trail.
        </div>
        <div className="mt-3">
          <Button variant="secondary" size="sm" onClick={onAuditAnother}>
            <RotateCcw className="h-3.5 w-3.5" /> Audit another receipt
          </Button>
        </div>
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg bg-rose-50/50 ring-1 ring-rose-200/80 px-5 py-5 flex items-start gap-3">
      <AlertTriangle className="h-5 w-5 text-rose-700 mt-0.5 shrink-0" />
      <div className="flex-1">
        <div className="text-[13.5px] font-semibold text-rose-900">
          The audit didn&apos;t complete.
        </div>
        <div className="text-[12px] text-rose-900/80 mt-1 leading-relaxed font-mono">
          {message}
        </div>
        <div className="mt-3">
          <Button variant="secondary" size="sm" onClick={onRetry}>
            <RotateCcw className="h-3.5 w-3.5" /> Try again
          </Button>
        </div>
      </div>
    </div>
  );
}
