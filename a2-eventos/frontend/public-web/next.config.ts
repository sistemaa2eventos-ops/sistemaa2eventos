import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'api.qrserver.com',
      },
      {
        protocol: 'https',
        hostname: 'zznrgwytywgjsjqdjfxn.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'api.nzt.app.br',
      },
    ],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://api.nzt.app.br',
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://zznrgwytywgjsjqdjfxn.supabase.co',
  },
};

export default nextConfig;
