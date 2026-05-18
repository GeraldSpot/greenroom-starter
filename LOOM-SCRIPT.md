# Loom Walkthrough Script — Smart Expense Audit
## Target: 5–8 minutes | Screen + Cam

**Demo show:** Park Avenue · May 9, 2026 (`show_0182`)
**URL:** `http://localhost:3000/shows/show_0182/settle`

---

## INTRO (0:00 – 0:45)

**What's on screen:** Browser at `/shows` (the show list)

**Say:**
> "Hey, I'm [your name]. For this case study I picked one very specific problem — it's 2am, the show just ended, and the tour manager is standing at the booker's desk wanting to get paid. The issue is that receipts are everywhere — crumpled on the desk, in email threads, photos on a phone — and the rules for what counts as a valid expense are buried in messy contract notes that nobody formatted properly. I built a feature that connects those two things with AI."

---

## THE PROBLEM (0:45 – 1:45)

**Action:** Find **Park Avenue** (May 9) in the list → click into it → click **Settle**

**Say:**
> "So here's a show — Park Avenue, May 9th. See how it says 'Disputed' up top?"

**Action:** Scroll down to the Sign-off & notes section

**Say:**
> "But then you scroll down and the artist's team literally wrote 'OK. Good night.' — that's not a dispute, that's a sign-off. The badge is wrong. This is the kind of messy data the brief talks about — the label says one thing, the actual human communication says something else. Whatever we build has to handle that."

**Action:** Scroll back up to the deal notes area

**Say:**
> "And here in the deal notes it says 'Expenses to 650.' That's the spending cap. But it's just sitting in a text blob — there's no dropdown or structured field for it. That's what Mariana actually works from."

---

## THE FEATURE (1:45 – 2:15)

**Action:** Scroll to the **Smart Expense Audit** section

**Say:**
> "So here's what I built. Mariana drops a receipt in here — photo, email, PDF, whatever she has — and the system reads it, checks it against those deal notes, and spits out a plain-English explanation she can show the tour manager on the spot."

---

## DEMO 1: HAPPY PATH (2:15 – 3:30)

**Action:** Click "Choose file" → pick `1-spotify-marketing-415.eml` from Desktop

**Say:**
> "This is a Spotify ad bill — $415 for a pre-show campaign. Let's see what happens..."

**Wait for result (3–8 seconds). While waiting:**
> "It's reading the email and checking it against the deal terms..."

**Say when result appears:**
> "Alright — it pulled out $415, tagged it as marketing, and says 'Approved.' The audit note says it's within the $650 expense cap from the deal. That one sentence is what Mariana can point to when the TM asks 'why is this coming out of my check?'"

**Action:** Point out the amber callout if it shows

**Say:**
> "And see this note here — it's telling her that even though the system says 'Disputed', the sign-off text sounds like approval. So the AI treated it as resolved. No hidden logic — it tells you what it did and why."

**Action:** Click **"Approve & Add to Settlement"**

**Say:**
> "One button. Done. It's on the settlement now — you can see it showed up in the recoups list below."

---

## DEMO 2: OVER THE CAP (3:30 – 4:45)

**Action:** Click "Audit another receipt" → pick `4-social-ads-OVER-CAP-780.eml`

**Say:**
> "Now let's try one that's over the limit — $780 in social ads against a $650 cap."

**Wait for result**

**Say:**
> "It flagged it. Says it's over the cap by $130 and suggests only recouping $650. But Mariana can still approve it if she wants to — she's the boss, not the AI. Or she can reject it and it disappears."

**Action:** Click **"Reject"**

**Say:**
> "Gone. Nothing saved. The TM never sees it."

---

## DEMO 3: DIFFERENT TYPE OF RECEIPT (4:45 – 5:30)

**(Optional — skip if you're already past 5 min)**

**Action:** Upload `2-pucketts-hospitality-118.eml`

**Say:**
> "Last one — a deli receipt. BBQ and banana pudding for the greenroom. It picks up $118.81, calls it a hospitality overage, and approves it. Different vendor, different category, same simple flow."

---

## HOW IT WORKS (5:30 – 6:30)

**What's on screen:** Stay on the settle page (or quickly flip to VS Code if you want)

**Say:**
> "Quick rundown on what's under the hood. When Mariana uploads something, the server grabs the deal notes, the sign-off text, and any existing recoups from the database. It sends all of that to Gemini alongside the file. The AI is told specifically: if the badge says disputed but the prose says approved, trust the prose. It returns structured data that maps directly to the database schema, so when she clicks approve it just writes the line item — no cleanup step needed. The whole thing takes about 3 to 8 seconds."

---

## WHY IT'S DESIGNED THIS WAY (6:30 – 7:15)

**Say:**
> "Three quick things on the design:
>
> First — it's built for 2am. Big buttons, clear text, no settings to fiddle with. Mariana's tired, the TM is impatient, so the UI gets out of the way.
>
> Second — the AI shows its work. The audit note cites the actual cap from the contract. It's not a black box saying 'approved' — it's a sentence she can read out loud to justify the number.
>
> Third — it deals with the messy data problem directly. The system knows that statuses lie and prose is truth. And when it makes that call, it tells you — right there in the UI."

---

## WRAP UP (7:15 – 7:45)

**Say:**
> "That's it. One focused feature — upload a receipt, get a plain-English verdict, add it to the settlement. Solves the 2am problem by meeting Mariana where the real information lives: in messy emails and contract prose that no structured field ever captured properly. Thanks for watching."

---

## RECORDING TIPS

- Talk like you're explaining it to a coworker, not presenting to a board.
- Move your mouse slowly to whatever you're talking about.
- During the loading wait, just narrate what's happening — don't sit in silence.
- If something errors, say "let me try that again" and pick a different file. The error screen looks clean.
- Put your face cam bottom-left so it doesn't cover the results.
- URL: `http://localhost:3000/shows/show_0182/settle`
