import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,
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
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', 'date-fns', '@kitnets/ui'],
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
