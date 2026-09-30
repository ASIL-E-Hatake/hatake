import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { runCli } from "../src/cli.js";
import type { CliIo } from "../src/cliIo.js";
import { doctor, type DoctorIo } from "../src/doctor.js";

/**
 * `hatake doctor`（0.9.23）。見本で実際に起きた「上げたつもりがコンテナの中は古い版」を、
 * 画面を開く前に見つけられること。案件は作り物（ファイルの地図）で渡す。
 */
const tree = (files: Record<string, string>): DoctorIo => {
  const dirs = new Map<string, Set<string>>();
  for (const path of Object.keys(files)) {
    const parts = path.split("/");
    for (let i = 0; i < parts.length; i++) {
      const dir = ["root", ...parts.slice(0, i)].join("/");
      const set = dirs.get(dir) ?? new Set<string>();
      set.add(parts[i] + (i < parts.length - 1 ? "/" : ""));
      dirs.set(dir, set);
    }
  }
  return {
    readFile: (path) => {
      const key = path.replace(/^root\//, "");
      if (!(key in files)) throw new Error(`no such file: ${path}`);
      return files[key];
    },
    listDir: (path) => {
      const found = dirs.get(path);
      if (found === undefined) return null;
      return [...found].map((one) => ({ name: one.replace(/\/$/, ""), dir: one.endsWith("/") }));
    },
  };
};

const DEFINITION = `dsl_version: "1.0"
page:
  type: search
  id: orders
  title: 受注
  repository: orderRepository
  table:
    columns: [{ field: orderNo, label: 受注番号, sortable: true }]
`;

const healthy = {
  "hatake.version": "v0.9.23\n",
  "node-src/package.json": JSON.stringify({
    dependencies: { "@hatake-fw/api": "https://github.com/x/releases/download/v0.9.23/hatake-fw-api-0.9.23.tgz" },
  }),
  "node-src/node_modules/@hatake-fw/api/package.json": JSON.stringify({ version: "0.9.23" }),
  "flutter-src/pubspec.yaml": `name: app
dependencies:
  hatake_material:
    git: { url: https://github.com/x/hatake.git, ref: v0.9.23, path: flutter/packages/hatake_material }
`,
  "flutter-src/pubspec.lock": `packages:
  hatake_material:
    dependency: direct main
    version: "0.9.23"
`,
  "java-src/build.gradle": `dependencies { implementation 'com.github.ASIL-E-Hatake:hatake:v0.9.23' }`,
  "definitions/app.yaml": DEFINITION,
  ".mcp.json": JSON.stringify({ mcpServers: { hatake: { command: "npx", args: ["hatake-mcp"] } } }),
};

const levels = (files: Record<string, string>, tool = "0.9.23") =>
  doctor(tree(files), "root", { version: tool }).findings.map((one) => `${one.level}: ${one.message}`);

describe("hatake doctor", () => {
  it("そろっている案件は ok だけ", () => {
    const report = doctor(tree(healthy), "root", { version: "0.9.23" });
    expect(report.findings.every((one) => one.level === "ok")).toBe(true);
    expect(report.versions.filter((one) => one.kind === "pinned").map((one) => one.what).sort()).toEqual([
      "@hatake-fw/api",
      "hatake.version",
      "hatake_material",
      "hatake（JitPack）",
    ]);
    expect(report.definitions).toEqual([
      { file: "definitions/app.yaml", readable: true, dslVersion: "1.0", warnings: 0 },
    ]);
    expect(report.mcp).toBe(true);
  });

  it("入っている版が固定した版より古い（焼き直していない）", () => {
    const stale = { ...healthy, "node-src/node_modules/@hatake-fw/api/package.json": JSON.stringify({ version: "0.9.14" }) };
    const found = levels(stale).filter((one) => one.startsWith("fail"));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("node-src/node_modules/@hatake-fw/api/package.json に入っているのは 0.9.14");
  });

  it("固定した版がそろっていない", () => {
    const mixed = { ...healthy, "java-src/build.gradle": `implementation 'com.github.ASIL-E-Hatake:hatake:v0.9.20'` };
    expect(levels(mixed).some((one) => one.startsWith("fail: 固定した版がそろっていません（0.9.23 / 0.9.20）"))).toBe(true);
  });

  it("走っている道具の版が案件と違えば言う（落とさない）", () => {
    const found = levels(healthy, "0.9.22");
    expect(found.some((one) => one.startsWith("warn: 走っている道具は 0.9.22"))).toBe(true);
    expect(found.some((one) => one.startsWith("fail"))).toBe(false);
  });

  it("MCP が無い・定義の警告は warn", () => {
    const noMcp: Record<string, string> = { ...healthy };
    delete noMcp[".mcp.json"];
    noMcp["definitions/app.yaml"] = DEFINITION.replace("sortable: true", "sortable: true, optionsOf: nope");
    const found = levels(noMcp);
    expect(found.some((one) => one.startsWith("warn: MCP（hatake）が設定に見つかりません"))).toBe(true);
    expect(found.some((one) => one.startsWith("warn: 定義 1 枚（読める 1 枚・警告"))).toBe(true);
  });

  it("node_modules の中の定義らしいものは歩かない", () => {
    const deep = { ...healthy, "node-src/node_modules/some/example.yaml": DEFINITION };
    expect(doctor(tree(deep), "root", { version: "0.9.23" }).definitions).toHaveLength(1);
  });
});

describe("CLI", () => {
  const io = (): CliIo & { lines: string[] } => {
    const lines: string[] = [];
    return {
      lines,
      out: (text) => lines.push(text),
      err: (text) => lines.push(text),
      readFile: () => "",
      writeFile: () => undefined,
      listFiles: () => null,
    };
  };

  it("--version は配っている版を言う（0.9.22 まで 0.0.1 と決め打ちだった）", () => {
    const one = io();
    expect(runCli(["--version"], one)).toBe(0);
    expect(one.lines).toEqual([JSON.parse(readFileSync("package.json", "utf8")).version]);
  });

  it("歩けない入口では doctor は使えないと言う", () => {
    const one = io();
    expect(runCli(["doctor"], one)).toBe(1);
    expect(one.lines.join("")).toContain("doctor は使えません");
  });
});
