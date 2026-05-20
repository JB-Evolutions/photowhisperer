import Nav from "@/components/shared/Nav";

export default function Home() {
  return (
    <>
      <Nav />
      <main
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "48px 32px",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 14,
            color: "var(--text-dim)",
          }}
        >
          Phase 1 scaffold — content coming in later phases.
        </p>
      </main>
    </>
  );
}
