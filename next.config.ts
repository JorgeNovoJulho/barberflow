import type { NextConfig } from "next";
import path from "node:path";

const config: NextConfig = {
  distDir: process.env.BARBERFLOW_DIST_DIR || '.next',
  deploymentId: process.env.BARBERFLOW_DEPLOYMENT_ID,
  turbopack: { root: path.resolve(__dirname) },
  experimental: { serverActions: { bodySizeLimit: "21mb" } },
};

export default config;
