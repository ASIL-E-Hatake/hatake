// **値を1つの文字にする、唯一の場所。**
//
// ここが1本であることに意味があります。前は同じ4行が6か所に写し取られていました:
//
//   一覧(crud) / 検索(search) / 数字の画面(dashboard) / 帳票(report) /
//   紙(print) / 明細(subTable ×2) / 詳細(detail)
//
// 0.9.2 で「コードではなく名前を出す」を足したとき、直せたのは**そのうち3か所だけ**で、
// 詳細画面と明細は `shipped` や `[{orderNo: …}]` を出したままでした。しかも3版の単体
// 試験は全部緑のまま＝**写し取りは試験では見つからない**。だから写し取りをやめます。
//
// 見せ方の順番は1つだけ決めてあります:
//
//   1. `format` が書いてあれば、それに従う（人が明示したものが最優先）
//   2. 選択肢に在る値なら、その**名前**（`shipped` → 出荷済）
//   3. どちらでもなければ、値をそのまま
//
// 2 を 1 より後ろに置いているのは、`format` は人が書いたもので、選択肢は
// 「たまたま同じ項目名が在った」で当たることがあるからです。

import '../definition/displayed.dart';
import '../definition/options_owner.dart';
import '../format/formatter_registry.dart';
import 'option_labels.dart';

/// [at] の [value] を、画面に出す1つの文字にする。
///
/// [owners] はその画面に書いてある選択肢（[optionOwnersOf] で1度だけ集めたもの）。
/// 選択肢を引く必要が無い所（明細のように画面の選択肢と関係しない所）は空で呼ぶ。
String cellText(
  FormatterRegistry formatters,
  List<OptionsOwner> owners,
  Displayed at,
  Object? value,
) {
  final format = at.format;
  if (format != null) return formatters.format(format, value, at.config);
  return optionLabelIn(owners, at.field, value) ?? textOf(value);
}

/// 見せ方も選択肢も無いときの、素の文字。
///
/// **並びと入れ子はここで空にします。** `List` や `Map` を `toString()` すると
/// `[{orderNo: SO2026070001, lineNo: 1}]` のような、人に見せてはいけない字が出ます
/// （詳細画面の明細で実際に出ました）。中身を持つものは表として描くのが正しく、
/// 1つの升に押し込める相手ではないので、ここでは**何も出さない**。
String textOf(Object? value) {
  if (value == null) return '';
  if (value is Iterable || value is Map) return '';
  return value.toString();
}
