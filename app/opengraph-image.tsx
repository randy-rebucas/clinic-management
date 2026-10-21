import { ImageResponse } from "next/og";
import { BRAND_GRADIENT, BRAND_HEART_PATH, BRAND_PULSE_COLOR, BRAND_PULSE_PATH } from "@/lib/brand-mark";

export const alt = "MyClinicSoft — clinic management software for Philippine clinics";
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
          background: "linear-gradient(135deg, #0B2136 0%, #0A4F57 100%)",
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
            background: BRAND_GRADIENT,
            marginBottom: 36,
          }}
        >
          <svg width="92" height="92" viewBox="0 0 24 24" fill="none">
            <path d={BRAND_HEART_PATH} fill="white" />
            <path
              d={BRAND_PULSE_PATH}
              stroke={BRAND_PULSE_COLOR}
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
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
          MyClinicSoft
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 28,
            color: "#93C5D8",
            marginTop: 14,
          }}
        >
          Clinic management software for Philippine clinics
        </div>
      </div>
    ),
    { ...size }
  );
}
