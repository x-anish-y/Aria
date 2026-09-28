import { describe, it, expect } from 'vitest';
import { POST as toolsHandler } from '@/app/api/tools/[name]/route';
import { POST as resetHandler } from '@/app/api/reset/route';
import { GET as ordersHandler } from '@/app/api/orders/route';
import { GET as healthHandler } from '@/app/api/health/route';

describe('API Route Handlers', () => {
  describe('POST /api/tools/[name]', () => {
    it('executes getOrderDetails tool with sessionId', async () => {
      const req = new Request('http://localhost:3000/api/tools/getOrderDetails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'route-test-session',
          orderId: '101',
        }),
      });

      const params = Promise.resolve({ name: 'getOrderDetails' });
      const res = await toolsHandler(req, { params });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.result.found).toBe(true);
      expect(data.result.order.order_id).toBe('ORD-101');
    });

    it('rejects unknown tool name gracefully without throwing', async () => {
      const req = new Request('http://localhost:3000/api/tools/unknownTool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 'route-test-session' }),
      });

      const params = Promise.resolve({ name: 'unknownTool' });
      const res = await toolsHandler(req, { params });
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.error).toMatch(/unknown tool/i);
    });

    it('handles malformed body gracefully without throwing', async () => {
      const req = new Request('http://localhost:3000/api/tools/getOrderDetails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid-json{{{',
      });

      const params = Promise.resolve({ name: 'getOrderDetails' });
      const res = await toolsHandler(req, { params });
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.error).toBeDefined();
    });
  });

  describe('POST /api/reset and GET /api/orders', () => {
    it('applies session overrides to GET /api/orders and resets on POST /api/reset', async () => {
      const sessionId = 'route-isolation-session';

      // 1. Cancel ORD-103 via tool route
      const cancelReq = new Request('http://localhost:3000/api/tools/requestCancellation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, orderId: 'ORD-103' }),
      });
      const cancelParams = Promise.resolve({ name: 'requestCancellation' });
      await toolsHandler(cancelReq, { params: cancelParams });

      // 2. Fetch orders for this session
      const getReq = new Request(`http://localhost:3000/api/orders?sessionId=${sessionId}`);
      const ordersRes = await ordersHandler(getReq);
      const ordersData = await ordersRes.json();
      expect(ordersData.ok).toBe(true);

      const ord103 = ordersData.orders.find((o) => o.order_id === 'ORD-103');
      expect(ord103.status).toBe('Cancellation Requested');

      // 3. Reset session
      const resetReq = new Request('http://localhost:3000/api/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      const resetRes = await resetHandler(resetReq);
      const resetData = await resetRes.json();
      expect(resetData.ok).toBe(true);

      // 4. Verify orders reset back to base status
      const getReqAfter = new Request(`http://localhost:3000/api/orders?sessionId=${sessionId}`);
      const ordersResAfter = await ordersHandler(getReqAfter);
      const ordersDataAfter = await ordersResAfter.json();
      const ord103After = ordersDataAfter.orders.find((o) => o.order_id === 'ORD-103');
      expect(ord103After.status).toBe('Processing');
    });
  });

  describe('GET /api/health', () => {
    it('returns health status with degraded flag', async () => {
      const req = new Request('http://localhost:3000/api/health');
      const res = await healthHandler(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.status).toBe('ok');
      expect(typeof data.degraded).toBe('boolean');
      expect(typeof data.db).toBe('boolean');
      expect(typeof data.live).toBe('boolean');
      expect(typeof data.classic).toBe('boolean');
    });
  });
});
