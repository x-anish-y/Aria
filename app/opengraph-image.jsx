import { ImageResponse } from "next/og";

export const alt = "Aria — AI Voice Support | Aura Skincare";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#05110b",
          fontFamily: "system-ui, -apple-system, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Ambient background glow */}
        <div
          style={{
            position: "absolute",
            top: "15%",
            left: "50%",
            transform: "translateX(-50%)",
            width: "600px",
            height: "400px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(242, 202, 80, 0.22) 0%, rgba(16, 185, 129, 0.15) 50%, transparent 70%)",
            filter: "blur(60px)",
          }}
        />

        {/* Central Card */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            maxWidth: "920px",
            padding: "40px 60px",
            borderRadius: "32px",
            border: "1px solid rgba(242, 202, 80, 0.25)",
            backgroundColor: "rgba(10, 26, 18, 0.75)",
          }}
        >
          {/* Badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 18px",
              borderRadius: "999px",
              border: "1px solid rgba(78, 222, 163, 0.4)",
              backgroundColor: "rgba(16, 185, 129, 0.15)",
              color: "#4edea3",
              fontSize: "15px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "1.5px",
              marginBottom: "24px",
            }}
          >
            Aura Skincare • Voice Intelligence
          </div>

          {/* Title */}
          <div
            style={{
              fontSize: "56px",
              fontWeight: 700,
              color: "#ffffff",
              letterSpacing: "-1px",
              lineHeight: 1.15,
              marginBottom: "16px",
            }}
          >
            Meet Aria: Real-Time AI Voice Support
          </div>

          {/* Subtitle */}
          <div
            style={{
              fontSize: "22px",
              color: "#94a3b8",
              lineHeight: 1.4,
              maxWidth: "760px",
              marginBottom: "32px",
            }}
          >
            Instant order tracking, policy-grounded returns, and personalized botanical routine consultations with sub-second latency.
          </div>

          {/* Feature Pills */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
            }}
          >
            <div
              style={{
                padding: "8px 16px",
                borderRadius: "12px",
                backgroundColor: "rgba(242, 202, 80, 0.12)",
                border: "1px solid rgba(242, 202, 80, 0.3)",
                color: "#f2ca50",
                fontSize: "14px",
                fontWeight: 600,
              }}
            >
              Gemini Live Native Voice
            </div>
            <div
              style={{
                padding: "8px 16px",
                borderRadius: "12px",
                backgroundColor: "rgba(16, 185, 129, 0.12)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                color: "#4edea3",
                fontSize: "14px",
                fontWeight: 600,
              }}
            >
              Deterministic Policy Engine
            </div>
            <div
              style={{
                padding: "8px 16px",
                borderRadius: "12px",
                backgroundColor: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                color: "#e2e8f0",
                fontSize: "14px",
                fontWeight: 600,
              }}
            >
              Real-Time Barge-In
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
