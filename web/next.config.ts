import type { NextConfig } from "next";

// The browser talks to the API through the same origin (/api/*), so no CORS is needed.
// Server components call the API directly via API_URL_INTERNAL.
const api = process.env.API_URL_INTERNAL ?? "http://localhost:8000";

const config: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${api}/api/:path*` }];
  },
};

export default config;
