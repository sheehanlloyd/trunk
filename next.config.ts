import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // The widget iframe must be embeddable on any client's website. Allow
        // all frame ancestors for this route only (no X-Frame-Options is sent,
        // so it isn't overridden). The rest of the app stays un-framable.
        source: "/widget/frame",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
    ];
  },
};

export default nextConfig;
