// 紙を**文字にして見せる**。
//
// AI は画面も紙も見られない。定義を読み返す道具（`explain`）は「何ができる画面か」を
// 言うが、**紙の上でどう見えるか**は言わない。列の並び・小計の位置・切れた文字・
// 右寄せが効いているかは、座標を文字に落とせば読める。
//
// やっていることは、`PrintLayout` の座標を**桁に割り当てる**だけ。紙の幅を決まった桁数
// （既定 110 桁）に縮めるので、A4 でも A3 でも横向きでも同じ幅で読める＝AI の文脈にも
// 収まる。画像にはしない（画像は AI にも人にも高い上に、差分が取れない）。
//
// 数は縮めるが**位置関係は保つ**（右寄せの金額は右端に揃い、列の順は変わらない）。
// これは「刷った紙そのもの」ではなく**紙の読み方**なので、そこは割り切る。

import {
  PrintAligns,
  type PrintItem,
  type PrintLayout,
  type PrintPage,
  type PrintText,
} from "./printLayout.js";
import { emWidth } from "./printMetrics.js";

export interface PaperTextOptions {
  /** 紙の幅を何桁で表すか（既定 110）。 */
  columns?: number;
}

/** 紙1本ぶんを文字にする。 */
export function renderPaperText(
  layout: PrintLayout,
  options: PaperTextOptions = {},
): string {
  const columns = Math.max(40, options.columns ?? 110);
  if (layout.pages.length === 0) {
    return "紙は0枚です（行が1件も無い帳票は刷りません）。";
  }
  const charWidth = layout.paper.width / columns;
  const out: string[] = [
    `${layout.title}: ${round(layout.paper.width)} x ${round(layout.paper.height)}pt の紙 ` +
      `${layout.pages.length} 枚（${columns} 桁に縮めて表示。位置関係はそのまま）`,
  ];
  for (const page of layout.pages) {
    out.push("");
    out.push(`--- ${page.number} 枚目 ---`);
    out.push(...pageLines(page, charWidth, columns));
  }
  return out.join("\n");
}

/** 1枚を、上から下へ1行ずつ。 */
function pageLines(page: PrintPage, charWidth: number, columns: number): string[] {
  // y（ベースライン・罫線の位置）でまとめる。同じ y のものは同じ行に並ぶ。
  const rows = new Map<string, PrintItem[]>();
  for (const item of page.items) {
    const key = item.y.toFixed(2);
    const found = rows.get(key);
    if (found === undefined) rows.set(key, [item]);
    else found.push(item);
  }
  const keys = [...rows.keys()].sort((a, b) => Number(a) - Number(b));
  return keys.map((key) => line(rows.get(key) ?? [], charWidth, columns));
}

/** 同じ高さにあるものを1行に置く。 */
function line(items: PrintItem[], charWidth: number, columns: number): string {
  const cells: string[] = [];
  const put = (at: number, text: string): void => {
    // 埋まっている所には重ねない（重ねると、どちらも読めなくなる）。
    let start = Math.max(0, at);
    while (occupied(cells, start, width(text))) start++;
    for (let i = 0; i < text.length; i++) cells[start + i] = i === 0 ? text : "";
    // 全角は2桁ぶん場所を取る（次のものが重ならないように詰める）。
    for (let i = text.length; i < width(text); i++) cells[start + i] ??= "";
  };

  // 罫線が居る行は、罫線だけの行にする（文字と重ねると読めない）。
  const rules = items.filter((item) => item.kind === "rule");
  if (rules.length > 0 && items.length === rules.length) {
    const cellsOf = rules.map((rule) => ({
      from: Math.round(rule.x / charWidth),
      to: Math.round((rule.x + rule.width) / charWidth),
      thick: rule.kind === "rule" ? rule.thickness : 0,
    }));
    const row: string[] = [];
    for (const one of cellsOf) {
      // 太い罫線（列見出しの下）は `=`、細い罫線（グループ・小計・総計）は `-`。
      // 総計の上の二重線は、y が違うので **2行**になって見える。
      const mark = one.thick >= 0.5 ? "=" : "-";
      for (let i = one.from; i < Math.min(one.to, columns); i++) row[i] = mark;
    }
    return fill(row, columns).trimEnd();
  }

  for (const item of items) {
    if (item.kind !== "text" || item.text === "") continue;
    put(startColumn(item, charWidth), item.text);
  }
  return fill(cells, columns).trimEnd();
}

/**
 * 置き始める桁。
 *
 * **枠の端に合わせる**（文字の実寸から数えない）。1桁の幅と文字の実寸は比例しないので、
 * 実寸から数えると右寄せした金額の右端が桁ごとにずれる＝**揃っているかどうかが読めない**。
 * 読ませるのが目的なので、枠に合わせる方を採る。
 */
function startColumn(item: PrintText, charWidth: number): number {
  const cells = width(item.text);
  if (item.align === PrintAligns.right) {
    return Math.round((item.x + item.width) / charWidth) - cells;
  }
  if (item.align === PrintAligns.center) {
    return Math.round((item.x + item.width / 2) / charWidth) - Math.floor(cells / 2);
  }
  return Math.round(item.x / charWidth);
}

/** 表示幅（全角は2桁）。 */
const width = (text: string): number => Math.round(emWidth(text) * 2);

const occupied = (cells: string[], at: number, span: number): boolean => {
  for (let i = at; i < at + span; i++) {
    if (cells[i] !== undefined) return true;
  }
  return false;
};

const fill = (cells: string[], columns: number): string => {
  let out = "";
  for (let i = 0; i < Math.max(cells.length, columns); i++) {
    out += cells[i] ?? " ";
  }
  return out;
};

const round = (value: number): string => value.toFixed(2).replace(/\.?0+$/, "");
