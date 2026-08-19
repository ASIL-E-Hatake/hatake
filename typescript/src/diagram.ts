// 図解を描く（元データ → SVG）。
//
// もともと `docs/tools/render-diagrams.mjs` にあった描画をここへ移した。理由は**同じ描画を
// 2つ持たないため**＝定義から図を作る（[appDiagram]）ようになった時点で、道具側と資料側で
// 描画が2本になるのが見えたので、パッケージの中に1本だけ置く。
//
// レイアウトは縦積みだけ（箱・矢印・注記の3種類）。凝った作図器は要らない（要るような図は、
// そもそも分けたほうが読める）。文字幅は測らずに数える＝**枠から溢れたら描かずに落ちる**
// （溢れたことに気づかないまま配るのが一番まずいので、警告ではなくエラー）。

/** 箱1つ。 */
export interface DiagramBox {
  /** 箱どうしに線を引くときの名前（[DiagramLink] から指す）。図の中で重複させない。 */
  id?: string;
  label: string;
  /** 見出しの下の小さい字（1行）。 */
  note?: string;
  /** 箱の中の箇条書き。先頭が `+` なら○、`!` なら×。 */
  lines?: string[];
  /** 色味。外から来るもの / フレームワーク / 出来上がるもの / 利用者が用意するもの。 */
  tone?: "input" | "core" | "output" | "outside";
}

/**
 * 箱どうしの線1本（どの箱から、どの箱へ）。
 *
 * 上の行の箱と下の行の箱を繋ぐ。どちら向きかは**どちらの行に居るか**で決まる（`from` が
 * 下の行なら上向き＝戻る遷移）。同じ行の中は繋げない（縦積みの作図器では線が箱に重なる）。
 */
export interface DiagramLink {
  from: string;
  to: string;
  /** 線に添える札（ボタン名など）。 */
  label?: string;
  /** true = 細い灰色で描く（戻り・補助の遷移）。 */
  back?: boolean;
}

/** 縦に積む行1つ。 */
export type DiagramRow =
  /**
   * 箱を横に並べる行。[slots] を渡すと、その数で割った幅に**左詰め**で置く（同じ段が
   * 複数行に分かれるとき、行ごとに箱の幅が変わらないように）。
   */
  | { kind: "boxes"; items: DiagramBox[]; slots?: number }
  | { kind: "arrow"; label?: string; back?: string }
  /** 直前の箱の行と直後の箱の行のあいだに、1本ずつ線を引く。 */
  | { kind: "links"; items: DiagramLink[] }
  | { kind: "note"; text: string };

/** 図1枚ぶんの元データ（`docs/diagrams/*.json` と同じ形）。 */
export interface Diagram {
  title: string;
  subtitle?: string;
  rows: DiagramRow[];
}

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
} as const;

/** 箱の幅（1行に [count] 個並べたとき）。 */
const boxWidth = (count: number): number =>
  (S.width - S.pad * 2 - S.gap * (count - 1)) / count;

/** 左端の位置（[count] 個並べたときの [index] 番目）。 */
const boxLeft = (index: number, count: number): number =>
  S.pad + index * (boxWidth(count) + S.gap);

/** 中心の位置（線を引く先）。 */
const boxCenter = (index: number, count: number): number =>
  boxLeft(index, count) + boxWidth(count) / 2;

/** 箱に文字を入れられる幅（1行に [count] 個並べたとき）。 */
export const roomForBoxes = (count: number): number =>
  boxWidth(count) - S.boxPad * 2;

/** 線の帯（上の余白・1本ぶんの高さ・下の余白）。 */
const LINK = { top: 12, lane: 16, bottom: 14 } as const;

/** 箱の高さ。見出し1行＋（あれば）注記＋本文の行数で決まる。 */
const boxHeight = (box: DiagramBox): number =>
  S.boxPad * 2 +
  22 +
  (box.note === undefined ? 0 : S.line) +
  (box.lines?.length ?? 0) * S.line;

const escape = (text: string): string =>
  String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

/**
 * 文字の幅の目安（全角は 1em、半角は 0.56em）。
 *
 * 測れないので数える。桁を揃えるためではなく、**溢れを見つけるため**にある。
 */
export const em = (text: string): number =>
  [...text.replaceAll("**", "")].reduce(
    (sum, c) => sum + (c.charCodeAt(0) > 0x2e80 ? 1 : 0.56),
    0,
  );

/** 入る幅を超えていたら、どこを短くすればいいかを言って落ちる。 */
function fits(text: string, size: number, room: number, where: string): string {
  const width = em(text) * size;
  if (width > room) {
    throw new Error(
      `図が枠に入りません（${where}）。${Math.round(width)}px > ${Math.round(room)}px:\n  ${text}\n` +
        "元データの文を短くするか、行を分けてください。",
    );
  }
  return text;
}

