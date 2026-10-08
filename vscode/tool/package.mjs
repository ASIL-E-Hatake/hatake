#!/usr/bin/env node
// .vsix に固める（組む → 固める → 中身を確かめる）。
//
//   node tool/package.mjs      … hatake-vscode-<版>.vsix を作る
//
// 依存は1本に固めて dist に入れてあるので、node_modules は持ち込まない（--no-dependencies）。
// LICENSE はリポジトリの根の1枚を写す（2枚持たない）。

import { execFileSync } from "node:child_process";
import { copyFileSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createVSIX } from "@vscode/vsce";

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(join(HERE, "package.json"), "utf8"));
const out = join(HERE, `hatake-vscode-${version}.vsix`);

execFileSync(process.execPath, [join(HERE, "tool", "build.mjs")], { stdio: "inherit" });
execFileSync(process.execPath, [join(HERE, "tool", "snippets.mjs"), "--check"], { stdio: "inherit" });

copyFileSync(resolve(HERE, "..", "LICENSE"), join(HERE, "LICENSE"));
try {
  rmSync(out, { force: true });
  await createVSIX({ cwd: HERE, packagePath: out, dependencies: false });
} finally {
  rmSync(join(HERE, "LICENSE"), { force: true });
}

execFileSync(process.execPath, [join(HERE, "tool", "check-vsix.mjs"), out, version], { stdio: "inherit" });
