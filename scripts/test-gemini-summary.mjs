import fs from "node:fs";

const env = fs.readFileSync(".env.local", "utf8");
const keyMatch = env.match(/GEMINI_API_KEY=(.+)/);
const modelMatch = env.match(/GEMINI_SUMMARY_MODEL=(.+)/);
const key = keyMatch ? keyMatch[1].trim() : "";
const model = "gemini-3.8-flash";

const responseSchema = {
  type: "OBJECT",
  properties: {
    customer_intent: {
      type: "STRING",
      enum: [
        "ORDER_TRACKING",
        "CANCELLATION",
        "RETURN_REFUND",
        "SHIPPING_INFO",
        "COD_INFO",
        "PRODUCT_INFO",
        "COMPLAINT",
        "OUT_OF_SCOPE",
        "OTHER",
      ],
    },
    order_id: { type: "STRING", nullable: true },
    resolution_status: {
      type: "STRING",
      enum: [
        "RESOLVED",
        "UNRESOLVED",
        "ESCALATION_NEEDED",
        "POLICY_DECLINED",
        "ABANDONED",
      ],
    },
    call_summary: { type: "STRING" },
    policy_notes: { type: "STRING", nullable: true },
    customer_sentiment: {
      type: "STRING",
      enum: ["POSITIVE", "NEUTRAL", "NEGATIVE"],
    },
    actions_taken: {
      type: "ARRAY",
      items: { type: "STRING" },
    },
  },
  required: [
    "customer_intent",
    "resolution_status",
    "call_summary",
    "customer_sentiment",
    "actions_taken",
  ],
};

const prompt = `Analyze this customer support call for Aura Skincare:
Transcript:
User: Where is my order ORD-101?
Aria: One moment, let me check that. Your order ORD-101 is out for delivery with BlueDart and will arrive by 6 PM today.

Tool Events:
- getOrderDetails(orderId: "ORD-101"): Found Out for Delivery with BlueDart.`;

const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema,
    },
  }),
});

const data = await res.json();
console.log("Status:", res.status);
if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
  console.log("Structured Output:\n", data.candidates[0].content.parts[0].text);
} else {
  console.log("Response:", JSON.stringify(data, null, 2));
}
