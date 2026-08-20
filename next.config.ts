import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: ["*.trycloudflare.com"],
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
