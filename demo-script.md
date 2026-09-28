# Aria — 4-Minute Video Demonstration Script

> **Video Duration:** 4:00 (240 seconds)  
> **Target Audience:** Hiring managers, technical evaluators, lead engineers  
> **Presenter Setup:** Google Chrome browser, microphone enabled, `http://localhost:3000` (or live Vercel URL), database seeded with `npm run db:setup`.

---

## ⏱️ Video Timeline Overview

| Timestamp | Duration | Section | Key Focus |
| :--- | :---: | :--- | :--- |
| **0:00 – 0:15** | 15s | **1. Introduction & Hook** | Product vision, brand context, sub-500ms voice |
| **0:15 – 0:50** | 35s | **2. Live Order Lookup** | Mic connection, real-time voice, tool invocation |
| **0:50 – 1:30** | 40s | **3. Policy Decline & Hinglish** | Doorstep refusal advice, policy guardrail, Hinglish |
| **1:30 – 2:00** | 30s | **4. Barge-In Interruption** | Web Audio cut-off, instant buffer drainage |
| **2:00 – 2:35** | 35s | **5. Allowed Action & Fallback** | `ORD-103` cancellation, classic fallback resilience |
| **2:35 – 3:05** | 30s | **6. Post-Call Summary & JSON** | Structured intelligence, sentiment, DB persistence |
| **3:05 – 3:30** | 25s | **7. Executive Insights Page** | `/insights` dashboard, KPIs, scaling notes |
| **3:30 – 4:00** | 30s | **8. Architecture & Security** | Ephemeral tokens, 3-layer guardrail, engineering recap |

---

## 🎬 Minute-by-Minute Script & Action Plan

---

### Segment 1: Introduction & Hook (0:00 – 0:15)
**Screen:** Main landing page (`/`) showing the Botanical Sanctuary dark UI, glowing central Orb, and Test Orders drawer.

* **Action:** Hover mouse over the central Orb and the sample test order cards on the right.
* **Spoken Script:**
  > "Hi everyone, this is **Aria** — a production-grade autonomous voice support agent built for Aura Skincare, a luxury organic D2C brand in India.
  > Unlike traditional laggy chatbots, Aria streams raw 16kHz audio over WebSockets directly to Google's Gemini Live native audio model, achieving conversational voice responses in under 500 milliseconds with zero client-side API key exposure."

---

### Segment 2: Live Order Lookup (0:15 – 0:50)
**Screen:** Click **"Start Call"**. Orb shifts into breathing emerald listening state.

* **Action:** Click "Start Call". Microphone permission activates. Live transcript starts streaming.
* **Spoken (Presenter):**
  > *"Hey Aria, can you check the status of my order ORD-101?"*
* **Aria Response (Audio & Transcript):**
  > *"Certainly! Let me look up order ORD-101 for Priya Sharma... Your Vitamin C Serum is currently Out for Delivery with BlueDart tracking BD-982103, expected by 6 PM today."*
* **Visual Highlights to Point Out:**
  - Notice the **latency badge** (<450ms).
  - Point to the inline **`getOrderDetails` tool chip** rendered in the transcript.
  - Show the live audio waveform pulsing synchronously with the speaker's voice.

---

### Segment 3: Policy Decline & Hinglish Handling (0:50 – 1:30)
**Screen:** Still in call. Focus on the policy evaluation guardrail in action.

* **Spoken (Presenter):**
  > *"Actually, I changed my mind. Please cancel ORD-101 right now."*
* **Aria Response:**
  > *"I understand, Priya. However, because your order is already out for delivery with the courier, our policy doesn't allow cancellations at this stage. But don't worry — you can simply refuse delivery at your doorstep when the delivery partner arrives, and a full refund will be processed automatically."*
* **Hinglish Follow-up (Presenter):**
  > *"Achha theek hai, toh kya doorstep refusal par koi extra charge katega?"*
* **Aria Response (Bilingual/Hinglish):**
  > *"Nahi, bilkul nahi! Doorstep refusal par koi penalty ya shipping charge nahi lagega. Full refund aapke original payment mode par 3 se 5 din mein credit ho jayega."*
* **Key Point to Mention:**
  - Emphasize that the agent did **not hallucinate a cancellation**; it strictly enforced `lib/policy.js` rules while giving helpful, brand-safe doorstep refusal advice.

---

### Segment 4: Interruption & Barge-In (1:30 – 2:00)
**Screen:** In-call interface. Demonstrating zero-latency interruption.

* **Spoken (Presenter):**
  > *"Can you tell me all the ingredients inside the Vitamin C Serum in detail?"*