/** 強調（`**…**`）だけ拾う。図の中で長い文を書かないので、これで足りる。 */
function span(text: string, cls: string): string {
  return String(text)
    .split(/\*\*(.+?)\*\*/g)
    .map((part, i) =>
      i % 2 === 0
        ? escape(part)
        : `<tspan class="${cls} strong">${escape(part)}</tspan>`,
    )
    .join("");
}

interface Drawn {
  svg: string[];
  height: number;
}

function renderBoxes(items: DiagramBox[], y: number, slots?: number): Drawn {
  const count = Math.max(slots ?? items.length, items.length);
  const width = boxWidth(count);
  const height = Math.max(...items.map(boxHeight));
  const room = width - S.boxPad * 2;
  const out: string[] = [];
  items.forEach((box, index) => {
    const x = boxLeft(index, count);
    const middle = x + width / 2;
    out.push(
      `  <rect class="box ${box.tone ?? "core"}" x="${x}" y="${y}" width="${width.toFixed(1)}" height="${height}" rx="${S.radius}"/>`,
    );
    let text = y + S.boxPad + 16;
    fits(box.label, S.labelSize, room, `箱の見出し: ${box.label}`);
    out.push(
      `  <text class="label" x="${middle.toFixed(1)}" y="${text}" text-anchor="middle">${span(box.label, "label")}</text>`,
    );
    if (box.note !== undefined) {
      text += S.line;
      fits(box.note, S.textSize, room, `箱の注記: ${box.label}`);
      out.push(
        `  <text class="note" x="${middle.toFixed(1)}" y="${text}" text-anchor="middle">${span(box.note, "note")}</text>`,
      );
    }
    text += 6;
    for (const line of box.lines ?? []) {
      text += S.line;
      const mark = line.startsWith("!") ? "bad" : line.startsWith("+") ? "good" : "body";
      const body = mark === "body" ? line : line.slice(1).trim();
      const bullet = mark === "bad" ? "×" : mark === "good" ? "○" : "・";
      fits(`${bullet} ${body}`, S.textSize, room, `箱の中の行: ${box.label}`);
      out.push(
        `  <text class="body ${mark}" x="${(x + S.boxPad).toFixed(1)}" y="${text}">${bullet} ${span(body, "body")}</text>`,
      );
    }
  });
  return { svg: out, height };
}

function renderArrow(row: { label?: string; back?: string }, y: number): Drawn {
  const middle = S.width / 2;
  const baseline = y + S.arrow / 2 + 4;
  const out = [
    `  <line class="flow" x1="${middle}" y1="${y + 4}" x2="${middle}" y2="${y + S.arrow - 8}" marker-end="url(#tip)"/>`,
  ];
  if (row.label !== undefined) {
    // 行きの札は矢印の**左**（右は戻りの矢印が使うので、長い札が当たる）。
    fits(row.label, S.textSize, middle - 12 - S.pad, `矢印の札: ${row.label}`);
    out.push(
      `  <text class="edge" x="${middle - 12}" y="${baseline}" text-anchor="end">${span(row.label, "edge")}</text>`,
    );
  }
  if (row.back !== undefined) {
    // 戻り（応答）は右側に上向きで描く。往復を1本にすると、どちらの話か読めなくなる。
    const right = S.width - S.pad - 140;
    fits(row.back, S.textSize, S.width - S.pad - (right + 10), `戻りの札: ${row.back}`);
    out.push(
      `  <line class="flow back" x1="${right}" y1="${y + S.arrow - 8}" x2="${right}" y2="${y + 4}" marker-end="url(#tipBack)"/>`,
      `  <text class="edge back" x="${right + 10}" y="${baseline}">${span(row.back, "edge")}</text>`,
    );
  }
  return { svg: out, height: S.arrow };
}

/** 箱の行（線を引くときに、上下の行として使うもの）。 */
type BoxesRow = { kind: "boxes"; items: DiagramBox[]; slots?: number };

const slotsOf = (row: BoxesRow): number =>
  Math.max(row.slots ?? row.items.length, row.items.length);

/**
 * 箱どうしの線を引く。
 *
 * 1本ごとに横に走る高さ（レーン）を分けるので、線が重なって「どれがどれへ」が読めなくなる
 * ことはない。行の中の位置は [boxCenter] で数えているだけ（文字を測らないのと同じ考え方）。
 *
 * 指した箱が上下の行に居なければ**描かずに落ちる**。図に出ていない遷移を黙って落とすと、
 * 「線が無い＝遷移が無い」と読まれるので、それが一番まずい。
 */
