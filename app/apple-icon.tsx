import { ImageResponse } from "next/og";
import { BRAND_GRADIENT, BRAND_HEART_PATH, BRAND_PULSE_COLOR, BRAND_PULSE_PATH } from "@/lib/brand-mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: BRAND_GRADIENT,
        }}
      >
        <svg width="112" height="112" viewBox="0 0 24 24" fill="none">
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
    ),
    { ...size }
  );
}
