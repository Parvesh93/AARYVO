import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "AARYVO — AI Sales Employee for Your Website";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f4f1e8",
          color: "#151515",
          padding: "64px 72px",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 999,
                background: "#151515",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 30,
                fontWeight: 700,
              }}
            >
              A
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: "0.18em" }}>AARYVO</div>
              <div style={{ marginTop: 4, fontSize: 15, color: "#6b6b6b", letterSpacing: "0.12em" }}>
                AI SALES OS
              </div>
            </div>
          </div>

          <div
            style={{
              padding: "12px 18px",
              borderRadius: 999,
              background: "#ffdf67",
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: "0.08em",
            }}
          >
            24/7 AI SALES EMPLOYEE
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", maxWidth: 980 }}>
          <div style={{ fontSize: 76, lineHeight: 0.98, fontWeight: 800, letterSpacing: "-0.055em" }}>
            Turn website traffic into real conversations.
          </div>
          <div style={{ marginTop: 28, fontSize: 29, lineHeight: 1.35, color: "#555555", maxWidth: 900 }}>
            Qualify leads, answer enquiries and move visitors toward action — automatically.
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ fontSize: 19, color: "#6b6b6b" }}>aaryvo.ppdesigntech.com</div>
          <div
            style={{
              width: 300,
              height: 16,
              borderRadius: 999,
              background: "#ffdf67",
            }}
          />
        </div>
      </div>
    ),
    size,
  );
}
