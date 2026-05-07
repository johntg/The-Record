import { execSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const packageJsonPath = path.join(rootDir, "package.json");
const outputPath = path.join(rootDir, "public", "build-version.json");

function getGitCommit() {
  try {
    return execSync("git rev-parse --short HEAD", {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

function getBuildNumber() {
  const ciBuild =
    process.env.GITHUB_RUN_NUMBER ||
    process.env.BUILD_NUMBER ||
    process.env.CI_PIPELINE_IID ||
    "";

  if (ciBuild) {
    return String(ciBuild).trim();
  }

  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");

  return [
    now.getUTCFullYear(),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate()),
    pad(now.getUTCHours()),
    pad(now.getUTCMinutes()),
    pad(now.getUTCSeconds()),
  ].join("");
}

async function main() {
  const packageJsonRaw = await readFile(packageJsonPath, "utf8");
  const packageJson = JSON.parse(packageJsonRaw);

  const buildNumber = getBuildNumber();
  const gitCommit = getGitCommit();
  const generatedAt = new Date().toISOString();
  const baseVersion = String(packageJson.version || "0.0.0");

  const metadata = {
    name: packageJson.name || "the-record",
    version: baseVersion,
    buildNumber,
    gitCommit,
    generatedAt,
    displayVersion: `${baseVersion}+build.${buildNumber}`,
  };

  await writeFile(outputPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

  console.log(`Wrote build metadata: ${metadata.displayVersion} (${metadata.gitCommit})`);
}

main().catch((error) => {
  console.error("Failed to write build metadata:", error);
  process.exitCode = 1;
});
