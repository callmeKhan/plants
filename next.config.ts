import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_TIME: Date.now().toString(),
  },
  async redirects() {
    return [
      { source: "/", destination: "/plants", permanent: false },
    ];
  },
};

export default nextConfig;
