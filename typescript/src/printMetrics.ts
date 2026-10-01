// 文字の幅を数える（紙の上の寄せと、列からの溢れに要る）。
//
// 刷るのは Dart 版（`hatake_print`）と、ブラウザ版の [writePdf]（0.9.25）。こちらは同じ紙を
// **読ませる**（`hatake paper` / MCP の `hatake_print_preview`）のにも使う。数え方が違えば
// 「AI が見た紙」と「刷った紙」が別物になるので、規則は Dart 版の転記＝共有フィクスチャと
// PDF の見本（1バイト一致）で縛る。
//
//   ・半角（0.5em） … ASCII の印字できる文字と、半角形（半角カナなど）
//   ・全角（1.0em） … それ以外の全部
//
// **Unicode の East Asian Width とは違う。** 円記号 `¥`・`§`・丸数字 `①`・`℃` は
// 「半角の文字」に見えるが、日本語フォントでは全角で組まれる（実機で確かめた結果）。

/** 半角（字送り 0.5em）か。 */
export function isHalfWidth(code: number): boolean {
  return (
    (code >= 0x20 && code <= 0x7e) || // ASCII の印字できる文字
    (code >= 0xff61 && code <= 0xffdc) || // 半角カナ・半角ハングル
    (code >= 0xffe8 && code <= 0xffee) // 半角の罫線・矢印
  );
}

/** 文字列の幅を em で数える。 */
export function emWidth(text: string): number {
  let em = 0;
  for (const char of text) {
    em += isHalfWidth(char.codePointAt(0) ?? 0) ? 0.5 : 1;
  }
  return em;
}

/** [text] を [fontSize] で組んだときの幅（ポイント）。 */
export const textWidth = (text: string, fontSize: number): number =>
  emWidth(text) * fontSize;

/**
 * [width] に収まるところまで切って、切ったら末尾を `…` にする。
 *
 * 紙には横スクロールが無い。列から溢れた文字は**隣の列に重なる**ので、あふれるより切る。
 */
export function clipToWidth(
  text: string,
  fontSize: number,
  width: number,
): string {
  if (fontSize <= 0 || width <= 0) return "";
  if (textWidth(text, fontSize) <= width) return text;
  const ellipsis = "…";
  const room = width - textWidth(ellipsis, fontSize);
  if (room <= 0) return ellipsis;
  let kept = "";
  let em = 0;
  for (const char of text) {
    const next = em + (isHalfWidth(char.codePointAt(0) ?? 0) ? 0.5 : 1);
    if (next * fontSize > room) break;
    kept += char;
    em = next;
  }
  return `${kept}${ellipsis}`;
}

/** 漢字・かな・ハングル・全角の約物（[runsOf] が塊にしてよい文字）。Dart 版の転記。 */
export function isCjk(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) || // ハングル字母
    (code >= 0x2e80 && code <= 0x303e) || // CJK 部首・全角の約物
    (code >= 0x3041 && code <= 0x33ff) || // かな・注音・囲み文字
    (code >= 0x3400 && code <= 0x4dbf) || // CJK 拡張A
    (code >= 0x4e00 && code <= 0x9fff) || // CJK 統合漢字
    (code >= 0xa000 && code <= 0xa4cf) || // イ文字
    (code >= 0xac00 && code <= 0xd7a3) || // ハングル音節
    (code >= 0xf900 && code <= 0xfaff) || // CJK 互換漢字
    (code >= 0xfe30 && code <= 0xfe6f) || // CJK 互換形
    (code >= 0xff01 && code <= 0xff60) || // 全角英数・記号
    (code >= 0x20000 && code <= 0x3fffd) // CJK 拡張B以降
  );
}

/** 置く位置（em）つきの文字の塊。 */
export interface PrintRun {
  em: number;
  text: string;
}

/**
 * 文字列を、PDF に**1度に書いてよい塊**に分ける（Dart 版の転記）。
 *
 * 字送りがこちらの見積もりと同じだと言える文字（半角・CJK）は続けて書き、それ以外
 * （円記号など）は1文字ずつ置き直す。`¥1,250,000` を1塊で書くと、ビューアによっては
 * `¥` の次の桁が円記号に重なる。
 */
export function runsOf(text: string): PrintRun[] {
  const runs: PrintRun[] = [];
  let buffer = "";
  let em = 0;
  let start = 0;
  const flush = (): void => {
    if (buffer === "") return;
    runs.push({ em: start, text: buffer });
    buffer = "";
  };
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    const half = isHalfWidth(code);
    if (half || isCjk(code)) {
      if (buffer === "") start = em;
      buffer += char;
      em += half ? 0.5 : 1;
      continue;
    }
    flush();
    runs.push({ em, text: char });
    em += 1;
    start = em;
  }
  flush();
  return runs;
}
