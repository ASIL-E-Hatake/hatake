// `hatake doctor`（0.9.23）: 案件の**道具と版の足並み**を1回で見る。
//
// 定義の中身は `hatake check` が見る。ここが見るのは**その手前**で、定義が正しくても
// 動かない・古い版で動いている、を見つける:
//
//   ・案件が固定した版（package.json / pubspec.yaml / build.gradle / hatake.version）が
//     そろっているか
//   ・実際に入っている版（node_modules / pubspec.lock）が固定した版と同じか
//     ＝0.9.20 の見本で、上げたつもりがコンテナの中は 0.9.14 のまま動いていた（手元の
//     node_modules が焼き直しで上書きされていた）。画面は普通に出るので気づけない
//   ・定義の `dsl_version` をこの版が読めるか・警告がいくつあるか
//   ・AI の道具（MCP）が繋がっているか
//
// Java の依存は Gradle を回さないと解けないので、**固定した版だけ**を見る（入っている版は
// 言わない＝見ていないことを見たように言わない）。
//
// 読むだけで何も書かない。

import { checkDslVersion } from "./dslVersion.js";
import { findWarnings } from "./warnings.js";
import { parse as parseYamlText } from "yaml";

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** doctor が読む口（CLI の `CliIo` の一部。試験では作り物を渡す）。 */
export interface DoctorIo {
  readFile(path: string): string;
  /** ディレクトリの中を1段だけ（名前と、ディレクトリかどうか）。無ければ null。 */
  listDir(path: string): { name: string; dir: boolean }[] | null;
}

/** 案件のどこかで見つけた版。 */
export interface FoundVersion {
  /** どのファイルか（案件の根からの道）。 */
  file: string;
  /** 何の版か（`@hatake-fw/api` / `hatake_core` / `JitPack の hatake` …）。 */
  what: string;
  version: string;
  /** 固定した版（`pinned`）か、入っている版（`installed`）か。 */
  kind: "pinned" | "installed";
  /** 入っている版のとき、同じ場所で固定した版（分かれば）。 */
  expected?: string;
}

export interface DoctorDefinition {
  file: string;
  /** 読めたか（読めなければ理由）。 */
  readable: true | string;
  dslVersion?: string;
  warnings: number;
}

export interface DoctorFinding {
  level: "ok" | "warn" | "fail";
  message: string;
}

export interface DoctorReport {
  tool: { version: string; node?: string };
  versions: FoundVersion[];
  definitions: DoctorDefinition[];
  mcp: boolean;
  findings: DoctorFinding[];
}

/** 歩かないディレクトリ（生成物と依存の置き場）。入っている版は決め打ちの道で読む。 */
const SKIP = new Set([
  "node_modules",
  ".dart_tool",
  "build",
  "dist",
  ".git",
  ".gradle",
  ".idea",
  ".vscode",
  "coverage",
]);

const join = (a: string, b: string): string => (a === "" || a === "." ? b : `${a}/${b}`);

function walk(io: DoctorIo, root: string, at: string, out: string[], depth: number): void {
  if (depth > 8) return;
  const entries = io.listDir(at === "" ? root : `${root}/${at}`);
  for (const entry of entries ?? []) {
    const rel = join(at, entry.name);
    if (entry.dir) {
      if (!SKIP.has(entry.name)) walk(io, root, rel, out, depth + 1);
    } else {
      out.push(rel);
    }
  }
}

const tryRead = (io: DoctorIo, path: string): string | undefined => {
  try {
    return io.readFile(path);
  } catch {
    return undefined;
  }
};

const VERSION_IN = /(\d+\.\d+\.\d+)/;

/** `^0.9.21` / `v0.9.21` / tarball の URL（`…/v0.9.21/hatake-fw-api-0.9.21.tgz`）から版を抜く。 */
const versionOf = (spec: string): string | undefined => VERSION_IN.exec(spec)?.[1];

function fromPackageJson(io: DoctorIo, root: string, file: string, out: FoundVersion[]): void {
  const text = tryRead(io, `${root}/${file}`);
  if (text === undefined) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return;
  }
  if (!isDict(parsed)) return;
  const dir = file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : "";
  for (const key of ["dependencies", "devDependencies"]) {
    const deps = parsed[key];
    if (!isDict(deps)) continue;
    for (const [name, spec] of Object.entries(deps)) {
      if (!name.startsWith("@hatake-fw/") || typeof spec !== "string") continue;
      const pinned = versionOf(spec);
      if (pinned !== undefined) out.push({ file, what: name, version: pinned, kind: "pinned" });
      const installedFile = join(dir, `node_modules/${name}/package.json`);
      const installed = tryRead(io, `${root}/${installedFile}`);
      if (installed === undefined) continue;
      try {
        const version = (JSON.parse(installed) as Dict).version;
        if (typeof version === "string") {
          out.push({
            file: installedFile,
            what: name,
            version,
            kind: "installed",
            ...(pinned === undefined ? {} : { expected: pinned }),
          });
        }
      } catch {
        // 壊れた node_modules は「入っていない」と同じ扱い
      }
    }
  }
}

