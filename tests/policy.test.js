import { describe, it, expect } from 'vitest';
import { canCancel, canReturn, canReportDamage, shippingFee, codAvailable } from '@/lib/policy';
import { seedOrders } from '@/lib/db';

describe('lib/policy.js — Business Rules with Machine-Readable ruleCited & Explanation', () => {
  describe('canCancel(order)', () => {
    it('allows cancellation ONLY when status is "Processing" and returns ruleCited & explanation', () => {
      const processingOrder = { status: 'Processing', placed_hours_ago: 2 };
      const res = canCancel(processingOrder);
      expect(res.allowed).toBe(true);
      expect(res.eligible).toBe(true);
      expect(res.reason).toBeNull();
      expect(res.ruleCited).toMatch(/CANCEL_WINDOW.*Processing/i);
      expect(res.explanation).toBeDefined();
    });

    it('refuses cancellation for ORD-101 ("Out for Delivery") and mentions refusal at doorstep', () => {
      const ord101 = { order_id: 'ORD-101', status: 'Out for Delivery' };
      const res = canCancel(ord101);
      expect(res.allowed).toBe(false);
      expect(res.eligible).toBe(false);
      expect(res.reason).toMatch(/doorstep|refuse/i);
      expect(res.ruleCited).toMatch(/CANCEL_WINDOW.*Out for Delivery/i);
      expect(res.explanation).toMatch(/doorstep/i);
    });

    it('refuses cancellation for "Shipped" status and mentions refusal at doorstep', () => {
      const shippedOrder = { status: 'Shipped' };
      const res = canCancel(shippedOrder);
      expect(res.allowed).toBe(false);
      expect(res.reason).toMatch(/doorstep|refuse/i);
      expect(res.ruleCited).toMatch(/CANCEL_WINDOW.*Shipped/i);
    });

    it('refuses cancellation for ORD-102 ("Delivered") because it is already delivered', () => {
      const ord102 = { order_id: 'ORD-102', status: 'Delivered' };
      const res = canCancel(ord102);
      expect(res.allowed).toBe(false);
      expect(res.reason).toMatch(/already delivered/i);
      expect(res.ruleCited).toMatch(/CANCEL_WINDOW.*Delivered/i);
    });

    it('refuses cancellation when already "Cancellation Requested"', () => {
      const pendingCancel = { status: 'Cancellation Requested' };
      const res = canCancel(pendingCancel);
      expect(res.allowed).toBe(false);
      expect(res.reason).toMatch(/already.*cancellation.*requested/i);
      expect(res.ruleCited).toMatch(/CANCEL_WINDOW.*cancellation already requested/i);
    });

    it('refuses cancellation for unknown or null status', () => {
      expect(canCancel(null).allowed).toBe(false);
      expect(canCancel(null).ruleCited).toMatch(/CANCEL_WINDOW/i);
      expect(canCancel({}).allowed).toBe(false);
      expect(canCancel({ status: 'Refunded' }).allowed).toBe(false);
    });
  });

  describe('canReturn(order)', () => {
    it('allows return only when Delivered AND delivered_days_ago <= 7', () => {
      const recentDelivered = {
        order_id: 'ORD-104',
        status: 'Delivered',
        delivered_days_ago: 3,
      };
      const res = canReturn(recentDelivered);
      expect(res.allowed).toBe(true);
      expect(res.eligible).toBe(true);
      expect(res.requiresUnopenedUnusedOriginalPackaging).toBe(true);
      expect(res.damagedDefectiveRule).toBeDefined();
      expect(res.reason).toBeNull();
      expect(res.ruleCited).toMatch(/RETURN_WINDOW: delivered 3 days ago <= 7-day limit/i);
      expect(res.explanation).toMatch(/7-day return window/i);
    });

    it('allows return on boundary delivered_days_ago === 7', () => {
      const boundaryOrder = {
        order_id: 'ORD-104',
        status: 'Delivered',
        delivered_days_ago: 7,
      };
      const res = canReturn(boundaryOrder);
      expect(res.allowed).toBe(true);
      expect(res.ruleCited).toMatch(/delivered 7 days ago <= 7-day limit/i);
    });

    it('refuses return for ORD-102 (Delivered 14 days ago) and cites day count in reason & ruleCited', () => {
      const ord102 = {
        order_id: 'ORD-102',
        status: 'Delivered',
        delivered_days_ago: 14,
      };
      const res = canReturn(ord102);
      expect(res.allowed).toBe(false);
      expect(res.reason).toMatch(/14.*days/i);
      expect(res.reason).toMatch(/7.*days/i);
      expect(res.ruleCited).toMatch(/RETURN_WINDOW: delivered 14 days ago > 7-day limit/i);
      expect(res.explanation).toBeDefined();
      expect(res.requiresUnopenedUnusedOriginalPackaging).toBe(true);
      expect(res.damagedDefectiveRule).toBeDefined();
    });

    it('refuses return for non-delivered orders (ORD-101 and ORD-103)', () => {
      const ord101 = { order_id: 'ORD-101', status: 'Out for Delivery' };
      const ord103 = { order_id: 'ORD-103', status: 'Processing' };

      const res101 = canReturn(ord101);
      expect(res101.allowed).toBe(false);
      expect(res101.reason).toMatch(/only delivered/i);
      expect(res101.ruleCited).toMatch(/RETURN_WINDOW: status is "Out for Delivery"/i);
      expect(res101.requiresUnopenedUnusedOriginalPackaging).toBe(true);

      const res103 = canReturn(ord103);
      expect(res103.allowed).toBe(false);
      expect(res103.reason).toMatch(/only delivered/i);
      expect(res103.ruleCited).toMatch(/RETURN_WINDOW: status is "Processing"/i);
    });

    it('always includes requiresUnopenedUnusedOriginalPackaging and damagedDefectiveRule', () => {
      const res = canReturn({ status: 'Processing' });
      expect(res.requiresUnopenedUnusedOriginalPackaging).toBe(true);
      expect(typeof res.damagedDefectiveRule).toBe('string');
      expect(res.damagedDefectiveRule.length).toBeGreaterThan(10);
      expect(res.ruleCited).toBeDefined();
    });
  });

  describe('shippingFee(value)', () => {
    it('charges Rs 50 when value is exactly Rs 499 (boundary check)', () => {
      const res = shippingFee(499);
      expect(res.fee).toBe(50);
      expect(res.ruleCited).toMatch(/SHIPPING_POLICY.*<= Rs 499/i);
      expect(res.explanation).toBeDefined();
    });

    it('gives free shipping (Rs 0) when value is Rs 500 (boundary check)', () => {
      const res = shippingFee(500);
      expect(res.fee).toBe(0);
      expect(res.ruleCited).toMatch(/SHIPPING_POLICY.*> Rs 499.*free/i);
    });

    it('charges Rs 50 when value is less than Rs 499', () => {
      expect(shippingFee(0).fee).toBe(50);
      expect(shippingFee(250).fee).toBe(50);
      expect(shippingFee(498).fee).toBe(50);
    });

    it('gives free shipping when value is greater than Rs 499', () => {
      expect(shippingFee(699).fee).toBe(0);
      expect(shippingFee(850).fee).toBe(0);
      expect(shippingFee(2500).fee).toBe(0);
    });
  });

  describe('codAvailable(value)', () => {
    it('allows COD for orders up to Rs 2500', () => {
      const res500 = codAvailable(500);
      expect(res500.available).toBe(true);
      expect(res500.ruleCited).toMatch(/COD_POLICY.*<= Rs 2500/i);
      expect(res500.explanation).toBeDefined();

      expect(codAvailable(850).available).toBe(true);
      expect(codAvailable(2500).available).toBe(true);
    });

    it('disallows COD for orders strictly greater than Rs 2500', () => {
      const res2501 = codAvailable(2501);
      expect(res2501.available).toBe(false);
      expect(res2501.ruleCited).toMatch(/COD_POLICY.*> Rs 2500/i);
      expect(res2501.explanation).toBeDefined();

      expect(codAvailable(3000).available).toBe(false);
    });
  });

  describe('canReportDamage(order)', () => {
    it('allows reporting damage only if status is Delivered AND delivered_days_ago <= 2', () => {
      const recentDamaged = {
        order_id: 'ORD-104',
        status: 'Delivered',
        delivered_days_ago: 1,
      };
      const res = canReportDamage(recentDamaged);
      expect(res.allowed).toBe(true);
      expect(res.eligible).toBe(true);
      expect(res.reason).toBeNull();
      expect(res.ruleCited).toMatch(/DAMAGE_WINDOW/i);
      expect(res.explanation).toBeDefined();
    });

    it('allows reporting damage on boundary delivered_days_ago === 2', () => {
      const boundaryOrder = {
        order_id: 'ORD-105',
        status: 'Delivered',
        delivered_days_ago: 2,
      };
      const res = canReportDamage(boundaryOrder);
      expect(res.allowed).toBe(true);
      expect(res.eligible).toBe(true);
      expect(res.ruleCited).toMatch(/DAMAGE_WINDOW/i);
    });

    it('refuses damage reporting for ORD-102 (Delivered 14 days ago) with 48 hours window reason', () => {
      const ord102 = seedOrders.find((o) => o.order_id === 'ORD-102');
      const res = canReportDamage(ord102);
      expect(res.allowed).toBe(false);
      expect(res.eligible).toBe(false);
      expect(res.reason).toBe(
        'DAMAGE_WINDOW: delivered 14 days ago, damaged/defective must be reported within 48 hours of delivery'
      );
      expect(res.ruleCited).toContain('DAMAGE_WINDOW');
      expect(res.explanation).toBeDefined();
    });

    it('refuses damage reporting for ORD-101 (Out for Delivery) with doorstep refusal reason', () => {
      const ord101 = seedOrders.find((o) => o.order_id === 'ORD-101');
      const res = canReportDamage(ord101);
      expect(res.allowed).toBe(false);
      expect(res.eligible).toBe(false);
      expect(res.reason).toBe(
        'not delivered yet; customer can refuse delivery at the doorstep if out for delivery'
      );
      expect(res.ruleCited).toMatch(/DAMAGE_WINDOW/i);
    });

    it('refuses damage reporting for ORD-103 (Processing) with not delivered reason', () => {
      const ord103 = seedOrders.find((o) => o.order_id === 'ORD-103');
      const res = canReportDamage(ord103);
      expect(res.allowed).toBe(false);
      expect(res.eligible).toBe(false);
      expect(res.reason).toBe(
        'not delivered yet; customer can refuse delivery at the doorstep if out for delivery'
      );
      expect(res.ruleCited).toMatch(/DAMAGE_WINDOW/i);
    });
  });

  describe('Audit of the 3 seed orders from the brief', () => {
    it('correctly evaluates all 3 seed orders', () => {
      const [ord101, ord102, ord103] = seedOrders;

      // ORD-101: Out for Delivery, Rs 699
      expect(canCancel(ord101).allowed).toBe(false);
      expect(canCancel(ord101).ruleCited).toBeDefined();
      expect(canReturn(ord101).allowed).toBe(false);
      expect(canReturn(ord101).ruleCited).toBeDefined();
      expect(canReportDamage(ord101).allowed).toBe(false);
      expect(shippingFee(ord101.value_inr).fee).toBe(0);
      expect(shippingFee(ord101.value_inr).ruleCited).toBeDefined();
      expect(codAvailable(ord101.value_inr).available).toBe(true);
      expect(codAvailable(ord101.value_inr).ruleCited).toBeDefined();

      // ORD-102: Delivered 14 days ago, Rs 499
      expect(canCancel(ord102).allowed).toBe(false);
      expect(canReturn(ord102).allowed).toBe(false);
      expect(canReturn(ord102).ruleCited).toMatch(/14 days ago > 7-day limit/i);
      expect(canReportDamage(ord102).allowed).toBe(false);
      expect(shippingFee(ord102.value_inr).fee).toBe(50);
      expect(codAvailable(ord102.value_inr).available).toBe(true);

      // ORD-103: Processing, Rs 850
      expect(canCancel(ord103).allowed).toBe(true);
      expect(canCancel(ord103).ruleCited).toMatch(/Processing/i);
      expect(canReturn(ord103).allowed).toBe(false);
      expect(canReportDamage(ord103).allowed).toBe(false);
      expect(shippingFee(ord103.value_inr).fee).toBe(0);
      expect(codAvailable(ord103.value_inr).available).toBe(true);
    });
  });
});
