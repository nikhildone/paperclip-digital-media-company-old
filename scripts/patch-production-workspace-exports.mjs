import { promises as fs } from "node:fs";
import path from "node:path";

const root = process.cwd();

const packagePaths = [
  "packages/shared/package.json",
  "packages/db/package.json",
  "packages/adapter-utils/package.json",
  "packages/mcp-server/package.json",
  "packages/skills-catalog/package.json",
  "packages/teams-catalog/package.json",
  "packages/plugins/sdk/package.json",
  "packages/adapters/acpx-local/package.json",
  "packages/adapters/claude-local/package.json",
  "packages/adapters/codex-local/package.json",
  "packages/adapters/cursor-cloud/package.json",
  "packages/adapters/cursor-local/package.json",
  "packages/adapters/gemini-local/package.json",
  "packages/adapters/grok-local/package.json",
  "packages/adapters/openclaw-gateway/package.json",
  "packages/adapters/opencode-local/package.json",
  "packages/adapters/pi-local/package.json"
];

let changed = 0;

for (const relativePath of packagePaths) {
  const fullPath = path.join(root, relativePath);
  try {
    const raw = await fs.readFile(fullPath, "utf8");
    const pkg = JSON.parse(raw);
    const publishConfig = pkg.publishConfig ?? {};
    if (!publishConfig.exports) {
      console.log(`skip ${relativePath}: publishConfig.exports missing`);
      continue;
    }
    pkg.exports = publishConfig.exports;
    if (publishConfig.main) pkg.main = publishConfig.main;
    if (publishConfig.types) pkg.types = publishConfig.types;
    await fs.writeFile(fullPath, `${JSON.stringify(pkg, null, 2)}\n`);
    changed += 1;
    console.log(`production exports patched: ${relativePath}`);
  } catch (error) {
    console.log(`skip ${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(`production workspace export patch complete: ${changed} package(s) patched`);
