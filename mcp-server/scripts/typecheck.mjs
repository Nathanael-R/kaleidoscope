import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const candidatePaths = [
  path.join(workspaceRoot, "node_modules", "typescript", "bin", "tsc"),
  path.join(workspaceRoot, "..", "node_modules", "typescript", "bin", "tsc"),
];

const tscPath = candidatePaths.find((candidate) => existsSync(candidate));

if (!tscPath) {
  console.error("Unable to locate TypeScript. Run npm install in the workspace root or mcp-server package.");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--max-old-space-size=8192", tscPath, "--noEmit"], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);