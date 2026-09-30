// 選択肢の連動（カスケード）。親の値で子の選択肢を絞る。
//
// 都道府県 → 市区町村、大分類 → 中分類。業務システムでは定番だが、これまでは
// 「子を選択肢ごとに項目として並べて visibleWhen で出し分ける」しかなかった。
//
// 入力項目（`form` の中）と検索条件（`search.filters`）の両方で同じ判定を使う。
// 見るのは [OptionsOwner] だけで、入力用・検索用に判定を2つ持たない（必ずズレるので）。
// 「いまの値の集まり」は入力ならレコード、検索なら検索欄に入っている値。
//
// ここにあるのは**定義に書いた静的な絞り込み**だけ。選択肢が DB にあるものは
// `optionsSource`（Repository から引く）の担当で、それは I/O なので Renderer 側にある。
//
// Dart / TypeScript の2版で同じ結果になるよう実装をそろえること（conformance）。

import '../definition/option_item.dart';
import '../definition/options_owner.dart';
import '../definition/options_source.dart';
import 'condition_evaluator.dart';

/// [owner] がいま出すべき選択肢。
///
/// `optionsFrom` が無ければ全部。あれば、`when` が親の現在値と同じものだけ
/// （`when` を書いていない選択肢は常に出る＝「未選択」や「その他」に使える）。
/// 親が未入力なら、`when` を持つ選択肢は出ない（親を選ぶまで子は空）。
List<OptionItem> visibleOptions(
  OptionsOwner owner,
  Map<String, Object?> values,
) {
  final parent = owner.optionsFrom;
  if (parent == null) return owner.options;
  final parentValue = values[parent];
  return [
    for (final option in owner.options)
      if (option.when == null ||
          (parentValue != null && looseEquals(option.when, parentValue)))
        option,
  ];
}

/// 親が変わって子の値が選べないものになったか。
///
/// 変わったまま持っていると「大阪府なのに渋谷区」で保存できてしまうので、
/// 呼び出し側（フォーム / 検索欄）は true のときに子の値を捨てる。
bool optionValueIsStale(
  OptionsOwner owner,
  Map<String, Object?> values,
) {
  if (owner.optionsFrom == null) return false;
  final current = values[owner.field];
  if (current == null || (current is String && current.isEmpty)) return false;
  return !visibleOptions(owner, values)
      .any((option) => looseEquals(option.value, current));
}

/// 選んだ選択肢の元の行 [row] から、`optionsSource.copy` に書いた項目を写す値
/// （このフォームの項目名 → 値）。0.9.23。
///
/// 写すのは**行に在る**項目だけ（無い項目で入れてあった値を消さない）。行が無い
/// （選択を外した）ときは何も写さない。TypeScript 版は `@hatake-fw/api` の
/// `copiedFrom`。同じ答えになることは `spec/conformance/options_copy.json` が見ている。
Map<String, Object?> copiedFrom(OptionsSource source, Map<String, Object?>? row) {
  if (row == null) return const {};
  return {
    for (final entry in source.copy.entries)
      if (row.containsKey(entry.value)) entry.key: row[entry.value],
  };
}
