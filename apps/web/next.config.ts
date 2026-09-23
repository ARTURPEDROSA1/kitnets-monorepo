import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
// Validates environment variables at build time (strict on Vercel production).
// A missing or malformed variable fails the deploy here, not a user request later.
import "./src/lib/env";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  reactCompiler: true,
  compress: true,
  poweredByHeader: false,
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "img.clerk.com",
      },
      {
        protocol: "https",
        hostname: "kqhfzcxqmjkqekozhlng.supabase.co",
      },
    ],
  },
  // The blog (conteúdos, author and tag pages) was removed in 2026-09: articles aged too fast to keep current.
  // Old URLs, with or without the language prefix, go to the language home instead of a 404.
  async redirects() {
    const sections = "conteudos|contents|autor|tag";
    return [
      // "Novos Investimentos" became "Projetos" in 2026-09; the old address keeps working (query string included).
      { source: "/:lang(pt|en|es)/novos-investimentos", destination: "/:lang/projetos", permanent: true },
      { source: "/novos-investimentos", destination: "/projetos", permanent: true },
      { source: `/:lang(pt|en|es)/:section(${sections})/:path*`, destination: "/:lang", permanent: true },
      { source: `/:lang(pt|en|es)/:section(${sections})`, destination: "/:lang", permanent: true },
      { source: `/:section(${sections})/:path*`, destination: "/", permanent: true },
      { source: `/:section(${sections})`, destination: "/", permanent: true },
    ];
  },
  // exceljs (income .xlsx template/import) uses Node streams; keep it out of the bundler.
  serverExternalPackages: ["exceljs"],
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', 'date-fns', '@kitnets/ui', '@clerk/nextjs', 'next-themes'],
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

// Sentry build plugin: uploads source maps when SENTRY_AUTH_TOKEN / SENTRY_ORG /
// SENTRY_PROJECT are set (Vercel); otherwise it only wires the runtime configs.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  // Serve the SDK's requests from our own origin so ad blockers don't drop them.
  // The path is excluded from the locale redirect in src/middleware.ts.
  tunnelRoute: "/monitoring",
  widenClientFileUpload: true,
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
  telemetry: false,
});
