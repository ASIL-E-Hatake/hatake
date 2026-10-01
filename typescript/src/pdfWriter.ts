// PrintLayout → PDF のバイト列。Dart 版（`hatake_print` の `writePdf`）の転記。
//
// 0.9.24 までは「PDF を作るのは Dart 版だけ（1つでよい）」としていた。ブラウザ版
// （Vue / React）が帳票を刷れるようにするには、ブラウザの中でバイト列を作るしか
// ない（Dart をブラウザに持ち込めない）ので、2つ目を置いた。**2つあっても中身は1つ**、
// を機械で言うために、Dart の見本（`hatake_print/test/golden/sales_report.pdf`）と
// 同じ材料で作って**1バイト違わない**ことを試験が見ている。直すときは両方を直す。
//
// 決めごとは Dart 版と同じ:
//   ・同じ入力なら同じバイト列（日付・乱数を入れない）
//   ・依存ゼロ・`node:` を使わない（ブラウザで動く）
//   ・圧縮しない（中身が読める＝差分が読める）
//
// 座標: PrintLayout は左上原点・y 下向き、PDF は左下原点・y 上向き。反転は
// [pdfY] の1箇所だけ。

import { PdfFonts, type PdfFont } from "./pdfFont.js";
import type { PrintLayout, PrintPage, PrintText } from "./printLayout.js";
import { PrintAligns } from "./printLayout.js";
import { runsOf, textWidth } from "./printMetrics.js";

/**
 * [layout] を PDF にする。
 *
 * 紙が0枚の [layout]（行が1件も無かった帳票）は投げる。**0枚の PDF は PDF ではない**
 * ので、行が無いときどうするか（刷らない・報せる）は呼ぶ側に残す。
 */
