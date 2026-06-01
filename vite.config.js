import { defineConfig, loadEnv } from "vite";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Parse a .env file directly from disk, bypassing process.env priority.
function parseEnvFile(filePath) {
  try {
    return Object.fromEntries(
      readFileSync(filePath, "utf-8")
        .split("\n")
        .filter((line) => line.includes("=") && !line.trimStart().startsWith("#"))
        .map((line) => {
          const idx = line.indexOf("=");
          return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
        }),
    );
  } catch {
    return {};
  }
}

function normalizeBasePath(basePath) {
  if (!basePath || basePath === "/") {
    return "/";
  }

  const withLeadingSlash = basePath.startsWith("/") ? basePath : `/${basePath}`;
  return withLeadingSlash.endsWith("/")
    ? withLeadingSlash
    : `${withLeadingSlash}/`;
}

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiUrl = env.VITE_APPS_SCRIPT_URL || "";
  const base = normalizeBasePath(
    command === "serve"
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

  // Build VITE_* defines by merging .env files directly from disk so that
  // shell-level env vars (which Vite/loadEnv gives highest priority) cannot
  // shadow the mode-specific file.
  const baseEnv = parseEnvFile(".env");
  const modeEnv = mode !== "development" ? parseEnvFile(`.env.${mode}`) : {};
  const fileEnv = { ...baseEnv, ...modeEnv }; // mode file wins

  const define = Object.fromEntries(
    Object.entries(fileEnv)
      .filter(([key]) => key.startsWith("VITE_"))
      .map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)]),
  );

  return {
    base,
    server,
    define,
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
