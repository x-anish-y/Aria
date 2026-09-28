/**
 * app/api/reset/route.js — Reset session overrides for an evaluator/visitor
 *
 * Method: POST
 * Body: { sessionId: string }
 */

import { deleteSessionOverrides } from "@/lib/db";

export async function POST(request) {
  try {
    let sessionId = "default-session";

    try {
      const body = await request.json();
      if (body?.sessionId) sessionId = body.sessionId;
      else if (body?.session_id) sessionId = body.session_id;
    } catch {
      // If no JSON body, attempt reading query parameter
      const url = new URL(request.url);
      const q = url.searchParams.get("sessionId");
      if (q) sessionId = q;
    }

    await deleteSessionOverrides(sessionId);

    return Response.json(
      {
        ok: true,
        message: `Session overrides cleared successfully for ${sessionId}.`,
        sessionId,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[api/reset] Error clearing session overrides:", err);
    return Response.json(
      {
        ok: false,
        error: err?.message || "Failed to reset session overrides.",
      },
      { status: 500 }
    );
  }
}
