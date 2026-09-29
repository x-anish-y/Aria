import { describe, it, expect, beforeEach } from "vitest";
import { requestCancellation, getOrderDetails } from "@/lib/tools";
import {
  saveCancelConfirmation,
  getCancelConfirmation,
  deleteSessionOverrides,
} from "@/lib/db";
import { deriveDecisionEventsFromTool, DECISION_KINDS } from "@/lib/decision-events";
import crypto from "crypto";

describe("Two-Step Confirmation for Destructive Actions (Task 14)", () => {
  const sessionId = "test-session-twostep-" + Date.now();

  beforeEach(async () => {
    await deleteSessionOverrides(sessionId);
  });

  it("ORD-101 never issues a token (ineligible due to Out for Delivery status)", async () => {
    const res = await requestCancellation({ orderId: "ORD-101" }, sessionId);

    expect(res.success).toBe(false);
    expect(res.status).toBe("REFUSED");
    expect(res.error).toBe("CANCELLATION_NOT_ALLOWED");
    expect(res.confirmToken).toBeUndefined();
    expect(res.ruleCited).toMatch(/Out for Delivery/i);
    expect(res.reason).toMatch(/doorstep/i);
  });

  it("Phase 1 issues a hashed single-use token with 2-minute expiry for ORD-103", async () => {
    const res = await requestCancellation({ orderId: "ORD-103" }, sessionId);

    expect(res.success).toBe(true);
    expect(res.status).toBe("CONFIRMATION_REQUIRED");
    expect(res.confirmToken).toBeDefined();
    expect(typeof res.confirmToken).toBe("string");
    expect(res.confirmToken.startsWith("aria_cnfp_")).toBe(true);
    expect(res.order_id).toBe("ORD-103");
    expect(res.expiresAt).toBeDefined();

    // Verify token was stored hashed in cancel_confirmations
    const tokenHash = crypto.createHash("sha256").update(res.confirmToken).digest("hex");
    const record = await getCancelConfirmation(tokenHash);
    expect(record).not.toBeNull();
    expect(record.session_id).toBe(sessionId);
    expect(record.order_id).toBe("ORD-103");
    expect(record.used).toBe(false);

    // Verify expiry is within ~2 minutes
    const expiresAt = new Date(record.expires_at).getTime();
    const now = Date.now();
    expect(expiresAt - now).toBeGreaterThan(110 * 1000); // > 110s
    expect(expiresAt - now).toBeLessThanOrEqual(121 * 1000); // <= 120s
  });

  it("Phase 2 without token fails (missing token)", async () => {
    // Explicit Phase 2 flag without confirmToken
    const res1 = await requestCancellation({ orderId: "ORD-103", phase: 2 }, sessionId);
    expect(res1.success).toBe(false);
    expect(res1.error).toBe("MISSING_CONFIRM_TOKEN");

    // Empty string confirmToken
    const res2 = await requestCancellation({ orderId: "ORD-103", confirmToken: "" }, sessionId);
    expect(res2.success).toBe(false);
    expect(res2.error).toBe("MISSING_CONFIRM_TOKEN");
  });

  it("Phase 2 with expired token fails", async () => {
    const expiredToken = "aria_cnfp_expired_" + Date.now();
    const tokenHash = crypto.createHash("sha256").update(expiredToken).digest("hex");

    // Store token that expired 10 seconds ago
    await saveCancelConfirmation({
      sessionId,
      orderId: "ORD-103",
      tokenHash,
      expiresAt: new Date(Date.now() - 10000),
    });

    const res = await requestCancellation(
      { orderId: "ORD-103", confirmToken: expiredToken },
      sessionId
    );

    expect(res.success).toBe(false);
    expect(res.error).toBe("TOKEN_EXPIRED");
    expect(res.message).toMatch(/expired/i);
  });

  it("Phase 2 with token from another session fails", async () => {
    const sessionA = "session-user-A";
    const sessionB = "session-user-B";

    // Phase 1 in session A
    const phase1Res = await requestCancellation({ orderId: "ORD-103" }, sessionA);
    expect(phase1Res.confirmToken).toBeDefined();

    // Attacker tries to consume token in session B
    const attackRes = await requestCancellation(
      { orderId: "ORD-103", confirmToken: phase1Res.confirmToken },
      sessionB
    );

    expect(attackRes.success).toBe(false);
    expect(attackRes.error).toBe("INVALID_SESSION");
    expect(attackRes.message).toMatch(/different session/i);
  });

  it("Phase 2 token reuse fails (single-use enforcement)", async () => {
    const isolatedSession = "session-reuse-test-" + Date.now();

    // Phase 1
    const p1 = await requestCancellation({ orderId: "ORD-103" }, isolatedSession);
    expect(p1.confirmToken).toBeDefined();

    // Phase 2 First Use (Happy)
    const p2First = await requestCancellation(
      { orderId: "ORD-103", confirmToken: p1.confirmToken },
      isolatedSession
    );
    expect(p2First.success).toBe(true);
    expect(p2First.status).toBe("CANCELLED");

    // Phase 2 Second Use (Reuse attempt)
    const p2Second = await requestCancellation(
      { orderId: "ORD-103", confirmToken: p1.confirmToken },
      isolatedSession
    );
    expect(p2Second.success).toBe(false);
    expect(p2Second.error).toBe("TOKEN_ALREADY_USED");
    expect(p2Second.message).toMatch(/already been used/i);
  });

  it("ORD-103 full happy path (Phase 1 confirmation prompt -> Phase 2 confirmed -> override applied)", async () => {
    const testSession = "session-happy-path-" + Date.now();

    // 1. Initial status is Processing
    const initialOrder = await getOrderDetails("ORD-103", testSession);
    expect(initialOrder.order.status).toBe("Processing");
    expect(initialOrder.eligibility.canCancel).toBe(true);

    // 2. Phase 1: Request cancellation
    const p1 = await requestCancellation({ orderId: "ORD-103" }, testSession);
    expect(p1.status).toBe("CONFIRMATION_REQUIRED");
    expect(p1.confirmToken).toBeDefined();

    // Order status should STILL be Processing (not yet cancelled!)
    const midOrder = await getOrderDetails("ORD-103", testSession);
    expect(midOrder.order.status).toBe("Processing");

    // 3. Phase 2: Confirm cancellation
    const p2 = await requestCancellation(
      { orderId: "ORD-103", confirmToken: p1.confirmToken },
      testSession
    );
    expect(p2.success).toBe(true);
    expect(p2.status).toBe("CANCELLED");
    expect(p2.order_id).toBe("ORD-103");

    // 4. Order status is now updated to Cancellation Requested, and canCancel is false
    const finalOrder = await getOrderDetails("ORD-103", testSession);
    expect(finalOrder.order.status).toBe("Cancellation Requested");
    expect(finalOrder.eligibility.canCancel).toBe(false);
  });

  it("Emits Agent Brain guardrail events for 'Confirmation required' and 'Cancellation confirmed'", () => {
    // 1. Phase 1 event emission
    const p1Events = deriveDecisionEventsFromTool(
      "requestCancellation",
      { orderId: "ORD-103" },
      {
        success: true,
        status: "CONFIRMATION_REQUIRED",
        confirmToken: "aria_cnfp_abc123",
        message: "Cancellation requires confirmation.",
      },
      80
    );

    const confirmRequiredEvent = p1Events.find(
      (e) => e.title === "Confirmation required" && e.kind === DECISION_KINDS.GUARDRAIL
    );
    expect(confirmRequiredEvent).toBeDefined();
    expect(confirmRequiredEvent.status).toBe("info");

    // 2. Phase 2 event emission
    const p2Events = deriveDecisionEventsFromTool(
      "requestCancellation",
      { orderId: "ORD-103", confirmToken: "aria_cnfp_abc123" },
      {
        success: true,
        status: "CANCELLED",
        order_id: "ORD-103",
        message: "Order ORD-103 has been successfully cancelled.",
      },
      95
    );

    const cancelConfirmedEvent = p2Events.find(
      (e) => e.title === "Cancellation confirmed" && e.kind === DECISION_KINDS.GUARDRAIL
    );
    expect(cancelConfirmedEvent).toBeDefined();
    expect(cancelConfirmedEvent.status).toBe("allowed");

    const policyVerdictEvent = p2Events.find(
      (e) => e.title === "Order Cancellation Approved" && e.kind === DECISION_KINDS.POLICY_VERDICT
    );
    expect(policyVerdictEvent).toBeDefined();
  });
});
