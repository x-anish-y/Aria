import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeOrderId,
  getOrderDetails,
  requestCancellation,
  createSupportTicket,
  clearSessionOverrides,
} from '@/lib/tools';

describe('lib/tools.js — Tool implementations & Session Isolation', () => {
  beforeEach(async () => {
    // Clear overrides before each test
    await clearSessionOverrides('test-session-A');
    await clearSessionOverrides('test-session-B');
    await clearSessionOverrides('test-session-fresh');
  });

  describe('normalizeOrderId(rawInput)', () => {
    it('normalizes various casing and spacing patterns', () => {
      expect(normalizeOrderId('ord 101')).toBe('ORD-101');
      expect(normalizeOrderId('ORD101')).toBe('ORD-101');
      expect(normalizeOrderId('ord-101')).toBe('ORD-101');
      expect(normalizeOrderId('101')).toBe('ORD-101');
      expect(normalizeOrderId('102')).toBe('ORD-102');
      expect(normalizeOrderId('103')).toBe('ORD-103');
      expect(normalizeOrderId('ORD - 103')).toBe('ORD-103');
      expect(normalizeOrderId('ord 102')).toBe('ORD-102');
    });

    it('normalizes spoken order IDs with spelled-out words and letters', () => {
      expect(normalizeOrderId('O R D dash one zero one')).toBe('ORD-101');
      expect(normalizeOrderId('o r d dash one zero two')).toBe('ORD-102');
      expect(normalizeOrderId('O R D dash one zero three')).toBe('ORD-103');
      expect(normalizeOrderId('order one zero one')).toBe('ORD-101');
      expect(normalizeOrderId('order 101')).toBe('ORD-101');
      expect(normalizeOrderId('O R D 101')).toBe('ORD-101');
      expect(normalizeOrderId('o r d dash 103')).toBe('ORD-103');
    });

    it('returns null for missing, empty, or unparseable input', () => {
      expect(normalizeOrderId('')).toBeNull();
      expect(normalizeOrderId(null)).toBeNull();
      expect(normalizeOrderId(undefined)).toBeNull();
      expect(normalizeOrderId('    ')).toBeNull();
      expect(normalizeOrderId('hello world')).toBeNull();
    });
  });

  describe('getOrderDetails(orderId, sessionId)', () => {
    it('returns MISSING_ORDER_ID error when orderId is empty or invalid', async () => {
      const resEmpty = await getOrderDetails('', 'test-session-fresh');
      expect(resEmpty.found).toBe(false);
      expect(resEmpty.error).toBe('MISSING_ORDER_ID');
      expect(resEmpty.message).toBeDefined();

      const resNull = await getOrderDetails(null, 'test-session-fresh');
      expect(resNull.found).toBe(false);
      expect(resNull.error).toBe('MISSING_ORDER_ID');
    });

    it('returns ORDER_NOT_FOUND error when order is not in seed data', async () => {
      const res = await getOrderDetails('ORD-999', 'test-session-fresh');
      expect(res.found).toBe(false);
      expect(res.error).toBe('ORDER_NOT_FOUND');
      expect(res.message).toBeDefined();
    });

    it('returns found: true with order and calculated eligibility for ORD-101', async () => {
      const res = await getOrderDetails('ord 101', 'test-session-fresh');
      expect(res.found).toBe(true);
      expect(res.order.order_id).toBe('ORD-101');
      expect(res.order.customer_name).toBe('Priya Sharma');
      expect(res.order.status).toBe('Out for Delivery');
      expect(res.eligibility.canCancel).toBe(false);
      expect(res.eligibility.canReturn).toBe(false);
      expect(res.eligibility.canReportDamage).toBe(false);
      expect(res.eligibility.reasons.damage).toBe(
        'not delivered yet; customer can refuse delivery at the doorstep if out for delivery'
      );
      expect(res.eligibility.shippingFee).toBe(0);
      expect(res.eligibility.codAvailable).toBe(true);
      expect(res.eligibility.reasons.cancel).toMatch(/doorstep|refuse/i);
    });

    it('returns correct eligibility for ORD-102 (Delivered 14 days ago)', async () => {
      const res = await getOrderDetails('ORD-102', 'test-session-fresh');
      expect(res.found).toBe(true);
      expect(res.order.order_id).toBe('ORD-102');
      expect(res.eligibility.canCancel).toBe(false);
      expect(res.eligibility.canReturn).toBe(false);
      expect(res.eligibility.canReportDamage).toBe(false);
      expect(res.eligibility.reasons.damage).toContain('DAMAGE_WINDOW');
      expect(res.eligibility.reasons.damage).toContain('14 days ago');
    });

    it('returns only fields the agent needs (no internal raw DB metadata) for ORD-103', async () => {
      const res = await getOrderDetails('103', 'test-session-fresh');
      expect(res.found).toBe(true);
      expect(res.order.order_id).toBe('ORD-103');
      expect(res.order.customer_name).toBe('Ananya Patel');
      expect(res.order.product).toBe('Green Tea Face Wash + Toner');
      expect(res.order.value_inr).toBe(850);
      expect(res.order.status).toBe('Processing');
      expect(res.eligibility.canCancel).toBe(true);
      expect(res.eligibility.canReportDamage).toBe(false);
    });
  });

  describe('requestCancellation(orderId, sessionId)', () => {
    it('cancellation re-check refuses ORD-101 because status is Out for Delivery', async () => {
      const res = await requestCancellation('ORD-101', 'test-session-fresh');
      expect(res.success).toBe(false);
      expect(res.error).toBe('CANCELLATION_NOT_ALLOWED');
      expect(res.reason).toMatch(/doorstep|refuse/i);
    });

    it('successfully cancels ORD-103 when status is Processing (two-phase)', async () => {
      const p1 = await requestCancellation('ORD-103', 'test-session-fresh');
      expect(p1.status).toBe('CONFIRMATION_REQUIRED');
      expect(p1.confirmToken).toBeDefined();

      const res = await requestCancellation(
        { orderId: 'ORD-103', confirmToken: p1.confirmToken },
        'test-session-fresh'
      );
      expect(res.success).toBe(true);
      expect(res.order_id).toBe('ORD-103');
      expect(res.status).toBe('CANCELLED');
    });

    it('refuses cancellation on second attempt for the same session', async () => {
      const p1 = await requestCancellation('ORD-103', 'test-session-A');
      const first = await requestCancellation(
        { orderId: 'ORD-103', confirmToken: p1.confirmToken },
        'test-session-A'
      );
      expect(first.success).toBe(true);

      // Second attempt in same session must be refused by eligibility re-check
      const second = await requestCancellation('ORD-103', 'test-session-A');
      expect(second.success).toBe(false);
      expect(second.error).toBe('CANCELLATION_NOT_ALLOWED');
      expect(second.reason).toMatch(/already.*cancellation.*requested/i);
    });
  });

  describe('Session Isolation', () => {
    it('cancellation in session A is invisible in session B', async () => {
      // 1. Session A cancels ORD-103
      const p1A = await requestCancellation('ORD-103', 'test-session-A');
      const cancelResA = await requestCancellation(
        { orderId: 'ORD-103', confirmToken: p1A.confirmToken },
        'test-session-A'
      );
      expect(cancelResA.success).toBe(true);

      // 2. Query ORD-103 in Session A -> status is "Cancellation Requested", canCancel is false
      const orderA = await getOrderDetails('ORD-103', 'test-session-A');
      expect(orderA.found).toBe(true);
      expect(orderA.order.status).toBe('Cancellation Requested');
      expect(orderA.eligibility.canCancel).toBe(false);

      // 3. Query ORD-103 in Session B -> status is still "Processing", canCancel is true!
      const orderB = await getOrderDetails('ORD-103', 'test-session-B');
      expect(orderB.found).toBe(true);
      expect(orderB.order.status).toBe('Processing');
      expect(orderB.eligibility.canCancel).toBe(true);

      // 4. Session B can cancel independently
      const p1B = await requestCancellation('ORD-103', 'test-session-B');
      const cancelResB = await requestCancellation(
        { orderId: 'ORD-103', confirmToken: p1B.confirmToken },
        'test-session-B'
      );
      expect(cancelResB.success).toBe(true);
    });

    it('clearing session overrides resets status back to base order', async () => {
      const p1 = await requestCancellation('ORD-103', 'test-session-A');
      await requestCancellation(
        { orderId: 'ORD-103', confirmToken: p1.confirmToken },
        'test-session-A'
      );
      let order = await getOrderDetails('ORD-103', 'test-session-A');
      expect(order.order.status).toBe('Cancellation Requested');

      await clearSessionOverrides('test-session-A');
      order = await getOrderDetails('ORD-103', 'test-session-A');
      expect(order.order.status).toBe('Processing');
    });
  });

  describe('createSupportTicket({ orderId, category, description }, sessionId)', () => {
    it('creates a ticket with valid category and returns ticketId', async () => {
      const res = await createSupportTicket(
        {
          orderId: 'ORD-101',
          category: 'DAMAGED_DEFECTIVE',
          description: 'The serum bottle leaked inside the box.',
        },
        'test-session-fresh'
      );
      expect(res.success).toBe(true);
      expect(res.ticketId).toBeDefined();
    });

    it('must NOT promise refund or specific timelines in response message', async () => {
      const res = await createSupportTicket(
        {
          orderId: 'ORD-102',
          category: 'DELIVERY_ISSUE',
          description: 'Package was marked delivered but arrived damaged.',
        },
        'test-session-fresh'
      );
      expect(res.success).toBe(true);
      // Verify message does not make unauthorized refund or timeline promises
      expect(res.message).not.toMatch(/refund in \d+/i);
      expect(res.message).not.toMatch(/will refund/i);
      expect(res.message).not.toMatch(/within \d+ (hours|days)/i);
      expect(res.message).toMatch(/team will review|ticket.*created/i);
    });

    it('accepts ticket creation without orderId for general inquiry (OTHER)', async () => {
      const res = await createSupportTicket(
        {
          category: 'OTHER',
          description: 'Customer asking about ingredient allergy.',
        },
        'test-session-fresh'
      );
      expect(res.success).toBe(true);
      expect(res.ticketId).toBeDefined();
    });
  });
});