function renderLinks(
  items: DiagramLink[],
  y: number,
  above: BoxesRow | undefined,
  below: BoxesRow | undefined,
): Drawn {
  const height = LINK.top + Math.max(1, items.length) * LINK.lane + LINK.bottom;
  if (above === undefined || below === undefined) {
    throw new Error(
      "箱どうしの線は、箱の行と箱の行のあいだにしか引けません（links の上下に boxes が要る）。",
    );
  }
  const out: string[] = [];
  const at = (row: BoxesRow, id: string): number =>
    row.items.findIndex((box) => box.id === id);

  items.forEach((link, lane) => {
    const down = at(above, link.from) >= 0 && at(below, link.to) >= 0;
    const up = at(below, link.from) >= 0 && at(above, link.to) >= 0;
    if (!down && !up) {
      throw new Error(
        `線を引けません（${link.from} → ${link.to}）。` +
          "どちらかの箱が、線の上下の行に居ません。",
      );
    }
    const upper = down ? at(above, link.from) : at(above, link.to);
    const lower = down ? at(below, link.to) : at(below, link.from);
    const top = boxCenter(upper, slotsOf(above));
    const bottom = boxCenter(lower, slotsOf(below));
    const laneY = y + LINK.top + lane * LINK.lane + LINK.lane / 2;
    // 行きは上から下へ、戻りは下から上へ。矢印の向きは道の終わりに付く（marker-end）ので、
    // 描き始めを入れ替えるだけで向きが変わる。
    const path = down
      ? `M ${top.toFixed(1)} ${y} V ${laneY.toFixed(1)} H ${bottom.toFixed(1)} V ${y + height}`
      : `M ${bottom.toFixed(1)} ${y + height} V ${laneY.toFixed(1)} H ${top.toFixed(1)} V ${y}`;
    out.push(
      `  <path class="flow link${link.back === true ? " back" : ""}" d="${path}" ` +
        `marker-end="url(#${link.back === true ? "tipBack" : "tip"})"/>`,
    );
    if (link.label === undefined) return;
    fits(link.label, S.textSize, S.width - S.pad * 2, `線の札: ${link.label}`);
    // 札は横に走る所の上。真下に降りるだけの線は札が重なるので、右にずらす。
    const straight = Math.abs(top - bottom) < 1;
    out.push(
      `  <text class="edge" x="${(straight ? top + 8 : (top + bottom) / 2).toFixed(1)}" ` +
        `y="${(laneY - 4).toFixed(1)}"${straight ? "" : ' text-anchor="middle"'}>` +
        `${span(link.label, "edge")}</text>`,
    );
  });
  return { svg: out, height };
}

function renderNote(text: string, y: number): Drawn {
  fits(text, S.textSize, S.width - S.pad * 2, `下の注記: ${text}`);
  return {
    svg: [`  <text class="caption" x="${S.pad}" y="${y + 14}">${span(text, "caption")}</text>`],
    height: 26,
  };
}

/** 1枚ぶんの SVG。 */
export function renderDiagram(diagram: Diagram): string {
  const body: string[] = [];
  let y = S.pad + S.titleSize + 6;
  fits(diagram.title, S.titleSize, S.width - S.pad * 2, "題");
  const title = `  <text class="title" x="${S.pad}" y="${y}">${span(diagram.title, "title")}</text>`;
  if (diagram.subtitle !== undefined) {
    y += S.line;
    fits(diagram.subtitle, S.textSize, S.width - S.pad * 2, "副題");
    body.push(
      `  <text class="caption" x="${S.pad}" y="${y}">${span(diagram.subtitle, "caption")}</text>`,
    );
  }
  y += 14;

  // 線の行は上下の箱の行を見るので、行の並びを先に持っておく。
  const boxesAt = (index: number): BoxesRow | undefined => {
    const row = diagram.rows[index];
    return row?.kind === "boxes" ? row : undefined;
  };

  diagram.rows.forEach((row, index) => {
    const drawn =
      row.kind === "arrow"
        ? renderArrow(row, y)
        : row.kind === "note"
          ? renderNote(row.text, y)
          : row.kind === "links"
            ? renderLinks(row.items, y, boxesAt(index - 1), boxesAt(index + 1))
            : renderBoxes(row.items, y, row.slots);
    body.push(...drawn.svg);
    // 矢印と線は帯の中に余白を持っているので、行のあいだの隙間を足さない。
    y += drawn.height + (row.kind === "arrow" || row.kind === "links" ? 0 : 10);
  });
  const height = Math.round(y + S.pad - 10);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S.width} ${height}" width="${S.width}" height="${height}" role="img" aria-label="${escape(diagram.title)}">`,
    "  <style>",
    ...STYLE,
    "  </style>",
    "  <defs>",
    '    <marker id="tip" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path class="tip" d="M 0 0 L 10 5 L 0 10 z"/></marker>',
    '    <marker id="tipBack" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path class="tipBack" d="M 0 0 L 10 5 L 0 10 z"/></marker>',
    "  </defs>",
    `  <rect class="bg" x="0" y="0" width="${S.width}" height="${height}"/>`,
    title,
    ...body,
    "</svg>",
    "",
  ].join("\n");
}

