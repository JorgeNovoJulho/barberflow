import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";


const projectRoot = fileURLToPath(new URL(".", import.meta.url));
let revision = process.env.BARBERFLOW_REVISION || process.env.GITHUB_SHA || "";
if (!revision) {
  try {
    revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    revision = readFileSync(new URL("./release-revision.txt", import.meta.url), "utf8").trim();
  }
}
if (!/^[a-f0-9]{40}$/.test(revision)) revision = "";

/** @type {import("next").NextConfig} */
const config = {
  distDir: process.env.BARBERFLOW_DIST_DIR || '.next',
  deploymentId: process.env.BARBERFLOW_DEPLOYMENT_ID,
  env: { NEXT_PUBLIC_BARBERFLOW_REVISION: revision },
  turbopack: { root: projectRoot },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
      ],
    }];
  },
  experimental: { serverActions: { bodySizeLimit: "21mb" } },
};

export default config;
