import { ImageResponse } from "next/og";
import { BRAND_GRADIENT, BRAND_HEART_PATH, BRAND_PULSE_COLOR, BRAND_PULSE_PATH } from "@/lib/brand-mark";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
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
          borderRadius: 7,
        }}
      >
        {/* Heart is drawn larger than on the app icon so it stays legible at tab size */}
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <path d={BRAND_HEART_PATH} fill="white" />
          <path
            d={BRAND_PULSE_PATH}
            stroke={BRAND_PULSE_COLOR}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}
