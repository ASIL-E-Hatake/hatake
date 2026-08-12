// 選択肢の連動（カスケード）。親項目の値で子項目の選択肢を絞る。
//
// 都道府県 → 市区町村、大分類 → 中分類。業務システムでは定番だが、これまでは
// 「子を選択肢ごとに項目として並べて visibleWhen で出し分ける」しかなかった。
//
// ここにあるのは**定義に書いた静的な絞り込み**だけ。選択肢が DB にあるものは
// `FieldDefinition.optionsSource`（Repository から引く）の担当で、それは I/O なので
// Renderer 側にある。
//
// Dart / TypeScript の2版で同じ結果になるよう実装をそろえること（conformance）。

import '../definition/field_definition.dart';
import '../definition/option_item.dart';
import 'condition_evaluator.dart';

/// [field] がいま出すべき選択肢。
///
/// `optionsFrom` が無ければ全部。あれば、`when` が親項目の現在値と同じものだけ
/// （`when` を書いていない選択肢は常に出る＝「未選択」や「その他」に使える）。
/// 親が未入力なら、`when` を持つ選択肢は出ない（親を選ぶまで子は空）。
List<OptionItem> visibleOptions(
  FieldDefinition field,
  Map<String, Object?> record,
) {
  final parent = field.optionsFrom;
  if (parent == null) return field.options;
  final parentValue = record[parent];
  return [
    for (final option in field.options)
      if (option.when == null ||
          (parentValue != null && looseEquals(option.when, parentValue)))
        option,
  ];
}

/// 親が変わって子の値が選べないものになったか。
///
/// 変わったまま持っていると「大阪府なのに渋谷区」で保存できてしまうので、
/// 呼び出し側（フォーム）は true のときに子の値を捨てる。
bool optionValueIsStale(
  FieldDefinition field,
  Map<String, Object?> record,
) {
  if (field.optionsFrom == null) return false;
  final current = record[field.field];
  if (current == null || (current is String && current.isEmpty)) return false;
  return !visibleOptions(field, record)
      .any((option) => looseEquals(option.value, current));
}
