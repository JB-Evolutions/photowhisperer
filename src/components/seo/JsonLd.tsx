export default function JsonLd({
  data,
  nonce,
}: {
  data: Record<string, unknown>;
  nonce?: string;
}) {
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      // "<" escaped so page content in schema values can't close the script tag
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
