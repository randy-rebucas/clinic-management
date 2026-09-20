interface BrandLogoProps {
  size?: number;
  rounded?: string;
  className?: string;
}

// Matches the mark used for app/icon.tsx, app/apple-icon.tsx and app/opengraph-image.tsx
export default function BrandLogo({ size = 32, rounded = 'rounded-lg', className = '' }: BrandLogoProps) {
  return (
    <div
      className={`${rounded} flex items-center justify-center flex-shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        background: 'linear-gradient(135deg, #0EA5A4 0%, #2563EB 100%)',
      }}
    >
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none">
        <path
          d="M12 2 L21 6 V12 C21 17 17 21 12 22 C7 21 3 17 3 12 V6 Z"
          fill="white"
          fillOpacity="0.18"
        />
        <path
          d="M12 2 L21 6 V12 C21 17 17 21 12 22 C7 21 3 17 3 12 V6 Z"
          stroke="white"
          strokeWidth="1.4"
        />
        <path
          d="M12 7.5 V16.5 M7.5 12 H16.5"
          stroke="white"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