* **Aria starts speaking:**
  > *"Our Vitamin C Serum is formulated with 10% pure L-Ascorbic Acid, ethically sourced Kakadu Plum extract, Ferulic Acid, Hyaluronic—"*
* **Action (Presenter interrupts loudly mid-sentence):**
  > *"Wait, wait, Aria! Just tell me if it has any artificial fragrance!"*
* **Aria behavior:**
  - Audio playback **instantly cuts off** (zero residual speech bleed).
  - Transcript updates immediately to the new turn.
* **Aria Response:**
  > *"No, it contains zero artificial fragrance or synthetic dyes. It is 100% natural and dermatologist tested."*
* **Key Point to Mention:**
  - Explain how the custom `AudioWorklet` clears the playback queue and sends a cancellation frame to Gemini Live without breaking the audio context.

---

### Segment 5: Allowed Cancellation & Fallback Mode (2:00 – 2:35)
**Screen:** In-call or toggling fallback mode.

* **Spoken (Presenter):**
  > *"Great. I also placed order ORD-103 about three hours ago. Can you cancel that one?"*
* **Aria Response:**
  > *"Checking ORD-103 for Ananya Iyer... Since this order was placed 3 hours ago and is still Processing, it's well within our 4-hour cancellation window. I have successfully cancelled your order. Your refund of ₹549 will reflect in 3 to 5 business days."*
* **Action:**
  - Notice the `cancelOrder` tool chip in the transcript.
  - Notice the test order status badge in the right panel updates in real-time from `Processing` to `Cancelled`.
  - Briefly demonstrate the **Classic Mode toggle** (Groq LLM + Web Speech API) to show zero-downtime resilience if Google Live is throttled.

---

### Segment 6: Post-Call Summary & JSON Audit (2:35 – 3:05)
**Screen:** Click **"End Call"**. Screen smoothly transitions into the Post-Call Summary view via Framer Motion.

* **Action:** Click "End Call".
* **Visuals to Showcase:**
  - **Structured Summary Card:** Intent (`CANCELLATION`), Resolution (`RESOLVED`), Sentiment badge (`POSITIVE`), and Policy Notes.
  - Click **"View Raw JSON"** button to reveal the exact structured payload persisted to the Neon database:
    ```json
    {
      "customer_intent": "CANCELLATION",
      "order_id": "ORD-103",
      "resolution_status": "RESOLVED",
      "actions_taken": ["getOrderDetails", "cancelOrder"],
      "customer_sentiment": "POSITIVE"
    }
    ```
  - Click the **History Drawer** icon in the navbar to show multi-call persistence across sessions.

---

### Segment 7: Executive Insights Page (3:05 – 3:30)
**Screen:** Navigate to `/insights` via the top navigation bar.

* **Action:** Show the live analytics dashboard.
* **Key Metrics to Highlight:**
  - Animated KPI counters: Total Calls, Average Duration, p50 / p95 Latency.
  - Interactive charts: Intent distribution bar chart, Resolution donut, Daily call volume.
  - Recent calls audit table with slide-over detail modal.
  - Point to the **"Scaling to 1,000 Calls/Day"** architectural analysis card at the bottom.

---

### Segment 8: Architecture Walkthrough & Security (3:30 – 4:00)
**Screen:** Return to `/` or show the README Mermaid architecture diagram.

* **Spoken Script (Closing):**
  > "To wrap up, here are the three core architectural decisions behind Aria:
  > 
  > 1. **Zero Secret Leakage:** Browser clients never touch the master `GEMINI_API_KEY`. The server mints ephemeral 30-minute tokens via `/api/token`.
  > 2. **Three-Layer Guardrails:** Natural language prompts are backed by a deterministic code policy engine in `lib/policy.js` and verified again with server-side database checks before executing any mutation.
  > 3. **Serverless Neon Postgres:** All orders, calls, and support tickets persist in serverless Postgres with an instant in-memory fallback.
  > 
  > Aria is fully open-source, passes all 122 unit tests and 25 automated scenario evals, and is ready to deploy on Vercel with a single click. Thanks for watching!"

---

## 💡 Presenter Tips for a Flawless Recording

1. **Audio Setup:** Use headphones to prevent microphone feedback while Aria speaks.
2. **Speed & Clarity:** Speak clearly at a moderate pace; pronounce order IDs as "O-R-D 1-0-1".
3. **Screen Resolution:** Record at 1080p (1920x1080) with 100% or 110% browser zoom for maximum readability.
4. **Mouse Movement:** Keep mouse movements intentional; pause cursor over badges and tool chips when explaining them.
