// lib/currency.ts

/**
 * Formats a number as PHP Peso currency (₱).
 * Always uses PHP, no decimals for whole numbers.
 * Example: formatPeso(1234.5) => '₱1,234.50'
 */
export function formatPeso(amount: number): string {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
