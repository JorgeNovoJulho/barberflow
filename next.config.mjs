import { fileURLToPath } from "node:url";


/** @type {import("next").NextConfig} */
const config = {
  distDir: process.env.BARBERFLOW_DIST_DIR || '.next',
  deploymentId: process.env.BARBERFLOW_DEPLOYMENT_ID,
  turbopack: { root: fileURLToPath(new URL(".", import.meta.url)) },
  experimental: { serverActions: { bodySizeLimit: "21mb" } },
};

export default config;