export function writePdf(layout: PrintLayout, options: { font?: PdfFont } = {}): Uint8Array {
  const font = options.font ?? PdfFonts.gothic;
  if (layout.pages.length === 0) {
    throw new Error("紙が0枚です（行が無いときに刷るかどうかは、呼ぶ側で決めてください）");
  }
  const objects: string[] = [];
  /** 1始まりの参照番号を返す。 */
  const add = (body: string): number => {
    objects.push(body);
    return objects.length;
  };

  // 1: カタログ、2: ページの親（MediaBox と Resources は継承させる）。
  add("<< /Type /Catalog /Pages 2 0 R >>");
  const pagesIndex = add("");
  const fontRef = addFont(add, font);

  const kids: number[] = [];
  for (const page of layout.pages) {
    const stream = content(page, layout, font);
    const contentRef = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent 2 0 R /Contents ${contentRef} 0 R >>`));
  }

  const paper = layout.paper;
  objects[pagesIndex - 1] =
    "<< /Type /Pages " +
    `/Kids [${kids.map((ref) => `${ref} 0 R`).join(" ")}] ` +
    `/Count ${kids.length} ` +
    `/MediaBox [0 0 ${num(paper.width)} ${num(paper.height)}] ` +
    `/Resources << /Font << /F1 ${fontRef} 0 R >> >> >>`;

  const infoRef = add(
    "<< /Producer (hatake_print)" +
      `${layout.title === "" ? "" : ` /Title ${utf16Text(layout.title)}`} >>`,
  );
  return serialize(objects, infoRef);
}

/** フォントの object を足して、`/F1` が指す番号を返す。 */
function addFont(add: (body: string) => number, font: PdfFont): number {
  if (!font.cid) {
    return add(
      `<< /Type /Font /Subtype /Type1 /BaseFont /${font.baseFont} ` +
        `/Encoding /${font.encoding} >>`,
    );
  }
  // CID フォントは Type0（合成フォント）＋ 子フォント ＋ 記述子の3つ組。
  const descriptor = add(
    `<< /Type /FontDescriptor /FontName /${font.baseFont} ` +
      "/Flags 4 /FontBBox [-100 -300 1100 900] /ItalicAngle 0 " +
      "/Ascent 880 /Descent -120 /CapHeight 700 /StemV 80 >>",
  );
  // 字送り: 既定は全角（1000）。英数の CID だけ半角（500）＝[emWidth] と同じ約束。
  const child = add(
    "<< /Type /Font /Subtype /CIDFontType0 " +
      `/BaseFont /${font.baseFont} ` +
      `/CIDSystemInfo << /Registry (${font.registry}) ` +
      `/Ordering (${font.ordering}) /Supplement ${font.supplement} >> ` +
      `/FontDescriptor ${descriptor} 0 R /DW 1000 /W [1 94 500 231 632 500] >>`,
  );
  return add(
    `<< /Type /Font /Subtype /Type0 /BaseFont /${font.baseFont} ` +
      `/Encoding /${font.encoding} /DescendantFonts [${child} 0 R] >>`,
  );
}

/** 紙1枚の内容（描画命令）。 */
function content(page: PrintPage, layout: PrintLayout, font: PdfFont): string {
  const lines: string[] = [];
  for (const item of page.items) {
    if (item.kind === "rule") {
      if (item.width <= 0 || item.thickness <= 0) continue;
      // 罫線は「細い長方形の塗り」（線幅の丸めで細い線が消えるのを避ける）。
      const y = pdfY(layout, item.y) - item.thickness;
      lines.push(`${num(item.x)} ${num(y)} ${num(item.width)} ${num(item.thickness)} re f`);
      continue;
    }
    if (item.text === "" || item.size <= 0) continue;
    const x = alignedLeft(item);
    const y = pdfY(layout, item.y);
    lines.push("q BT");
    // 標準の日本語フォントに太字は無い。縁取って（描画モード2）太らせる。
    if (item.bold) lines.push(`2 Tr ${num(item.size * 0.035)} w`);
    lines.push(`/F1 ${num(item.size)} Tf`);
    for (const run of runsOf(item.text)) {
      const body = font.cid ? utf16(run.text) : literal(run.text);
      lines.push(`1 0 0 1 ${num(x + run.em * item.size)} ${num(y)} Tm`);
      lines.push(`${body} Tj`);
    }
    lines.push("ET Q");
  }
  // Dart 版は1行ずつ改行を付けて、最後に末尾の空白を落としている。
  return lines.join("\n").trimEnd();
}

/** 寄せを解いた左端。 */
function alignedLeft(text: PrintText): number {
  const width = textWidth(text.text, text.size);
  if (text.align === PrintAligns.right) return text.x + text.width - width;
  if (text.align === PrintAligns.center) return text.x + (text.width - width) / 2;
  return text.x;
}

/** 左上原点（人が読む向き）→ 左下原点（PDF）。 */
const pdfY = (layout: PrintLayout, y: number): number => layout.paper.height - y;

/** object を並べて、相互参照表と trailer を付ける。 */
function serialize(objects: readonly string[], infoRef: number): Uint8Array {
  const chunks: number[] = [];
  /** 中身は全部 ASCII（日本語は16進で書いてある）。標準14フォントの字だけ 0xFF まで。 */
  const latin1 = (text: string): void => {
    for (let i = 0; i < text.length; i++) chunks.push(text.charCodeAt(i) & 0xff);
  };

  latin1("%PDF-1.7\n");
  // バイナリを含む印（転送でこの4バイトが壊れないことを見張る道具もある）。
  chunks.push(0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a);

  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(chunks.length);
    latin1(`${i + 1} 0 obj\n${body}\nendobj\n`);
  });

  const xref = chunks.length;
  latin1(`xref\n0 ${objects.length + 1}\n`);
  latin1("0000000000 65535 f \n");
  for (const offset of offsets) latin1(`${String(offset).padStart(10, "0")} 00000 n \n`);
  latin1(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoRef} 0 R >>\n`);
  latin1(`startxref\n${xref}\n%%EOF\n`);
  return Uint8Array.from(chunks);
}

/** 数を PDF に書く形（小数2桁まで・無駄な 0 は落とす。-0 は 0）。 */
function num(value: number): string {
  const fixed = (value === 0 ? 0 : value).toFixed(2);
  if (!fixed.includes(".")) return fixed;
  return fixed.replace(/\.?0+$/, "");
}

/** UTF-16BE の16進文字列（`UniJIS-UCS2-H` はこれで読む）。BMP の外は「〓」にする。 */
function utf16(text: string): string {
  let hex = "";
  for (const char of text) {
    const rune = char.codePointAt(0) ?? 0;
    const code = rune > 0xffff ? 0x3013 : rune;
    hex += code.toString(16).padStart(4, "0").toUpperCase();
  }
  return `<${hex}>`;
}

/** 情報辞書に書く文字列（UTF-16BE の印 FEFF を頭に付ける決まり）。 */
const utf16Text = (text: string): string => `<FEFF${utf16(text).slice(1)}`;

/** 標準14フォント用の文字列（英数のみ。日本語は `?`）。 */
function literal(text: string): string {
  let out = "(";
  for (const char of text) {
    const rune = char.codePointAt(0) ?? 0;
    if (rune > 0xff) {
      out += "?";
      continue;
    }
    if (char === "(" || char === ")" || char === "\\") out += "\\";
    out += char;
  }
  return `${out})`;
}
