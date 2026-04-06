import { defineConfig, loadEnv } from "vite";

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
  const base = normalizeBasePath(env.VITE_BASE_PATH || "/");

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
  };
});
