import type { NextConfig } from "next";

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
  // exceljs (income .xlsx template/import) uses Node streams; keep it out of the bundler.
  serverExternalPackages: ["exceljs"],
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', 'date-fns', '@kitnets/ui', '@clerk/nextjs', 'next-themes'],
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