/**
 * 配色。明るい方を素で書き、暗い方は `prefers-color-scheme` で上書きする
 * （画像として読み込まれても、見る人の設定に付いてくる）。
 */
const STYLE = [
  "    .bg { fill: #ffffff }",
  '    text { font-family: system-ui, "Hiragino Sans", "Noto Sans JP", sans-serif; fill: #0f172a }',
  `    .title { font-size: ${S.titleSize}px; font-weight: 700 }`,
  `    .caption { font-size: ${S.textSize}px; fill: #64748b }`,
  `    .label { font-size: ${S.labelSize}px; font-weight: 600 }`,
  `    .note { font-size: ${S.textSize}px; fill: #64748b }`,
  `    .body { font-size: ${S.textSize}px; fill: #334155 }`,
  `    .edge { font-size: ${S.textSize}px; fill: #475569 }`,
  "    .strong { font-weight: 700 }",
  "    .good { fill: #15803d }",
  "    .bad { fill: #b91c1c }",
  "    .box { stroke-width: 1.5 }",
  "    .core { fill: #f1f5f9; stroke: #475569 }",
  "    .input { fill: #eff6ff; stroke: #2563eb }",
  "    .output { fill: #f0fdf4; stroke: #16a34a }",
  "    .outside { fill: #fefce8; stroke: #ca8a04; stroke-dasharray: 5 4 }",
  "    .flow { stroke: #475569; stroke-width: 2 }",
  "    .link { fill: none; stroke-width: 1.6 }",
  "    .back { stroke: #94a3b8 }",
  "    .tip { fill: #475569 }",
  "    .tipBack { fill: #94a3b8 }",
  "    @media (prefers-color-scheme: dark) {",
  "      .bg { fill: #0b1220 }",
  "      text { fill: #e2e8f0 }",
  "      .caption, .note { fill: #94a3b8 }",
  "      .body { fill: #cbd5e1 }",
  "      .edge { fill: #cbd5e1 }",
  "      .good { fill: #4ade80 }",
  "      .bad { fill: #f87171 }",
  "      .core { fill: #172033; stroke: #94a3b8 }",
  "      .input { fill: #172554; stroke: #60a5fa }",
  "      .output { fill: #052e16; stroke: #4ade80 }",
  "      .outside { fill: #2a2410; stroke: #facc15 }",
  "      .flow { stroke: #cbd5e1 }",
  "      .back { stroke: #64748b }",
  "      .tip { fill: #cbd5e1 }",
  "      .tipBack { fill: #64748b }",
  "    }",
];

/**
 * 注記に収まる形に、語を詰めて行に割る。
 *
 * 定義から作る図（[appDiagram]）は、内訳の長さが定義次第なので**溢れないように割る**必要が
 * ある。手で書く図は溢れたら落ちてよい（人が直せる）が、機械が作る図で落ちるのは道具の側の
 * 責任なので、ここで面倒を見る。
 */
export function packNote(
  prefix: string,
  parts: string[],
  separator = " / ",
): string[] {
  const room = S.width - S.pad * 2;
  const lines: string[] = [];
  let line = prefix;
  for (const part of parts) {
    const candidate = line === "" ? part : `${line}${line === prefix ? "" : separator}${part}`;
    const joined = line === prefix ? `${prefix}${part}` : candidate;
    if (em(joined) * S.textSize <= room || line === prefix) {
      line = joined;
      continue;
    }
    lines.push(line);
    line = part;
  }
  if (line !== "") lines.push(line);
  return lines;
}

/**
 * 元データ（JSON）を図として読む。`$comment` のような余分なキーは無視する。
 *
 * 図の元データか定義かは呼ぶ側が見分ける（`rows` があれば図）。
 */
export function parseDiagram(value: unknown): Diagram {
  if (typeof value !== "object" || value === null) {
    throw new Error("図の元データとして読めません。");
  }
  const raw = value as Record<string, unknown>;
  if (typeof raw.title !== "string" || !Array.isArray(raw.rows)) {
    throw new Error("図の元データには title と rows が要ります。");
  }
  return {
    title: raw.title,
    ...(typeof raw.subtitle === "string" ? { subtitle: raw.subtitle } : {}),
    rows: raw.rows as DiagramRow[],
  };
}

/** それが図の元データか（定義ではないか）。 */
export const looksLikeDiagram = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  Array.isArray((value as Record<string, unknown>).rows);
