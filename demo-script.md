# Aria — 4-Minute Video Demonstration Script

> **Video Duration:** 4:00 (240 seconds)  
> **Target Audience:** Technical evaluators, hiring managers, and system architects  
> **Presenter Prerequisites:** Chrome browser, microphone enabled, `http://localhost:3000` (or live Vercel URL), database seeded via `npm run db:setup`.

---

## ⏱️ Video Timeline Breakdown

| Timestamp | Duration | Section | Key Capabilities Demonstrated |
| :--- | :---: | :--- | :--- |
| **0:00 – 0:30** | 30s | **1. System Intro & Multi-Brand Architecture** | Multimodal voice stack, Aura Skincare & Kaveri Coffee, audio visualizer |
| **0:30 – 1:15** | 45s | **2. Order Lookup & Two-Phase Cancellation** | `getOrderDetails`, two-phase `requestCancellation` with cryptographic `confirmToken` |
| **1:15 – 2:15** | 60s | **3. Policy Refusal & Support Ticket Creation** | `RETURN_WINDOW_EXCEEDED` citation in Agent Brain panel, `createSupportTicket` |
| **2:15 – 2:45** | 30s | **4. Live Barge-In / Interruption** | Instant client-side Web Audio buffer clear (<50ms), zero audio bleed |
| **2:45 – 3:15** | 30s | **5. Natural Closing, Summary & QA Scorecard** | Goodbye auto-end, structured JSON summary, user voice inputs player, QA scorecard |
| **3:15 – 3:45** | 30s | **6. Observability Dashboard & Evaluation Metrics** | `/insights` KPIs, latency histogram, 100% eval pass rate, 209 passing tests |
| **3:45 – 4:00** | 15s | **7. Architecture & Code Wrap-up** | High-level repo summary: WebSocket worklet, Neon Postgres, deterministic policies |

---

## 🎬 Detailed Demonstration Walkthrough

---

### Segment 1: System Intro & Multi-Brand Setup (0:00 – 0:30)

**Visual:** Browser at `http://localhost:3000`. Clean dark-mode interface with the glowing central audio Orb, the Test Orders panel on the right, and the brand toggle in the top navbar.

* **Action:**
  1. Hover briefly over the central Orb and test order chips on the right (`ORD-101`, `ORD-102`, `ORD-103`).
  2. Point out the top navbar brand toggle showing **Aura Skincare** (gold theme) and **Kaveri Coffee Roasters** (terracotta theme). Leave Aura Skincare active.
* **Spoken (Presenter):**
  > "Hello! Today we’re demonstrating **Aria**, an autonomous multimodal voice support agent designed for high-stakes e-commerce customer service.
  > Aria connects directly to Google's Gemini Live native audio model over bi-directional WebSockets using client-side AudioWorklets, delivering natural turn-taking in under 500 milliseconds.
  > Crucially, Aria isn't just an unconstrained LLM — every sensitive action is enforced by deterministic server-side policy code and two-phase cryptographic confirmation."

---

### Segment 2: Order Lookup & Two-Phase Cancellation (0:30 – 1:15)

**Visual:** Click the large **"Start Call"** button. The central Orb awakens into a breathing gold/green listening state. The live streaming transcript activates.

* **Action:** Click "Start Call". Microphone permission connects.
* **Spoken (Presenter):**
  > *"Hi Aria, could you please check the status of my order ORD-103?"*
* **Aria Spoken Response:**
  > *"One moment, let me check that... Order ORD-103 for Ananya Iyer is currently Processing. It includes the Kumkumadi Night Oil and was placed 2 hours ago."*
* **Presenter Follow-up (Trigger Cancellation):**
  > *"I actually don't need it anymore. Can you please cancel it?"*
* **Visual Cue (Agent Brain Panel / Transcript):**
  - Point to the inline chip: `requestCancellation (Phase 1)`.
  - The server verifies that ORD-103 is `Processing` (<4h window), mints a SHA-256 hashed single-use `confirmToken` with a 2-minute expiration, and returns `CONFIRMATION_REQUIRED`.
* **Aria Spoken Response (Required Verbal Confirmation):**
  > *"Order ORD-103 is eligible for cancellation. Shall I go ahead and cancel order ORD-103 for you?"*
* **Presenter Confirmation:**
  > *"Yes, please go ahead and cancel it."*
* **Visual Cue:**
  - Aria executes `requestCancellation (Phase 2)` passing the `confirmToken`.
  - The server consumes the token and writes a session override to the database.
* **Aria Spoken Response:**
  > *"Order ORD-103 has been successfully cancelled. Your refund will reflect on your original payment method in 3 to 5 business days."*
* **Presenter Observation:**
  - Notice the order badge in the right panel immediately updates from `Processing` to `Cancellation Requested`.

---

### Segment 3: Policy Refusal & Support Ticket Creation (1:15 – 2:15)

**Visual:** Click the **"Agent Brain"** tab in the right panel to show the live cognitive reasoning view.

* **Spoken (Presenter):**
  > *"I also have an older order, ORD-102. Can I return that one?"*
* **Aria Spoken Response:**
  > *"One moment, let me check order ORD-102... That order for the Hydrating Sunscreen was delivered 14 days ago. Our return policy only permits returns within 7 days of delivery, so it is no longer eligible for a return."*
* **Visual Cue (Agent Brain Panel):**
  - Show the red policy verdict event in the **Agent Brain panel**:
    - **Kind:** `POLICY_VERDICT`
    - **Rule Cited Badge:** `RETURN_WINDOW_EXCEEDED`
    - **Explanation:** *"Delivered 14 days ago (policy requires within 7 days)."*
  - Emphasize that Aria did not make an unauthorized promise or offer an illegal return exception.
