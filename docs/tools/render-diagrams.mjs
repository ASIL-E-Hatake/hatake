// 図解（SVG）を、テキストの元データから作る。
//
// なぜ生成するか: 図を手で描くと**言葉と絵がすぐズレる**（層の名前を変えても絵は直らない）。
// 元は `docs/diagrams/*.json` の1枚1ファイルで、そこだけ直せば絵が付いてくる。CI が
// 作り直して差分を見るので、元と絵が食い違ったまま入ることがない。
//
// 依存ゼロ・レイアウトは縦積みだけ。凝った作図器は要らない（要るような図は、そもそも
// 分けたほうが読める）。文字幅は測らない: 中央寄せは `text-anchor`、箇条書きは左寄せで
// 済むので、折り返しだけ元データ側に書く（`lines` を行の配列で持つ）。
//
// 使い方: node docs/tools/render-diagrams.mjs

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const diagramsDir = join(here, '..', 'diagrams');

/** 見た目の決めごと（1か所）。 */
const S = {
  width: 900,
  pad: 24,
  gap: 16, // 箱と箱のあいだ（横）
  arrow: 46, // 矢印の高さ
  line: 19, // 本文の行送り
  boxPad: 14,
  radius: 8,
  titleSize: 19,
  labelSize: 15,
  textSize: 13,
};

/** 箱の高さ。見出し1行＋（あれば）注記＋本文の行数で決まる。 */
const boxHeight = (box) =>
  S.boxPad * 2 +
  22 +
  (box.note ? S.line : 0) +
  (box.lines?.length ?? 0) * S.line;

const escape = (text) =>
  String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

/**
 * 文字の幅の目安（全角は 1em、半角は 0.56em）。
 *
 * 測れないので数える。**枠から溢れたら作らずに落ちる**ようにするために要る（図は
 * 生成物なので、溢れたことに気づかないまま配るのが一番まずい）。
 */
const em = (text) =>
  [...text.replaceAll('**', '')].reduce(
    (sum, c) => sum + (c.charCodeAt(0) > 0x2e80 ? 1 : 0.56),
    0,
  );

/** 入る幅を超えていたら、どこを短くすればいいかを言って落ちる。 */
function fits(text, size, room, where) {
  const width = em(text) * size;
  if (width > room) {
    throw new Error(
      `図が枠に入りません（${where}）。${Math.round(width)}px > ${Math.round(room)}px:\n  ${text}\n` +
        '元データ（docs/diagrams/*.json）の文を短くするか、行を分けてください。',
    );
  }
  return text;
}

/** 強調（`**…**`）だけ拾う。図の中で長い文を書かないので、これで足りる。 */
function span(text, cls) {
  const parts = String(text).split(/\*\*(.+?)\*\*/g);
  return parts
    .map((part, i) =>
      i % 2 === 0
        ? escape(part)
        : `<tspan class="${cls} strong">${escape(part)}</tspan>`,
    )
    .join('');
}

function renderBoxes(row, y) {
  const items = row.items;
  const width = (S.width - S.pad * 2 - S.gap * (items.length - 1)) / items.length;
  const height = Math.max(...items.map(boxHeight));
  const out = [];
  const room = width - S.boxPad * 2;
  items.forEach((box, index) => {
    const x = S.pad + index * (width + S.gap);
    const middle = x + width / 2;
    out.push(
      `  <rect class="box ${box.tone ?? 'core'}" x="${x}" y="${y}" width="${width.toFixed(1)}" height="${height}" rx="${S.radius}"/>`,
    );
    let text = y + S.boxPad + 16;
    fits(box.label, S.labelSize, room, `箱の見出し: ${box.label}`);
    out.push(
      `  <text class="label" x="${middle.toFixed(1)}" y="${text}" text-anchor="middle">${span(box.label, 'label')}</text>`,
    );
    if (box.note) {
      text += S.line;
      fits(box.note, S.textSize, room, `箱の注記: ${box.label}`);
      out.push(
        `  <text class="note" x="${middle.toFixed(1)}" y="${text}" text-anchor="middle">${span(box.note, 'note')}</text>`,
      );
    }
    text += 6;
    for (const line of box.lines ?? []) {
      text += S.line;
      const mark = line.startsWith('!') ? 'bad' : line.startsWith('+') ? 'good' : 'body';
      const body = mark === 'body' ? line : line.slice(1).trim();
      const bullet = mark === 'bad' ? '×' : mark === 'good' ? '○' : '・';
      fits(`${bullet} ${body}`, S.textSize, room, `箱の中の行: ${box.label}`);
      out.push(
        `  <text class="body ${mark}" x="${(x + S.boxPad).toFixed(1)}" y="${text}">${bullet} ${span(body, 'body')}</text>`,
      );
    }
  });
  return { svg: out, height };
}

function renderArrow(row, y) {
  const middle = S.width / 2;
  const baseline = y + S.arrow / 2 + 4;
  const out = [
    `  <line class="flow" x1="${middle}" y1="${y + 4}" x2="${middle}" y2="${y + S.arrow - 8}" marker-end="url(#tip)"/>`,
  ];
  if (row.label) {
    // 行きの札は矢印の**左**（右は戻りの矢印が使うので、長い札が当たる）。
    fits(row.label, S.textSize, middle - 12 - S.pad, `矢印の札: ${row.label}`);
    out.push(
      `  <text class="edge" x="${middle - 12}" y="${baseline}" text-anchor="end">${span(row.label, 'edge')}</text>`,
    );
  }
  if (row.back) {
    // 戻り（応答）は右側に上向きで描く。往復を1本にすると、どちらの話か読めなくなる。
    const right = S.width - S.pad - 140;
    fits(row.back, S.textSize, S.width - S.pad - (right + 10), `戻りの札: ${row.back}`);
    out.push(
      `  <line class="flow back" x1="${right}" y1="${y + S.arrow - 8}" x2="${right}" y2="${y + 4}" marker-end="url(#tipBack)"/>`,
      `  <text class="edge back" x="${right + 10}" y="${baseline}">${span(row.back, 'edge')}</text>`,
    );
  }
  return { svg: out, height: S.arrow };
}

