/**
 * Structured data for search engines. A JSON-LD block is data, not script, so the CSP nonce
 * doesn't apply; `<` is escaped so no string in the payload can close the tag.
 */
export default function JsonLd({ data }: { data: object | object[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
