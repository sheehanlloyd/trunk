"use client";

/**
 * Last-resort error boundary (audit fix, item 4): catches an error in the root
 * layout itself, which `app/error.tsx` cannot (it renders *inside* the root
 * layout, so it never sees a crash in the layout that wraps it). This is the
 * only place Next.js requires the boundary to render its own <html>/<body> —
 * it replaces the entire root layout when active, so it intentionally stays
 * minimal and self-contained rather than depending on the app's design-system
 * components or Tailwind build output, in case those are exactly what broke.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          padding: "1rem",
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#0f172a" }}>
            Something went wrong
          </h1>
          <p style={{ marginTop: 8, fontSize: "0.875rem", color: "#64748b" }}>
            That&apos;s on us, not you. Please reload the page.
          </p>
          {error.digest ? (
            <p style={{ marginTop: 8, fontSize: "0.75rem", color: "#64748b" }}>
              Reference: <span style={{ fontFamily: "monospace" }}>{error.digest}</span>
            </p>
          ) : null}
          <button
            onClick={() => unstable_retry()}
            style={{
              marginTop: 16,
              height: 40,
              padding: "0 16px",
              borderRadius: 8,
              border: "none",
              background: "#2f6f5e",
              color: "white",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
