# Aria Manual Voice Testing Checklist

This checklist documents critical voice evaluation scenarios that require real microphone, audio hardware, and acoustic testing beyond automated text simulations.

---

## 1. Mumbling & Low Intelligibility
- **Test Prompt:** *"Mmm... can you check... ord... uh... one zero... one?"* (Mumble softly under your breath, drop final consonants).
- **Setup:** Normal indoor room, low vocal volume (whisper to low conversational).
- **Expected Behavior:**
  - Aria should detect speech, but recognize low intelligibility.
  - Aria politely requests clarification: *"I couldn't catch that clearly. Could you please repeat your order ID?"*
  - **Failure Condition:** Aria guesses an incorrect order number or hallucinates a status.
- [ ] Pass / [ ] Fail — Notes:

---

## 2. Extended Silence & Mid-Sentence Pauses
- **Test Prompt A (Initial Silence):** Press "Start Call", remain completely silent for 15 seconds.
- **Test Prompt B (Mid-Sentence Hesitation):** *"Where is my... [pause 6 seconds without speaking]... order ORD-101?"*
- **Expected Behavior:**
  - AudioWorklet and VAD should maintain `listening` state without crashing or looping audio.
  - If silence persists beyond threshold, Aria gently prompts: *"Are you still there? How can I assist you with Aura Skincare?"*
  - Empty disconnect is accurately classified as `ABANDONED` on post-call evaluation.
  - **Failure Condition:** Agent cuts off user mid-thought or produces repetitive filler loops.
- [ ] Pass / [ ] Fail — Notes:

---

## 3. Real-Time Barge-In (Interruption Mid-Sentence)
- **Test Setup:** Ask *"Where is ORD-101?"* Once Aria starts speaking *"Your order ORD-101 is out for delivery with BlueDart and..."*, immediately talk over her: *"Wait! Can I change the address?"*
- **Expected Behavior:**
  - Agent playback stops immediately (within <150ms).
  - Audio output buffer is flushed with zero audible stutter or crackle.
  - Aria addresses the interruption seamlessly.
  - **Failure Condition:** Aria keeps talking over the user, or delayed mic audio is queued and re-processed after she stops.
- [ ] Pass / [ ] Fail — Notes:

---

## 4. Indian English & Hinglish Accent Code-Switching
- **Test Prompt A:** *"Bhaiya, mera order ORD-101 kab tak aayega? Aaj delivery ho jayegi kya?"*
- **Test Prompt B:** *"Arre suniye, package leak ho gaya hai, photo kahan bhejun?"*
- **Expected Behavior:**
  - Accurately parses mixed Hindi/English vocabulary and numerical order identifiers.
  - Replies in natural, polite Hinglish with Indian cultural fluency.
  - **Failure Condition:** Agent drops Hindi words or misclassifies order numbers as English homophones.
- [ ] Pass / [ ] Fail — Notes:

---

## 5. High Ambient Noise & Reverberation
- **Test Setup:** Turn on a loud ceiling fan, play background café chatter on a secondary phone, or test near traffic noise.
- **Test Prompt:** *"Please check tracking for ORD-101."*
- **Expected Behavior:**
  - Browser echo cancellation (`echoCancellation: true`), noise suppression (`noiseSuppression: true`), and auto-gain control filter steady ambient drone.
  - Voice Activity Detection triggers only on human speech harmonics.
  - **Failure Condition:** Background fan noise or traffic honks trigger continuous `listening` / `thinking` loops.
- [ ] Pass / [ ] Fail — Notes:

---

## Summary Matrix

| Dimension | Key Test Metric | Target Threshold | Status |
| :--- | :--- | :--- | :--- |
| **Mumbling** | Clarification rate without false tool invocation | 100% | Pending Manual Run |
| **Silence** | Graceful abandonment detection without errors | 100% | Verified in Automated Specs |
| **Barge-In** | AudioBuffer source node teardown latency | < 150 ms | Verified in Task 4 |
| **Hinglish** | Indian English colloquial intent accuracy | > 95% | Verified in Automated Specs |
| **Ambient Noise** | False VAD trigger rate in 50 dB background noise | < 5% | Pending Acoustic Chamber |
