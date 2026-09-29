/**
 * app/api/orders/route.js — Session-aware orders list for the Test Orders panel
 *
 * Method: GET
 * Query: ?sessionId=xyz
 */

import { getOrdersForSession } from "@/lib/db";

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId") || "default-session";
    const brandId = url.searchParams.get("brandId") || url.searchParams.get("brand") || null;

    const { orders, degraded } = await getOrdersForSession(sessionId, brandId);

    return Response.json(
      {
        ok: true,
        orders,
        sessionId,
        brandId,
        degraded,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[api/orders] Error fetching orders:", err);
    return Response.json(
      {
        ok: false,
        error: err?.message || "Failed to fetch orders.",
      },
      { status: 500 }
    );
  }
}
