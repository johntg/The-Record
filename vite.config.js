import { defineConfig, loadEnv } from "vite";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function normalizeBasePath(basePath) {
  if (!basePath || basePath === "/") {
    return "/";
  }

  const withLeadingSlash = basePath.startsWith("/") ? basePath : `/${basePath}`;
  return withLeadingSlash.endsWith("/")
    ? withLeadingSlash
    : `${withLeadingSlash}/`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiUrl = env.VITE_APPS_SCRIPT_URL || "";
  const base = normalizeBasePath(
    mode === "development"
      ? env.VITE_DEV_BASE_PATH || "/"
      : env.VITE_BASE_PATH || "/",
  );

  let server;
  try {
    if (apiUrl) {
      const parsedUrl = new URL(apiUrl);
      server = {
        proxy: {
          "/api/apps-script": {
            target: parsedUrl.origin,
            changeOrigin: true,
            secure: true,
            followRedirects: true,
            rewrite: () => `${parsedUrl.pathname}`,
          },
        },
      };
    }
  } catch {
    server = undefined;
  }

  return {
    base,
    server,
    plugins: [
      {
        name: "patch-manifest-base-path",
        closeBundle() {
          const outDir = "dist";
          const manifestPath = join(outDir, "manifest.json");
          try {
            const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
            manifest.start_url = base;
            manifest.scope = base;
            writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
          } catch {
            // manifest.json not in output (e.g. dev server), skip
          }
        },
      },
    ],
  };
});
