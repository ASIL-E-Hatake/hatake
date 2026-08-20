// 文字の幅を数える（紙の上の寄せと、列からの溢れに要る）。
//
// **刷るのは Dart 版**（`hatake_print`）。こちらは同じ紙を**読ませるため**に組む
// （`hatake paper` / MCP の `hatake_print_preview`）。数え方が違えば「AI が見た紙」と
// 「刷った紙」が別物になるので、規則は Dart 版の転記＝共有フィクスチャで縛る。
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
