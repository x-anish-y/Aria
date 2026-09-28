/**
 * app/api/tools/[name]/route.js — Next.js 16 Route Handler for Aria Tools
 *
 * Supported tools:
 * - getOrderDetails
 * - requestCancellation
 * - createSupportTicket
 *
 * Rules:
 * - Validates tool name and request body
 * - Reads sessionId from body (or fallback)
 * - NEVER throws (catches all errors and returns JSON { ok: false, error })
 */

import { getOrderDetails, requestCancellation, createSupportTicket } from "@/lib/tools";

export async function POST(request, { params }) {
  try {
    // In Next.js 15/16, params is a Promise that must be awaited
    const resolvedParams = await params;
    const toolName = resolvedParams?.name;

    // Parse JSON body safely
    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { ok: false, error: "Invalid JSON request body" },
        { status: 400 }
      );
    }

    if (!body || typeof body !== "object") {
      return Response.json(
        { ok: false, error: "Request body must be a JSON object" },
        { status: 400 }
      );
    }

    const sessionId = body.sessionId || body.session_id || "default-session";
    const args = body.args || body.arguments || body;

    switch (toolName) {
      case "getOrderDetails": {
        const orderId = args.orderId || args.order_id || body.orderId || body.order_id;
        const result = await getOrderDetails(orderId, sessionId);
        return Response.json({ ok: true, result }, { status: 200 });
      }

      case "requestCancellation": {
        const orderId = args.orderId || args.order_id || body.orderId || body.order_id;
        const result = await requestCancellation(orderId, sessionId);
        return Response.json({ ok: true, result }, { status: 200 });
      }

      case "createSupportTicket": {
        const orderId = args.orderId || args.order_id || body.orderId || body.order_id || null;
        const category = args.category || body.category || "OTHER";
        const description = args.description || body.description || "Support request";
        const result = await createSupportTicket({ orderId, category, description }, sessionId);
        return Response.json({ ok: true, result }, { status: 200 });
      }

      default: {
        return Response.json(
          {
            ok: false,
            error: `Unknown tool "${toolName}". Available tools: getOrderDetails, requestCancellation, createSupportTicket.`,
          },
          { status: 404 }
        );
      }
    }
  } catch (err) {
    console.error("[api/tools/[name]] Uncaught error:", err);
    return Response.json(
      { ok: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
