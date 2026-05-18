# Loom Walkthrough Script — Smart Expense Audit
## Target: 5–8 minutes | Screen + Cam

**Demo show:** Park Avenue · May 9, 2026 (`show_0182`)
- Settlement badge: **Disputed**
- Sign-off prose: "OK. Good night." (contradicts badge — the key demo point)
- Deal notes: "Expenses to 650" (the cap the AI will cite)

---

## INTRO (0:00 – 0:45)

**What's on screen:** Browser at `/shows` (the show list)

**Say:**
> "Hey — I'm [your name], and this is my prototype for the Greenroom case study. I chose the Expense & Recoup Auditor slice — the scenario where it's 2am, load-out is happening, and the tour manager is standing at the booker's desk demanding the final settlement payout. The core problem: receipts live in messy formats — photos, emails, PDFs on Mariana's desk — and the deal terms that govern whether those expenses are valid live in unstructured prose in the database. I built a feature that bridges that gap with AI."

---

## THE PROBLEM (0:45 – 1:45)

**Action:** Scroll to find **Park Avenue** (May 9) in the shows list → click into it → click **Settle**

**Say:**
> "Here's a real show — Park Avenue, May 9th. Notice the settlement badge says 'Disputed'..."

**Action:** Scroll down to the Sign-off & notes section

**Say:**
> "...but if you read the actual sign-off from the artist team, it says 'OK. Good night.' That's the messy data problem the brief calls out — the status field lies, and the prose is the truth. Any feature we build has to read past that surface-level badge."

**Action:** Scroll back up and point out the deal notes

**Say:**
> "The deal notes say 'Expenses to 650' — that's Mariana's source of truth for what's recoopable. No structured field captures this reliably. It's just prose."

---

## THE FEATURE (1:45 – 2:15)

**Action:** Scroll to the **Smart Expense Audit** section

**Say:**
> "Here's what I built. A single upload zone — Mariana drops a receipt, the system reads it against the deal terms and the sign-off prose, and produces a transparent audit note she can hand directly to the tour manager. Let me show it working."

---

## DEMO 1: HAPPY PATH (2:15 – 3:30)

**Action:** Click "Choose file" → select `1-spotify-marketing-415.eml` from Desktop

**Say:**
> "This is a Spotify ad spend email — $415 for a pre-show campaign. Watch the loading state..."

**Wait for result (3–8 seconds)**

**Say (reading the verdict):**
> "It extracted $415, categorized it as 'marketing', status is 'Approved', and the audit note cites the specific clause: 'Within the $650 expense cap noted in the deal terms.' That's the sentence Mariana reads aloud to the TM at 2am to close the conversation."

**Action:** Point out the amber "prose override" callout if it appears

**Say:**
> "Notice this callout — it's telling Mariana that even though the badge says 'Disputed', the sign-off prose reads as approved. The AI treated the dispute as resolved. Transparency builds trust."

**Action:** Click **"Approve & Add to Settlement"**

**Say:**
> "One click — it's now a line item on the settlement. The page refreshed and you can see it in the Recoups section below."

---

## DEMO 2: FLAGGED / OVER CAP (3:30 – 4:45)

**Action:** Click "Audit another receipt" → select `4-social-ads-OVER-CAP-780.eml`

**Say:**
> "Now a harder case — a $780 social media invoice that exceeds the $650 expense cap."

**Wait for result**

**Say:**
> "Status: Flagged. The audit note says it exceeds the cap and recommends recouping only $650. It tells Mariana what to do. She can still approve it if she wants — she's the decision-maker, not the AI — or reject it. That's the design principle: AI flags, human decides."

**Action:** Click **"Reject"** (to show both paths)

**Say:**
> "Rejected — nothing persisted. The TM doesn't see it. Mariana stays in control."

---

## DEMO 3: DIFFERENT CATEGORY (4:45 – 5:30)

**(Optional — include if under 7 min)**

**Action:** Upload `2-pucketts-hospitality-118.eml`

**Say:**
> "One more — a deli receipt. BBQ platter, banana pudding for the greenroom. The model categorizes it as 'hospitality overage', extracts $118.81 to the penny, approves it within the cap. Different category, same flow."

---

## ARCHITECTURE EXPLANATION (5:30 – 6:30)

**What's on screen:** Can stay on the settle page, or briefly show VS Code with the file tree

**Say:**
> "Under the hood: the upload hits a Next.js API route that loads the deal notes, sign-off text, settlement status, and existing recoups from SQLite. It passes all of that as context to Gemini 2.5 Flash alongside the file. The system prompt instructs the model to read past badge-level statuses and trust the prose. The response schema is constrained — the category enum matches the database schema exactly, so approved items persist directly to the settlements table without a translation layer. The whole round-trip is 3–8 seconds."

---

## DESIGN PRINCIPLES (6:30 – 7:15)

**Say:**
> "Three design choices I want to call out:
>
> One — it's built for 2am. High contrast, large buttons, one obvious next action. No settings, no configuration, no multi-step wizard.
>
> Two — the AI is transparent. The audit note isn't a black box; it cites the specific contract clause so Mariana can read it verbatim to the TM. That builds trust in the moment.
>
> Three — the messy data problem is addressed head-on. The model receives both the structured status AND the unstructured prose, and it's explicitly instructed that the prose wins when they conflict. The UI even surfaces that override to Mariana so she understands what the system is doing."

---

## CLOSE (7:15 – 7:45)

**Say:**
> "That's the prototype. One tightly-scoped slice — upload, audit, approve — that solves the 2am problem by meeting Mariana where the real data lives: in messy emails, wrinkled receipts, and prose that contradicts the database. Thanks for watching."

---

## TIPS FOR RECORDING

- **Pace:** Slightly slower than conversational. Evaluators will replay sections.
- **Mouse:** Move deliberately to what you're describing. Hover on the audit note for a beat.
- **If Gemini is slow:** Fill the wait with "It's reading the receipt and cross-referencing against the deal terms..." — the loading state has copy that supports this.
- **If something errors:** The error state is clean; just say "Let me try that again" and use a different receipt file. The error handling is part of the product quality.
- **Face cam:** Position bottom-left so it doesn't cover the audit section (which is center-right on the page).
- **URL to navigate to:** `http://localhost:3000/shows/show_0182/settle`
