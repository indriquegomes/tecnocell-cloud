import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "api.sigecloud.com.br" },
      { protocol: "https", hostname: "cdn.sigeatende.com.br" },
    ],
  },
};

export default nextConfig;