function fromPubspec(io: DoctorIo, root: string, file: string, out: FoundVersion[]): void {
  const text = tryRead(io, `${root}/${file}`);
  if (text === undefined) return;
  let parsed: unknown;
  try {
    parsed = parseYamlText(text);
  } catch {
    return;
  }
  if (!isDict(parsed)) return;
  const pins = new Map<string, string>();
  for (const key of ["dependencies", "dev_dependencies", "dependency_overrides"]) {
    const deps = parsed[key];
    if (!isDict(deps)) continue;
    for (const [name, spec] of Object.entries(deps)) {
      if (!name.startsWith("hatake")) continue;
      // git で入れる形（`git: { url, ref: v0.9.21, path }`）か、版の範囲（`^0.9.21`）。
      const ref = isDict(spec) && isDict(spec.git) ? spec.git.ref : spec;
      const pinned = typeof ref === "string" ? versionOf(ref) : undefined;
      if (pinned === undefined) continue;
      pins.set(name, pinned);
      out.push({ file, what: name, version: pinned, kind: "pinned" });
    }
  }
  // 入っている版は pubspec.lock（`packages: { hatake_core: { version: "0.9.21" } }`）。
  const lockFile = file.replace(/pubspec\.yaml$/, "pubspec.lock");
  const lock = tryRead(io, `${root}/${lockFile}`);
  if (lock === undefined) return;
  try {
    const packages = (parseYamlText(lock) as Dict)?.packages;
    if (!isDict(packages)) return;
    for (const [name, entry] of Object.entries(packages)) {
      if (!name.startsWith("hatake") || !isDict(entry) || typeof entry.version !== "string") continue;
      const expected = pins.get(name);
      out.push({
        file: lockFile,
        what: name,
        version: entry.version,
        kind: "installed",
        ...(expected === undefined ? {} : { expected }),
      });
    }
  } catch {
    // 読めない lock は見ない
  }
}

function fromGradle(io: DoctorIo, root: string, file: string, out: FoundVersion[]): void {
  const text = tryRead(io, `${root}/${file}`);
  if (text === undefined) return;
  const patterns: [RegExp, string][] = [
    [/com\.github\.ASIL-E-Hatake:hatake:v?(\d+\.\d+\.\d+)/g, "hatake（JitPack）"],
    [/io\.github\.asil-e-hatake:hatake-core:(\d+\.\d+\.\d+)/g, "hatake-core（Maven）"],
  ];
  for (const [pattern, what] of patterns) {
    for (const match of text.matchAll(pattern)) {
      out.push({ file, what, version: match[1], kind: "pinned" });
    }
  }
}

