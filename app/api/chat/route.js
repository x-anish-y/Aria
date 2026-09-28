/**
 * app/api/chat/route.js — Fallback Voice Chat Endpoint (Groq Llama / OpenAI-compatible)
 *
 * Rules:
 * - Server-side tool execution via lib/tools.js
 * - Tool calling with provider-neutral TOOL_DECLARATIONS adapted via toOpenAITools
 * - System instruction from lib/agent-config.js
 * - Best-effort IP rate limiting via rate_limits table
 * - SSE streaming (tokens, tool events, completion)
 * - Safe error handling without crashing or exposing server secrets
 */

import dns from "node:dns";
import { SYSTEM_INSTRUCTION, TOOL_DECLARATIONS, toOpenAITools } from "@/lib/agent-config";
import { getOrderDetails, requestCancellation, createSupportTicket } from "@/lib/tools";
import { checkRateLimit } from "@/lib/db";

// Ensure IPv4 is prioritized for outbound network calls
try {
  dns.setDefaultResultOrder("ipv4first");
} catch {}

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return Response.json(
        {
          error: "GROQ_API_KEY environment variable is not configured on the server.",
          code: "CONFIG_ERROR",
        },
        { status: 500 }
      );
    }

    // IP rate limiting
    const forwarded = request.headers.get("x-forwarded-for");
    const realIp = request.headers.get("x-real-ip");
    const ip = forwarded ? forwarded.split(",")[0].trim() : realIp || "127.0.0.1";

    const rateCheck = await checkRateLimit(`chat:${ip}`, 60, 60);
    if (!rateCheck.allowed) {
      return Response.json(
        {
          error: "Rate limit exceeded. Please wait a moment before sending another message.",
          code: "RATE_LIMITED",
        },
        {
          status: 429,
          headers: { "Retry-After": "60" },
        }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { error: "Invalid JSON request body", code: "INVALID_REQUEST" },
        { status: 400 }
      );
    }

    const { messages = [], sessionId = "default-session" } = body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json(
        { error: "Missing or invalid 'messages' array in request body", code: "INVALID_REQUEST" },
        { status: 400 }
      );
    }

    const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
    const openAiTools = toOpenAITools(TOOL_DECLARATIONS);

    // Build message list with SYSTEM_INSTRUCTION
    const conversation = [];
    const hasSystem = messages.some((m) => m.role === "system");
    if (!hasSystem) {
      conversation.push({ role: "system", content: SYSTEM_INSTRUCTION });
    }
    for (const msg of messages) {
      conversation.push({
        role: msg.role,
        content: msg.content ?? "",
        ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}),
        ...(msg.tool_call_id ? { tool_call_id: msg.tool_call_id } : {}),
      });
    }

    // Prepare SSE Response stream
    const encoder = new TextEncoder();
    const allToolEvents = [];

    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (data) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch (e) {
            // Controller might be closed if client disconnected
          }
        };

        const MAX_TOOL_ROUNDS = 5;
        let round = 0;

        try {
          while (round < MAX_TOOL_ROUNDS) {
            round++;

            if (request.signal.aborted) {
              controller.close();
              return;
            }

            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model,
                messages: conversation,
                tools: openAiTools,
                tool_choice: "auto",
                stream: true,
              }),
              signal: request.signal,
            });

            if (!response.ok) {
              const errBody = await response.json().catch(() => ({}));
              const isQuotaOrRateLimit =
                response.status === 429 ||
                response.status === 503 ||
                errBody?.error?.code === "rate_limit_exceeded" ||
                errBody?.error?.type === "insufficient_quota";

              sendEvent({
                type: "error",
                error:
                  errBody?.error?.message ||
                  `Groq API error (status ${response.status})`,
                code: isQuotaOrRateLimit ? "QUOTA_OR_UNAVAILABLE" : "UPSTREAM_ERROR",
              });
              controller.close();
              return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let sseBuffer = "";
            let accumulatedContent = "";
            const toolCallsAccumulator = [];

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              sseBuffer += decoder.decode(value, { stream: true });
              const lines = sseBuffer.split("\n");
              sseBuffer = lines.pop();

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith("data: ")) continue;
                const payload = trimmed.slice(6);
                if (payload === "[DONE]") continue;

                let parsed;
                try {
                  parsed = JSON.parse(payload);
                } catch {
                  continue;
                }

                const choice = parsed.choices?.[0];
                if (!choice) continue;

                const delta = choice.delta;
                if (!delta) continue;

                // Stream normal content tokens (ignore delta.reasoning / thinking)
                if (delta.content) {
                  accumulatedContent += delta.content;
                  sendEvent({
                    type: "token",
                    token: delta.content,
                  });
                }

                // Accumulate tool calls if present
                if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
                  for (const tc of delta.tool_calls) {
                    const idx = tc.index ?? 0;
                    if (!toolCallsAccumulator[idx]) {
                      toolCallsAccumulator[idx] = {
                        id: tc.id || "",
                        name: tc.function?.name || "",
                        arguments: "",
                      };
                    }
                    if (tc.id) toolCallsAccumulator[idx].id = tc.id;
                    if (tc.function?.name) toolCallsAccumulator[idx].name = tc.function.name;
                    if (tc.function?.arguments) {
                      toolCallsAccumulator[idx].arguments += tc.function.arguments;
                    }
                  }
                }
              }
            }

            // Check if any tool calls were requested in this round
            const validToolCalls = toolCallsAccumulator.filter(
              (tc) => tc && tc.name
            );

            if (validToolCalls.length === 0) {
              // No tool calls — model response is complete
              sendEvent({
                type: "done",
                toolEvents: allToolEvents,
                content: accumulatedContent,
              });
              controller.close();
              return;
            }

            // Append assistant message with tool calls to conversation
            conversation.push({
              role: "assistant",
              content: accumulatedContent || null,
              tool_calls: validToolCalls.map((tc) => ({
                id: tc.id || `call_${Math.random().toString(36).slice(2, 9)}`,
                type: "function",
                function: {
                  name: tc.name,
                  arguments: tc.arguments,
                },
              })),
            });

            // Execute each tool call server-side
            for (const tc of validToolCalls) {
              const startTime = performance.now();
              let parsedArgs = {};
              try {
                parsedArgs = tc.arguments ? JSON.parse(tc.arguments) : {};
              } catch (e) {
                parsedArgs = { raw: tc.arguments };
              }

              let result;
              try {
                switch (tc.name) {
                  case "getOrderDetails": {
                    const orderId = parsedArgs.orderId || parsedArgs.order_id;
                    result = await getOrderDetails(orderId, sessionId);
                    break;
                  }
                  case "requestCancellation": {
                    const orderId = parsedArgs.orderId || parsedArgs.order_id;
                    result = await requestCancellation(orderId, sessionId);
                    break;
                  }
                  case "createSupportTicket": {
                    result = await createSupportTicket(
                      {
                        orderId: parsedArgs.orderId || parsedArgs.order_id || null,
                        category: parsedArgs.category,
                        description: parsedArgs.description,
                      },
                      sessionId
                    );
                    break;
                  }
                  default: {
                    result = {
                      error: `Unknown tool "${tc.name}". Available tools: getOrderDetails, requestCancellation, createSupportTicket.`,
                    };
                    break;
                  }
                }
              } catch (toolErr) {
                result = { error: toolErr?.message || "Tool execution failed" };
              }

              const durationMs = Math.round(performance.now() - startTime);
              const eventRecord = {
                id: tc.id || `tool-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                name: tc.name,
                args: parsedArgs,
                result,
                durationMs,
                timestamp: new Date().toLocaleTimeString(),
              };

              allToolEvents.push(eventRecord);

              // Notify client of executed tool event
              sendEvent({
                type: "tool_event",
                event: eventRecord,
              });

              // Add tool message to conversation
              conversation.push({
                role: "tool",
                tool_call_id: tc.id,
                content: JSON.stringify(result),
              });
            }

            // Loop continues: next turn passes tool results to Groq to generate spoken response
          }

          // Exceeded max tool rounds
          sendEvent({
            type: "done",
            toolEvents: allToolEvents,
          });
          controller.close();
        } catch (streamErr) {
          if (!request.signal.aborted) {
            sendEvent({
              type: "error",
              error: streamErr?.message || "Streaming error occurred",
              code: "STREAM_ERROR",
            });
          }
          try {
            controller.close();
          } catch {}
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    console.error("[api/chat] Unhandled error:", err);
    return Response.json(
      { error: err?.message || "Internal server error in chat API", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