function renderNote(row, y) {
  fits(row.text, S.textSize, S.width - S.pad * 2, `下の注記: ${row.text}`);
  return {
    svg: [
      `  <text class="caption" x="${S.pad}" y="${y + 14}">${span(row.text, 'caption')}</text>`,
    ],
    height: 26,
  };
}

/** 1枚ぶんの SVG。 */
export function renderDiagram(diagram) {
  const body = [];
  let y = S.pad;
  y += S.titleSize + 6;
  fits(diagram.title, S.titleSize, S.width - S.pad * 2, "題");
  const title = `  <text class="title" x="${S.pad}" y="${y}">${span(diagram.title, 'title')}</text>`;
  if (diagram.subtitle) {
    y += S.line;
    fits(diagram.subtitle, S.textSize, S.width - S.pad * 2, "副題");
    body.push(
      `  <text class="caption" x="${S.pad}" y="${y}">${span(diagram.subtitle, 'caption')}</text>`,
    );
  }
  y += 14;

  for (const row of diagram.rows) {
    const drawn =
      row.kind === 'arrow'
        ? renderArrow(row, y)
        : row.kind === 'note'
          ? renderNote(row, y)
          : renderBoxes(row, y);
    body.push(...drawn.svg);
    y += drawn.height + (row.kind === 'arrow' ? 0 : 10);
  }
  const height = Math.round(y + S.pad - 10);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S.width} ${height}" width="${S.width}" height="${height}" role="img" aria-label="${escape(diagram.title)}">`,
    '  <style>',
    ...STYLE,
    '  </style>',
    '  <defs>',
    '    <marker id="tip" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path class="tip" d="M 0 0 L 10 5 L 0 10 z"/></marker>',
    '    <marker id="tipBack" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path class="tipBack" d="M 0 0 L 10 5 L 0 10 z"/></marker>',
    '  </defs>',
    `  <rect class="bg" x="0" y="0" width="${S.width}" height="${height}"/>`,
    title,
    ...body,
    '</svg>',
    '',
  ].join('\n');
}

/**
 * 配色。明るい方を素で書き、暗い方は `prefers-color-scheme` で上書きする
 * （画像として読み込まれても、見る人の設定に付いてくる）。
 */
const STYLE = [
  '    .bg { fill: #ffffff }',
  '    text { font-family: system-ui, "Hiragino Sans", "Noto Sans JP", sans-serif; fill: #0f172a }',
  `    .title { font-size: ${S.titleSize}px; font-weight: 700 }`,
  `    .caption { font-size: ${S.textSize}px; fill: #64748b }`,
  `    .label { font-size: ${S.labelSize}px; font-weight: 600 }`,
  `    .note { font-size: ${S.textSize}px; fill: #64748b }`,
  `    .body { font-size: ${S.textSize}px; fill: #334155 }`,
  `    .edge { font-size: ${S.textSize}px; fill: #475569 }`,
  '    .strong { font-weight: 700 }',
  '    .good { fill: #15803d }',
  '    .bad { fill: #b91c1c }',
  '    .box { stroke-width: 1.5 }',
  '    .core { fill: #f1f5f9; stroke: #475569 }',
  '    .input { fill: #eff6ff; stroke: #2563eb }',
  '    .output { fill: #f0fdf4; stroke: #16a34a }',
  '    .outside { fill: #fefce8; stroke: #ca8a04; stroke-dasharray: 5 4 }',
  '    .flow { stroke: #475569; stroke-width: 2 }',
  '    .back { stroke: #94a3b8 }',
  '    .tip { fill: #475569 }',
  '    .tipBack { fill: #94a3b8 }',
  '    @media (prefers-color-scheme: dark) {',
  '      .bg { fill: #0b1220 }',
  '      text { fill: #e2e8f0 }',
  '      .caption, .note { fill: #94a3b8 }',
  '      .body { fill: #cbd5e1 }',
  '      .edge { fill: #cbd5e1 }',
  '      .good { fill: #4ade80 }',
  '      .bad { fill: #f87171 }',
  '      .core { fill: #172033; stroke: #94a3b8 }',
  '      .input { fill: #172554; stroke: #60a5fa }',
  '      .output { fill: #052e16; stroke: #4ade80 }',
  '      .outside { fill: #2a2410; stroke: #facc15 }',
  '      .flow { stroke: #cbd5e1 }',
  '      .back { stroke: #64748b }',
  '      .tip { fill: #cbd5e1 }',
  '      .tipBack { fill: #64748b }',
  '    }',
];

/** すべての元データを SVG にする。返すのは書いたファイル名。 */
export function renderAll(dir = diagramsDir) {
  const written = [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.json')).sort()) {
    const diagram = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    const name = `${file.replace(/\.json$/, '')}.svg`;
    writeFileSync(join(dir, name), renderDiagram(diagram), 'utf8');
    written.push(name);
  }
  return written;
}

if (process.argv[1] && process.argv[1].endsWith('render-diagrams.mjs')) {
  const written = renderAll();
  console.log(`図解: ${written.length} 枚（${written.join(' ')}）`);
}
