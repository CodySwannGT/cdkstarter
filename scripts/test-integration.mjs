#!/usr/bin/env node
// Host-owned composition: preserve Lisa's executor and report real absence.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const requireFromHost = createRequire(join(process.cwd(), "package.json"));
const vitest = join(
  dirname(requireFromHost.resolve("vitest/package.json")),
  "vitest.mjs"
);
const collection = spawnSync(
  process.execPath,
  [vitest, "list", ".integration.", "integration/", "--filesOnly", "--json"],
  { encoding: "utf8", timeout: 60_000, maxBuffer: 8 * 1024 * 1024 }
);
if (collection.error || collection.status !== 0) {
  process.stderr.write(collection.stderr || String(collection.error));
  process.exit(collection.status || 1);
}
let files;
try {
  files = JSON.parse(collection.stdout);
  if (
    !Array.isArray(files) ||
    !files.every(
      file => file && typeof file === "object" && typeof file.file === "string"
    )
  ) {
    throw new Error("Integration collection must contain Vitest file records");
  }
} catch (error) {
  console.error("Integration collection could not be established:", error);
  process.exit(1);
}
if (files.length === 0) {
  console.error("FAIL: integration collection is empty (0 files)");
  process.exit(1);
}
console.log(
  `Integration collection: ${files.length} file(s); executing Lisa's managed gate`
);
const child = spawnSync(
  process.env.npm_execpath ? process.execPath : "npm",
  process.env.npm_execpath
    ? [process.env.npm_execpath, "run", "test:integration:lisa"]
    : ["run", "test:integration:lisa"],
  { stdio: "inherit" }
);
if (child.error) console.error(child.error);
process.exit(typeof child.status === "number" ? child.status : 1);