* **Presenter Follow-up (Pivot to Damaged Item):**
  > *"Well, when the box arrived, the bottle was cracked and the serum was completely leaking out."*
* **Visual Cue:**
  - Aria evaluates damage reporting policy. Because delivery was past 48 hours or requires inspection, she routes to customer support.
  - Tool execution chip appears: `createSupportTicket({ category: "DAMAGED_DEFECTIVE", orderId: "ORD-102" })`.
* **Aria Spoken Response:**
  > *"I'm so sorry to hear that. I have created support ticket #1 for you under damaged items. Please have photos of the damaged bottle ready, and our support team will reach out shortly to assist."*

---

### Segment 4: Live Interruption & Instant Barge-In (2:15 – 2:45)

**Visual:** Active in-call session. Demonstrating instantaneous client-side buffer drainage.

* **Spoken (Presenter):**
  > *"Can you give me the full ingredient list and all instructions for how to apply the Kumkumadi Night Oil?"*
* **Aria starts speaking a long answer:**
  > *"Certainly! Aura's Kumkumadi Night Oil contains pure Kashmiri saffron, sandalwood extract, goat milk, lotus stamen, vetiver, and—"*
* **Action (Presenter interrupts loudly mid-sentence):**
  > *"Wait Aria, wait! Actually check order ORD-101 instead!"*
* **Visual & Audio Highlights:**
  - Audio playback **cuts off instantly** (<50ms latency) the millisecond user speech is registered by the Web Audio API.
  - Zero echo bleed or audio overlap.
  - Aria immediately ceases outputting the previous turn and pivots to lookup `ORD-101`.
* **Aria Spoken Response:**
  > *"One moment... Order ORD-101 for Priya Sharma is currently Out for Delivery with BlueDart, expected today by 6 PM."*

---

### Segment 5: Natural Closing, Summary & QA Scorecard (2:45 – 3:15)

**Visual:** Ending the conversation cleanly and inspecting the post-call intelligence modal.

* **Spoken (Presenter):**
  > *"That's everything I needed. Thank you so much, bye!"*
* **Aria Spoken Response:**
  > *"You're very welcome! Have a wonderful day, goodbye!"*
* **Visual Cue:**
  - The `SilenceTimer` / natural closing detector identifies the goodbye intent and automatically terminates the call after a 2-second grace period.
  - The **Post-Call Intelligence Modal** automatically slides open:
    1. **Structured JSON Extraction (Gemini 2.5 Flash):**
       - **Intent:** `ORDER_STATUS_AND_CANCELLATION`
       - **Resolution Status:** `RESOLVED`
       - **Customer Sentiment:** `POSITIVE`
       - **Actions Taken:** `ORD-103 cancelled, ORD-102 return refused per policy, Ticket #1 opened`.
    2. **User Voice Inputs Replay Player:**
       - Point to the waveform scrubber reflecting the recorded customer audio turns, with playback speed toggles (1x, 1.25x, 1.5x) and synchronized transcript highlighting.
    3. **Automated QA Scorecard:**
       - Show the 5-point radar breakdown: *Policy Adherence (5/5)*, *Accuracy of Info (5/5)*, *Empathy & Tone (4.8/5)*, *Conciseness (4.9/5)*, *Resolution (5/5)*.
       - Note the badge: `No Unsupported Promises Detected`.

---

### Segment 6: Observability Dashboard & Evaluation Metrics (3:15 – 3:45)

**Visual:** Click the **"Insights"** tab in the navbar to open `/insights`.

* **Action:**
  - Scroll smoothly through the public observability dashboard.
* **Spoken (Presenter):**
  > "Now let's look at the **Insights Dashboard** at `/insights`, which aggregates real-time operational telemetry across all sessions.
  > Here we track:
  > - Total call volume, average call duration, and our p50 voice response latency.
  > - Resolution breakdowns via the donut chart and top customer intents via the bar chart.
  > - Turn latency distribution histogram, showing our median voice latency well under 500 milliseconds.
  > - The recent calls table with click-to-inspect drawers containing full transcripts and raw JSON logs.
  > In our automated evaluation suite (`npm run eval`), Aria achieves a **100% pass rate** across comprehensive multi-brand test scenarios, backed by **209 unit tests passing** in Vitest."

---

### Segment 7: 15-Second Architecture Summary (3:45 – 4:00)

**Visual:** Split screen or quick view of the repository directory tree and architecture diagram in `README.md`.

* **Spoken (Presenter):**
  > "To wrap up: Aria pairs **Google Gemini Live's native audio streaming** with an **AudioWorklet pipeline**, an **automated Groq classic fallback**, a **deterministic policy engine**, and **Neon Serverless Postgres**.
  > It provides the sub-second speed modern customers expect with the strict guardrails enterprise brands demand.
  > Thanks for watching!"

---

## 💡 Presenter Tips & Contingencies

1. **Microphone Setup:** Use headphones to ensure clean acoustic separation and highlight barge-in clarity without acoustic room feedback.
2. **Fallback Mode Demo (Optional):** If you want to demonstrate the fallback voice mode, click the **"Mode"** toggle in the top bar to switch from `Realtime` to `Classic` (Groq LLM + Web Speech API) to show zero-downtime reliability.
3. **Resetting Session Data:** If you want to rehearse the flow again from scratch, click the **"Reset Session"** button in the Test Orders panel; this clears per-session database overrides and restores all orders to their default seed state.
