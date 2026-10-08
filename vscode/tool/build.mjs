#!/usr/bin/env node
// 拡張機能を組む（`dist/` を作り直す）。
//
//   dist/extension.js   VS Code 側（Node。CommonJS に固める＝VS Code 1.90 に合わせる）
//   dist/spec/          道具が引く spec（配る @hatake-fw/api と同じ規則で同梱）
//   dist/schema/        yamlValidation が指すスキーマ（spec の写し）
//   dist/preview.js     プレビュー（Webview の中・ブラウザ。Vue 版の Renderer ごと固める）
//   dist/preview.css    その見た目（@hatake-fw/runtime/hatake.css ＋帯）
//   dist/view.js        ツリーから開く画面（タブ付き。画面のタブは preview と同じ部品）
//   dist/view.css       その見た目
//
// 枠組みは**1本に固めて同梱**する（配るパッケージの依存は増やさない）。
//
// `import.meta.url` は CommonJS では空になるので、固めたファイル自身の場所に置き換える
// （`toolVersion` が版を package.json から読むのに使う。空のままだと版が "unknown" になり、
// 拡張機能の中の doctor が版を比べられない）。

import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SPEC = resolve(HERE, "..", "spec");
const DIST = join(HERE, "dist");

/** 配らないもの（typescript/tool/bundle-spec.mjs と同じ。test 専用）。 */
const SKIP = new Set(["conformance", "tools"]);

rmSync(DIST, { recursive: true, force: true });
mkdirSync(join(DIST, "schema"), { recursive: true });

for (const name of readdirSync(SPEC)) {
  if (SKIP.has(name)) continue;
  cpSync(join(SPEC, name), join(DIST, "spec", name), { recursive: true });
}
for (const name of ["hatake-page.schema.json", "hatake-project.schema.json", "hatake-intent.schema.json"]) {
  cpSync(join(SPEC, name), join(DIST, "schema", name));
}

await build({
  entryPoints: [join(HERE, "src", "extension.ts")],
  outfile: join(DIST, "extension.js"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["vscode"],
  define: { "import.meta.url": "__hatakeModuleUrl" },
  banner: { js: 'const __hatakeModuleUrl = require("node:url").pathToFileURL(__filename).href;' },
  logLevel: "warning",
});

// Webview の中で動く側。ブラウザ向けに1本ずつ固める（CSS は同じ名前の .css に出る）。
//   preview.js … YAML の横のプレビュー
//   view.js    … ツリーから開く画面（タブ付き）
for (const [entry, out] of [
  [join(HERE, "src", "preview", "main.ts"), "preview.js"],
  [join(HERE, "src", "view", "main.ts"), "view.js"],
]) await build({
  entryPoints: [entry],
  outfile: join(DIST, out),
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2022",
  minify: true,
  define: {
    "process.env.NODE_ENV": '"production"',
    __VUE_OPTIONS_API__: "false",
    __VUE_PROD_DEVTOOLS__: "false",
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
  },
  logLevel: "warning",
});

// 試験で開く器（Webview と**同じ関数**で作る。.vsix には入れない）。
const html = await build({
  entryPoints: [join(HERE, "src", "preview", "html.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const { previewHtml, viewHtml } = await import(
  `data:text/javascript;base64,${Buffer.from(html.outputFiles[0].text).toString("base64")}`
);
writeFileSync(
  join(DIST, "preview-harness.html"),
  previewHtml({ script: "preview.js", style: "preview.css", cspSource: "'self'", nonce: "harness" }),
);
writeFileSync(
  join(DIST, "view-harness.html"),
  viewHtml({ script: "view.js", style: "view.css", cspSource: "'self'", nonce: "harness" }),
);

if (!existsSync(join(DIST, "spec", "hatake-page.schema.json"))) {
  console.error("spec を同梱できませんでした。");
  process.exit(1);
}
console.log("組みました: vscode/dist（extension.js・preview.js・view.js・spec・schema）");
