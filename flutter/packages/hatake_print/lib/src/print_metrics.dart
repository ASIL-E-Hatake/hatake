// 文字の幅を数える（右寄せ・中央寄せ・列からの溢れに要る）。
//
// 数え方は **PDF に書き込む字送り（`/W` と `/DW`）と同じ規則**にしてある。
// ここが食い違うと、右寄せした金額の右端がずれる・隣の文字に重なる。
//
//   ・半角（0.5em） … ASCII の印字できる文字と、半角形（半角カナなど）
//   ・全角（1.0em） … それ以外の全部
//
// **Unicode の East Asian Width とは違う。** 円記号 `¥`（U+00A5）・`§`・`±`・丸数字
// `①`・`℃` は「半角の文字」に見えるが、日本語フォントでは全角で組まれる。実際に
// PDF ビューアで刷って確かめた結果に合わせてある（`¥1,000` の `¥` を半角と数えると、
// 次の数字に重なる）。

/// 半角（字送り 0.5em）か。
bool isHalfWidth(int rune) {
  return (rune >= 0x20 && rune <= 0x7E) || // ASCII の印字できる文字
      (rune >= 0xFF61 && rune <= 0xFFDC) || // 半角カナ・半角ハングル
      (rune >= 0xFFE8 && rune <= 0xFFEE); // 半角の罫線・矢印
}

/// [text] の幅を em で数える。
double emWidth(String text) {
  var em = 0.0;
  for (final rune in text.runes) {
    em += isHalfWidth(rune) ? 0.5 : 1.0;
  }
  return em;
}

/// 漢字・かな（1.0em で確かなもの）か。
///
/// [isHalfWidth] と合わせて「字送りが確かな文字」になる。この2つの外側
/// （`¥` `§` `①` `℃` など）は、**ビューアが実際に使う字送りが読めない**
/// （埋め込んでいないので、当てられた書体の都合で決まる）。
bool isCjk(int rune) {
  return (rune >= 0x1100 && rune <= 0x115F) || // ハングル字母
      (rune >= 0x2E80 && rune <= 0x303E) || // CJK 部首・全角の約物
      (rune >= 0x3041 && rune <= 0x33FF) || // かな・注音・囲み文字
      (rune >= 0x3400 && rune <= 0x4DBF) || // CJK 拡張A
      (rune >= 0x4E00 && rune <= 0x9FFF) || // CJK 統合漢字
      (rune >= 0xA000 && rune <= 0xA4CF) || // イ文字
      (rune >= 0xAC00 && rune <= 0xD7A3) || // ハングル音節
      (rune >= 0xF900 && rune <= 0xFAFF) || // CJK 互換漢字
      (rune >= 0xFE30 && rune <= 0xFE6F) || // CJK 互換形
      (rune >= 0xFF01 && rune <= 0xFF60) || // 全角英数・記号
      (rune >= 0x20000 && rune <= 0x3FFFD); // CJK 拡張B以降
}

/// まとめて書ける塊と、その左端（em）。
typedef PrintRun = ({double em, String text});

/// [text] を「字送りをビューアに任せられる塊」に切る。
///
/// 塊の中はビューアが文字を送る（`(SO-1001)` のように1回で書ける）。字送りが
/// 読めない文字は**1文字だけの塊**にして、次の文字を自分で置き直す＝ビューアが
/// どんな幅を使っても、そこから後ろがずれない。
///
/// 円記号ひとつのために要る仕掛け。`¥1,250,000` を1塊で書くと、ビューアによっては
/// `¥` の次の桁が円記号に重なる（当てられた書体の字送りが、こちらの見積もりと
/// 違うため）。
List<PrintRun> runsOf(String text) {
  final runs = <PrintRun>[];
  final buffer = StringBuffer();
  var em = 0.0;
  var start = 0.0;

  void flush() {
    if (buffer.isEmpty) return;
    runs.add((em: start, text: buffer.toString()));
    buffer.clear();
  }

  for (final rune in text.runes) {
    final half = isHalfWidth(rune);
    if (half || isCjk(rune)) {
      if (buffer.isEmpty) start = em;
      buffer.writeCharCode(rune);
      em += half ? 0.5 : 1.0;
      continue;
    }
    flush();
    runs.add((em: em, text: String.fromCharCode(rune)));
    em += 1.0;
    start = em;
  }
  flush();
  return runs;
}

/// [text] を [fontSize] で組んだときの幅（ポイント）。
double textWidth(String text, double fontSize) => emWidth(text) * fontSize;

/// [width] に収まるところまで切って、切ったら末尾を `…` にする。
///
/// 紙には横スクロールが無い。列から溢れた文字は**隣の列に重なる**ので、
/// あふれるより切る。
String clipToWidth(String text, double fontSize, double width) {
  if (fontSize <= 0 || width <= 0) return '';
  if (textWidth(text, fontSize) <= width) return text;
  const ellipsis = '…';
  final room = width - textWidth(ellipsis, fontSize);
  if (room <= 0) return ellipsis;
  final kept = <int>[];
  var em = 0.0;
  for (final rune in text.runes) {
    final next = em + (isHalfWidth(rune) ? 0.5 : 1.0);
    if (next * fontSize > room) break;
    kept.add(rune);
    em = next;
  }
  return '${String.fromCharCodes(kept)}$ellipsis';
}
