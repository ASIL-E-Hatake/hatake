// Webview の器（HTML）。拡張機能の Webview と、試験で開く器が**同じ関数**から作る
// （試験の器を別に書くと、試験が本物と違うものを見る）。
//
//   previewHtml … YAML の横のプレビュー（dist/preview.js）
//   viewHtml    … ツリーから開く画面（タブ付き。dist/view.js）

export interface PreviewHtmlOptions {
  /** 読み込む script（dist/preview.js か dist/view.js）を指す URI。 */
  script: string;
  /** 見た目（dist/preview.css か dist/view.css）を指す URI。 */
  style: string;
  /** Webview の CSP で許す出どころ（拡張機能の外では 'self'）。 */
  cspSource: string;
  /** script に付ける nonce。 */
  nonce: string;
}

function page(options: PreviewHtmlOptions, title: string, body: string): string {
  const csp = [
    "default-src 'none'",
    `style-src ${options.cspSource} 'unsafe-inline'`,
    `img-src ${options.cspSource} data:`,
    `font-src ${options.cspSource}`,
    `script-src 'nonce-${options.nonce}'`,
  ].join("; ");
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${options.style}">
<title>${title}</title>
</head>
<body>
${body}
<script nonce="${options.nonce}" src="${options.script}"></script>
</body>
</html>
`;
}

const NOTE = "作り物のデータ・役割は見え方の確認だけ（権限の守りではありません）";

export function previewHtml(options: PreviewHtmlOptions): string {
  return page(
    options,
    "hatake プレビュー",
    `<div class="hatake-preview-bar" data-hatake="preview-bar">
  <strong id="file"></strong>
  <span id="data" data-hatake="preview-data"></span>
  <label id="roles" hidden><select id="role" data-hatake="preview-role"></select></label>
  <span class="hatake-preview-note">${NOTE}</span>
</div>
<div id="app"></div>`,
  );
}

export function viewHtml(options: PreviewHtmlOptions): string {
  return page(
    options,
    "hatake",
    `<header class="hatake-view-head" data-hatake="view-head">
  <div>
    <h1 id="title" data-hatake="view-title"></h1>
    <div id="subtitle" class="hatake-view-sub"></div>
  </div>
  <button id="open" type="button" class="hatake-view-open" data-hatake="view-open">定義を開く ↗</button>
</header>
<nav class="hatake-view-tabs" id="tabs" role="tablist" data-hatake="view-tabs"></nav>
<section class="hatake-view-pane" id="pane-screen" data-hatake="view-pane:screen">
  <div class="hatake-preview-bar" data-hatake="preview-bar">
    <span id="data" data-hatake="preview-data"></span>
    <label id="roles" hidden><select id="role" data-hatake="preview-role"></select></label>
    <span class="hatake-preview-note">${NOTE}</span>
  </div>
  <div id="app"></div>
</section>
<section class="hatake-view-pane" id="pane-fields" data-hatake="view-pane:fields" hidden></section>
<section class="hatake-view-pane" id="pane-actions" data-hatake="view-pane:actions" hidden></section>
<section class="hatake-view-pane" id="pane-roles" data-hatake="view-pane:roles" hidden></section>
<section class="hatake-view-pane" id="pane-check" data-hatake="view-pane:check" hidden></section>`,
  );
}
