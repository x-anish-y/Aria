import { describe, it, expect } from 'vitest';
import {
  getBrand,
  getAllBrands,
  getBrandPolicies,
  DEFAULT_AURA_POLICIES,
  KAVERI_COFFEE_POLICIES,
} from '@/lib/brands';
import {
  canCancel,
  canReturn,
  canReportDamage,
  shippingFee,
  codAvailable,
} from '@/lib/policy';
import { buildSystemInstruction } from '@/lib/agent-config';
import { getOrderDetails, requestCancellation } from '@/lib/tools';
import { getGuidedScenariosForBrand } from '@/lib/scenarios';
import { seedOrders, getOrderById } from '@/lib/db';

describe('Task 18: Multi-Brand Configuration & Policy Engine', () => {
  describe('Brand Definitions & Helpers (lib/brands.js)', () => {
    it('seeds and returns both Aura Skincare and Kaveri Coffee Roasters', () => {
      const all = getAllBrands();
      expect(all.length).toBeGreaterThanOrEqual(2);
      expect(all.map((b) => b.id)).toEqual(expect.arrayContaining(['aura', 'kaveri']));
    });

    it('returns valid brand metadata for Aura Skincare', () => {
      const aura = getBrand('aura');
      expect(aura.id).toBe('aura');
      expect(aura.name).toBe('Aura Skincare');
      expect(aura.orders_prefix).toBe('ORD-');
      expect(aura.voice).toBe('Aoede');
      expect(aura.persona_name).toBe('Aria');
      expect(aura.theme).toHaveProperty('primary');
      expect(aura.policies.cancelAllowedStatus).toContain('Processing');
    });

    it('returns valid brand metadata for Kaveri Coffee Roasters', () => {
      const kaveri = getBrand('kaveri');
      expect(kaveri.id).toBe('kaveri');
      expect(kaveri.name).toBe('Kaveri Coffee Roasters');
      expect(kaveri.orders_prefix).toBe('KAV-');
      expect(kaveri.voice).toBe('Puck');
      expect(kaveri.persona_name).toBe('Tara');
      expect(kaveri.policies.returnWindowDays).toBe(0);
      expect(kaveri.policies.freeShippingThreshold).toBe(799);
      expect(kaveri.policies.codMaxThreshold).toBe(1500);
    });

    it('falls back safely to Aura for unknown brand ID', () => {
      const fallback = getBrand('unknown_brand');
      expect(fallback.id).toBe('aura');
    });
  });

  describe('Brand Policy Engine for Both Brands (lib/policy.js)', () => {
    describe('Aura Skincare Policies', () => {
      it('allows return within 7 days for unopened skincare', () => {
        const order = { status: 'Delivered', delivered_days_ago: 5, opened: false };
        const res = canReturn(order, DEFAULT_AURA_POLICIES);
        expect(res.allowed).toBe(true);
        expect(res.ruleCited).toMatch(/RETURN_WINDOW.*7-day/i);
      });

      it('refuses return past 7 days for skincare', () => {
        const order = { status: 'Delivered', delivered_days_ago: 14, opened: false };
        const res = canReturn(order, DEFAULT_AURA_POLICIES);
        expect(res.allowed).toBe(false);
        expect(res.reason).toMatch(/7 days/i);
      });

      it('enforces 48-hour damage reporting window', () => {
        const order = { status: 'Delivered', delivered_days_ago: 1 }; // within 48h
        const res = canReportDamage(order, DEFAULT_AURA_POLICIES);
        expect(res.allowed).toBe(true);

        const expiredOrder = { status: 'Delivered', delivered_days_ago: 3 }; // > 48h
        const expiredRes = canReportDamage(expiredOrder, DEFAULT_AURA_POLICIES);
        expect(expiredRes.allowed).toBe(false);
        expect(expiredRes.reason).toMatch(/48 hours/i);
      });

      it('enforces Rs 499 free shipping threshold (fee Rs 50)', () => {
        expect(shippingFee(450, DEFAULT_AURA_POLICIES).fee).toBe(50);
        expect(shippingFee(499, DEFAULT_AURA_POLICIES).fee).toBe(50); // > 499 is free
        expect(shippingFee(500, DEFAULT_AURA_POLICIES).fee).toBe(0);
      });

      it('enforces Rs 2,500 COD maximum limit', () => {
        expect(codAvailable(2400, DEFAULT_AURA_POLICIES).available).toBe(true);
        expect(codAvailable(2500, DEFAULT_AURA_POLICIES).available).toBe(true);
        expect(codAvailable(2501, DEFAULT_AURA_POLICIES).available).toBe(false);
      });
    });

    describe('Kaveri Coffee Roasters Policies', () => {
      it('strictly refuses coffee returns after delivery due to perishable food safety', () => {
        const order = {
          brand_id: 'kaveri',
          status: 'Delivered',
          delivered_days_ago: 1,
          opened: false,
        };
        const res = canReturn(order, KAVERI_COFFEE_POLICIES);
        expect(res.allowed).toBe(false);
        expect(res.eligible).toBe(false);
        expect(res.reason).toMatch(/perishable|food safety|non-returnable/i);
        expect(res.ruleCited).toMatch(/PERISHABLE/i);
      });

      it('enforces 24-hour damage reporting window for Kaveri coffee', () => {
        const freshDamaged = {
          brand_id: 'kaveri',
          status: 'Delivered',
          delivered_days_ago: 0.5,
        };
        const res = canReportDamage(freshDamaged, KAVERI_COFFEE_POLICIES);
        expect(res.allowed).toBe(true);

        const lateDamaged = {
          brand_id: 'kaveri',
          status: 'Delivered',
          delivered_days_ago: 2,
        };
        const lateRes = canReportDamage(lateDamaged, KAVERI_COFFEE_POLICIES);
        expect(lateRes.allowed).toBe(false);
        expect(lateRes.reason).toMatch(/24 hours/i);
      });

      it('enforces Rs 799 free shipping threshold (fee Rs 80)', () => {
        expect(shippingFee(600, KAVERI_COFFEE_POLICIES).fee).toBe(80);
        expect(shippingFee(799, KAVERI_COFFEE_POLICIES).fee).toBe(80);
        expect(shippingFee(800, KAVERI_COFFEE_POLICIES).fee).toBe(0);
      });

      it('enforces Rs 1,500 COD limit for Kaveri orders', () => {
        expect(codAvailable(1200, KAVERI_COFFEE_POLICIES).available).toBe(true);
        expect(codAvailable(1500, KAVERI_COFFEE_POLICIES).available).toBe(true);
        expect(codAvailable(1600, KAVERI_COFFEE_POLICIES).available).toBe(false);
      });

      it('allows cancellation for Processing coffee orders placed within 2 hours', () => {
        const freshCoffeeOrder = {
          brand_id: 'kaveri',
          status: 'Processing',
          placed_hours_ago: 1,
        };
        const res = canCancel(freshCoffeeOrder, KAVERI_COFFEE_POLICIES);
        expect(res.allowed).toBe(true);
      });

      it('refuses cancellation for Kaveri orders that are Out for Delivery', () => {
        const outOrder = {
          brand_id: 'kaveri',
          status: 'Out for Delivery',
        };
        const res = canCancel(outOrder, KAVERI_COFFEE_POLICIES);
        expect(res.allowed).toBe(false);
        expect(res.reason).toMatch(/doorstep/i);
      });
    });

    describe('Automatic Brand Detection on Order Object', () => {
      it('infers Kaveri policy when order.brand_id === "kaveri"', () => {
        const kavDelivered = {
          brand_id: 'kaveri',
          status: 'Delivered',
          delivered_days_ago: 1,
        };
        const res = canReturn(kavDelivered);
        expect(res.allowed).toBe(false);
        expect(res.ruleCited).toMatch(/PERISHABLE/i);
      });
    });
  });

  describe('Dynamic System Instruction Generation (lib/agent-config.js)', () => {
    it('generates system instruction tailored for Aura Skincare', () => {
      const prompt = buildSystemInstruction('aura');
      expect(prompt).toContain('Aura Skincare');
      expect(prompt).toContain('Aria');
      expect(prompt).toContain('ORD-');
      expect(prompt).toContain('7 days');
      expect(prompt).toContain('48 hours');
      expect(prompt).toContain('Orders Prefix');
    });

    it('generates system instruction tailored for Kaveri Coffee Roasters', () => {
      const prompt = buildSystemInstruction('kaveri');
      expect(prompt).toContain('Kaveri Coffee Roasters');
      expect(prompt).toContain('Tara');
      expect(prompt).toContain('KAV-');
      expect(prompt).toContain('perishable');
      expect(prompt).toContain('24 hours');
      expect(prompt).toContain('Rs 799');
      expect(prompt).toContain('Orders Prefix');
    });
  });

  describe('Cross-Brand Lookup Isolation (Requirement 4)', () => {
    const testSession = 'test-multi-brand-session';

    it('finds ORD-101 in Aura mode', async () => {
      const res = await getOrderDetails('ORD-101', testSession, 'aura');
      expect(res.found).toBe(true);
      expect(res.order.order_id).toBe('ORD-101');
      expect(res.order.brand_id).toBe('aura');
    });

    it('finds KAV-201 in Kaveri mode', async () => {
      const res = await getOrderDetails('KAV-201', testSession, 'kaveri');
      expect(res.found).toBe(true);
      expect(res.order.order_id).toBe('KAV-201');
      expect(res.order.brand_id).toBe('kaveri');
    });

    it('refuses cross-brand lookup of KAV-201 in Aura mode with "couldn\'t locate" message', async () => {
      const res = await getOrderDetails('KAV-201', testSession, 'aura');
      expect(res.found).toBe(false);
      expect(res.error).toBe('ORDER_NOT_FOUND');
      expect(res.message).toMatch(/couldn't locate.*Aura Skincare/i);
    });

    it('refuses cross-brand lookup of ORD-101 in Kaveri mode with "couldn\'t locate" message', async () => {
      const res = await getOrderDetails('ORD-101', testSession, 'kaveri');
      expect(res.found).toBe(false);
      expect(res.error).toBe('ORDER_NOT_FOUND');
      expect(res.message).toMatch(/couldn't locate.*Kaveri Coffee Roasters/i);
    });

    it('refuses cross-brand cancellation requests', async () => {
      const res = await requestCancellation({ orderId: 'KAV-203' }, testSession, 'aura');
      expect(res.status).toBe('NOT_FOUND');
      expect(res.found).toBe(false);
      expect(res.message).toMatch(/couldn't locate.*Aura Skincare/i);
    });
  });

  describe('Guided Tour Scenarios per Brand', () => {
    it('returns Aura scenarios for aura brandId', () => {
      const scenarios = getGuidedScenariosForBrand('aura');
      expect(scenarios.length).toBe(8);
      expect(scenarios.some((s) => s.id === 'track_ord_101')).toBe(true);
      expect(scenarios.some((s) => s.id === 'cancel_ord_103')).toBe(true);
    });

    it('returns Kaveri scenarios for kaveri brandId', () => {
      const scenarios = getGuidedScenariosForBrand('kaveri');
      expect(scenarios.length).toBe(8);
      expect(scenarios.some((s) => s.id === 'track_kav_201')).toBe(true);
      expect(scenarios.some((s) => s.id === 'return_kav_202')).toBe(true);
      expect(scenarios.some((s) => s.id === 'cross_brand_refusal_ord_101')).toBe(true);
    });
  });
});