/** 定義らしいファイル（`dsl_version` を持つ YAML / JSON）。 */
function definitionOf(io: DoctorIo, root: string, file: string): DoctorDefinition | undefined {
  if (!/\.(ya?ml|json)$/.test(file) || /(^|\/)(package|package-lock|tsconfig|pubspec)[^/]*$/.test(file)) {
    return undefined;
  }
  const text = tryRead(io, `${root}/${file}`);
  if (text === undefined || !/(^|["\s{,])dsl_version["\s]*:/m.test(text)) return undefined;
  let parsed: unknown;
  try {
    parsed = parseYamlText(text);
  } catch (error) {
    return { file, readable: `YAML として読めません（${String(error).split("\n")[0]}）`, warnings: 0 };
  }
  if (!isDict(parsed) || parsed.dsl_version === undefined) return undefined;
  const dslVersion = String(parsed.dsl_version);
  try {
    return { file, readable: true, dslVersion, warnings: findWarnings(parsed).length };
  } catch (error) {
    return { file, readable: String(error instanceof Error ? error.message : error), dslVersion, warnings: 0 };
  }
}

function hasMcp(io: DoctorIo, root: string): boolean {
  for (const file of [".mcp.json", ".claude/settings.json", ".claude/settings.local.json"]) {
    const text = tryRead(io, `${root}/${file}`);
    if (text === undefined) continue;
    try {
      const servers = (JSON.parse(text) as Dict).mcpServers;
      if (isDict(servers) && Object.keys(servers).some((name) => name.includes("hatake"))) return true;
    } catch {
      // 読めない設定は「繋がっていない」と同じ
    }
  }
  return false;
}

/**
 * 案件 [root] の診断。[tool] は走っている道具の版（`hatake --version` と同じ）。
 */
export function doctor(io: DoctorIo, root: string, tool: DoctorReport["tool"]): DoctorReport {
  const files: string[] = [];
  walk(io, root, "", files, 0);

  const versions: FoundVersion[] = [];
  const definitions: DoctorDefinition[] = [];
  for (const file of files) {
    const base = file.slice(file.lastIndexOf("/") + 1);
    if (base === "package.json") fromPackageJson(io, root, file, versions);
    else if (base === "pubspec.yaml") fromPubspec(io, root, file, versions);
    else if (base === "build.gradle" || base === "build.gradle.kts") fromGradle(io, root, file, versions);
    else if (base === "hatake.version") {
      const version = versionOf(tryRead(io, `${root}/${file}`) ?? "");
      if (version !== undefined) versions.push({ file, what: "hatake.version", version, kind: "pinned" });
    }
    const definition = definitionOf(io, root, file);
    if (definition !== undefined) definitions.push(definition);
  }
  const mcp = hasMcp(io, root);

  const findings: DoctorFinding[] = [];
  const pinned = versions.filter((one) => one.kind === "pinned");
  const installed = versions.filter((one) => one.kind === "installed");
  const distinct = [...new Set(pinned.map((one) => one.version))];

  if (pinned.length === 0) {
    findings.push({ level: "warn", message: "hatake の版を固定している所が見つかりません（package.json / pubspec.yaml / build.gradle）。" });
  } else if (distinct.length === 1) {
    findings.push({ level: "ok", message: `固定した版は ${distinct[0]} にそろっています（${pinned.length} か所）。` });
  } else {
    findings.push({
      level: "fail",
      message:
        `固定した版がそろっていません（${distinct.join(" / ")}）: ` +
        pinned.map((one) => `${one.file} の ${one.what} が ${one.version}`).join("、") +
        "。3版は同じ番号で出しているので、同じ版にそろえてください。",
    });
  }

  // 同じファイルで同じ版なら1行にまとめる（lock 1枚に hatake_* が6つ並ぶ）。
  const staleBy = new Map<string, { file: string; version: string; expected: string; what: string[] }>();
  for (const one of installed) {
    const expected = one.expected ?? (distinct.length === 1 ? distinct[0] : undefined);
    if (expected === undefined || one.version === expected) continue;
    const key = `${one.file}#${one.version}#${expected}`;
    const found = staleBy.get(key) ?? { file: one.file, version: one.version, expected, what: [] };
    found.what.push(one.what);
    staleBy.set(key, found);
  }
  for (const one of staleBy.values()) {
    findings.push({
      level: "fail",
      message:
        `${one.file} に入っているのは ${one.version} ですが、固定したのは ${one.expected} です（${one.what.join("・")}）。` +
        "入れ直すか、イメージを焼き直してください（手元の node_modules / pubspec.lock が古いまま持ち込まれていることがあります）。",
    });
  }
  const stale = staleBy.size;
  if (installed.length > 0 && stale === 0) {
    findings.push({ level: "ok", message: `入っている版は固定した版と同じです（${installed.length} か所）。` });
  }

  if (distinct.length === 1 && distinct[0] !== tool.version) {
    findings.push({
      level: "warn",
      message: `走っている道具は ${tool.version} で、案件は ${distinct[0]} です（道具の答えが案件の版と違うことがあります）。`,
    });
  }

  if (definitions.length === 0) {
    findings.push({ level: "warn", message: "定義（dsl_version を持つ YAML / JSON）が見つかりません。" });
  } else {
    const broken = definitions.filter((one) => one.readable !== true);
    for (const one of broken) findings.push({ level: "fail", message: `${one.file} が読めません: ${one.readable}` });
    for (const one of definitions) {
      if (one.dslVersion === undefined) continue;
      const verdict = checkDslVersion(one.dslVersion);
      if (verdict.fatal) {
        findings.push({ level: "fail", message: `${one.file} の dsl_version "${one.dslVersion}" はこの版では読めません。` });
      } else if (verdict.warn) {
        findings.push({ level: "warn", message: `${one.file} は DSL ${one.dslVersion} 向けで、この道具より新しい版です。` });
      }
    }
    const warnings = definitions.reduce((sum, one) => sum + one.warnings, 0);
    findings.push({
      level: warnings > 0 ? "warn" : "ok",
      message:
        `定義 ${definitions.length} 枚（読める ${definitions.length - broken.length} 枚・警告 ${warnings} 件）。` +
        (warnings > 0 ? "中身は `hatake check <定義>` で見てください。" : ""),
    });
  }

  findings.push(
    mcp
      ? { level: "ok", message: "MCP（hatake）が設定にあります。" }
      : {
          level: "warn",
          message: "MCP（hatake）が設定に見つかりません。AI に引かせるなら `claude mcp add hatake -- npx hatake-mcp` など。",
        },
  );

  return { tool, versions, definitions, mcp, findings };
}

/** 人に見せる形。 */
export function doctorLines(report: DoctorReport): string[] {
  const mark = { ok: "✓", warn: "!", fail: "✗" } as const;
  const lines = [
    `hatake doctor（道具 ${report.tool.version}${report.tool.node === undefined ? "" : `・Node ${report.tool.node}`}）`,
    "",
  ];
  for (const one of report.findings) lines.push(`${mark[one.level]} ${one.message}`);
  if (report.versions.length > 0) {
    lines.push("", "見つけた版:");
    for (const one of report.versions) {
      lines.push(`  ${one.kind === "pinned" ? "固定" : "入っている"}  ${one.version}  ${one.what}（${one.file}）`);
    }
  }
  return lines;
}
