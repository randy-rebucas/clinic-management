import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0F172A 0%, #0E4C63 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            width: 140,
            height: 140,
            borderRadius: 32,
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg, #0EA5A4 0%, #2563EB 100%)",
            marginBottom: 36,
          }}
        >
          <svg width="86" height="86" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2 L21 6 V12 C21 17 17 21 12 22 C7 21 3 17 3 12 V6 Z"
              fill="white"
              fillOpacity="0.18"
            />
            <path
              d="M12 2 L21 6 V12 C21 17 17 21 12 22 C7 21 3 17 3 12 V6 Z"
              stroke="white"
              strokeWidth="1.2"
            />
            <path
              d="M12 7.5 V16.5 M7.5 12 H16.5"
              stroke="white"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 64,
            fontWeight: 700,
            color: "white",
            letterSpacing: -1,
          }}
        >
          My Clinic Software
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 28,
            color: "#93C5D8",
            marginTop: 14,
          }}
        >
          Patients · Appointments · Queues · Billing
        </div>
      </div>
    ),
    { ...size }
  );
}
