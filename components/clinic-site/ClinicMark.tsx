/** The clinic's logo, or its initials on the brand teal when it hasn't uploaded one. */
export default function ClinicMark({ name, logo, size = 36 }: { name: string; logo?: string; size?: number }) {
  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- clinic logos are data: or Cloudinary URLs
      <img
        src={logo}
        alt=""
        width={size}
        height={size}
        className="rounded-lg object-contain bg-white shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  const initials =
    name
      .split(/\s+/)
      .filter((w) => /^[A-Za-z0-9]/.test(w))
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '+';
  return (
    <span
      aria-hidden="true"
      className="rounded-lg bg-brand-teal text-white font-bold flex items-center justify-center shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials}
    </span>
  );
}
