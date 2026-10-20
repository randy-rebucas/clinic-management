import { BRAND_GRADIENT, BRAND_HEART_PATH, BRAND_PULSE_COLOR, BRAND_PULSE_PATH } from '@/lib/brand-mark';

interface BrandLogoProps {
  size?: number;
  rounded?: string;
  className?: string;
}

// Matches the mark used for app/icon.tsx, app/apple-icon.tsx, app/opengraph-image.tsx and the eMCR app icon
export default function BrandLogo({ size = 32, rounded = 'rounded-lg', className = '' }: BrandLogoProps) {
  return (
    <div
      className={`${rounded} flex items-center justify-center flex-shrink-0 ${className}`}
      style={{ width: size, height: size, background: BRAND_GRADIENT }}
    >
      <svg width={size * 0.66} height={size * 0.66} viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
  );
}
