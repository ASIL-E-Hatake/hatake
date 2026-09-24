import 'package:equatable/equatable.dart';

import 'repository.dart';

/// **1件を指す値**が2つ以上の項目で決まるときの、その組。
///
/// 明細（受注番号＋行番号）や履歴（社員番号＋適用日）のように、1つの列では1件に
/// ならない表は業務では普通に出てきます。0.9.6 までは持っていなかったので、
/// 「連結した列をビューに1つ作る」で逃げてもらっていました。
///
/// **値で比べられること**がこの型の要点です。鍵は画面の中で
/// 「選んだ行の集まり」（`Set`）として持ち回っているので、素の `Map` を使うと
/// **同じ行を2回選べてしまい、一括処理が数え違えます**（`Map` は同じ中身でも
/// 別物として扱われるため）。
///
/// 項目の並びは**定義に書いた順**を保ちます。URL の道に並べる順がこれで決まるので、
/// 並びが変わると別の1件を指してしまいます。
class RecordKey extends Equatable {
  /// 項目名 → 値（定義に書いた順）。
  final Map<String, Object?> parts;

  const RecordKey(this.parts);

  /// 定義に書いた順の値だけ（URL の道に並べる順）。
  List<Object?> get values => parts.values.toList(growable: false);

  /// 定義に書いた順の項目名だけ。
  List<String> get fields => parts.keys.toList(growable: false);

  /// 人に見せる字（記録や覚え書き用）。**URL には使いません**
  /// （道に並べるのは [values] を1つずつ逃がしたもの）。
  @override
  String toString() =>
      parts.entries.map((one) => '${one.key}=${one.value}').join(', ');

  // 並びまで含めて比べる（項目名と値を交互に並べる）。同じ値でも順番が違えば
  // 別の鍵＝URL の道が変わるので、等しいと言ってはいけない。
  @override
  List<Object?> get props => [
        for (final one in parts.entries) ...[one.key, one.value],
      ];
}

/// 行から**1件を指す値**を作る。
///
/// 返すものは定義しだいで変わります:
///
///   ・`key: orderNo`            → `'SO-1'`（**素の値**。いままでと同じ）
///   ・`key: [orderNo, lineNo]`  → [RecordKey]
///
/// 単一のときに素の値のままにしてあるのは、**すでに動いている Repository を
/// 1行も直さずに済ませる**ためです。複合キーを使うと決めた人だけが新しい型を見ます。
///
/// 値が1つでも欠けていれば **null**（その行は指せない）。欠けたまま組み立てると、
/// 別の行に当たる鍵を作ってしまいます。
Object? recordKeyOf(List<String> keyFields, DataRecord row) {
  if (keyFields.isEmpty) return null;
  if (keyFields.length == 1) return row[keyFields.first];
  final parts = <String, Object?>{};
  for (final field in keyFields) {
    final value = row[field];
    if (value == null) return null;
    parts[field] = value;
  }
  return RecordKey(parts);
}

/// 鍵を**画面の引数**にほどく（`params` に入れる形）。
///
/// 単一なら `{<項目名>: 値}`、複合なら項目ごとに1つずつ。行き先の画面は
/// 0.9.3 から**自分の `key` の名前**で受け取るので、名前をそのまま渡せば届きます。
Map<String, Object?> recordKeyParams(List<String> keyFields, Object? key) {
  if (keyFields.isEmpty || key == null) return const {};
  if (key is RecordKey) return Map<String, Object?>.from(key.parts);
  return {keyFields.first: key};
}

/// 画面の引数から鍵を組み立てる（[recordKeyParams] の逆）。
///
/// 1つでも足りなければ null＝**取りに行かない**。足りないまま取りに行くと、
/// 別の1件が開きます。
Object? recordKeyFromParams(
  List<String> keyFields,
  Map<String, Object?> params,
) {
  if (keyFields.isEmpty) return null;
  if (keyFields.length == 1) {
    // `id` は `key` を書かなかった画面の既定なので、昔の書き方も受ける。
    return params[keyFields.first] ?? params['id'];
  }
  final parts = <String, Object?>{};
  for (final field in keyFields) {
    final value = params[field];
    if (value == null) return null;
    parts[field] = value;
  }
  return RecordKey(parts);
}
