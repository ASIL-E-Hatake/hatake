// ダッシュボードの集約（aggregate）。行の集合を1つの数値に畳む。
//
// `metric` の値と、`chart` のラベル別集計に使う。行を出すのは Repository の仕事で、
// ここは「返ってきた行をどう見せるか」だけを担う（＝業務ロジックではない）。
// 集計済みのエンドポイントを使うなら `count` 以外は不要。
//
// 他レジストリと同じく「開いた文字列キー + 差し替え可能」。Dart / TS / Java
// の3版で同じ結果になるよう実装をそろえること（conformance のため）。

import '../definition/aggregate_ops.dart';

/// 1つの集約オペレーションの実装。[rows] を [field] で畳んで数値を返す。
/// 値が定まらないときは null（例: 空の行に対する `avg`）。
typedef AggregateFn = num? Function(
  List<Map<String, Object?>> rows,
  String? field,
);

/// 数値解釈は `ComputedRegistry` と同じ規則（真偽値は数値ではない）。
num? _toNum(Object? v) {
  if (v is bool) return null;
  if (v is num) return v.isFinite ? v : null;
  if (v is String) return num.tryParse(v.trim());
  return null;
}

/// 集約が「数値」とみなす値の解釈。集計済みの行をそのまま点として描くときなど、
/// 呼び出し側が同じ解釈を使えるように公開している。
num? aggregateValue(Object? value) => _toNum(value);

/// [rows] の [field] のうち数値として読めた値だけ。[field] が null なら空。
List<num> _numbers(List<Map<String, Object?>> rows, String? field) {
  if (field == null) return const [];
  final values = <num>[];
  for (final row in rows) {
    final n = _toNum(row[field]);
    if (n != null) values.add(n);
  }
  return values;
}

/// 組込みの集約オペレーション。名前は各言語版で共通。
///
/// `count` 以外は `field` が必須（無ければ null）。
final Map<String, AggregateFn> builtinAggregates = {
  AggregateOps.count: (rows, field) => rows.length,
  AggregateOps.sum: (rows, field) {
    if (field == null) return null;
    num total = 0;
    for (final n in _numbers(rows, field)) {
      total += n;
    }
    return total;
  },
  AggregateOps.avg: (rows, field) {
    if (field == null) return null;
    final values = _numbers(rows, field);
    if (values.isEmpty) return null;
    num total = 0;
    for (final n in values) {
      total += n;
    }
    return total / values.length;
  },
  AggregateOps.min: (rows, field) {
    if (field == null) return null;
    final values = _numbers(rows, field);
    if (values.isEmpty) return null;
    return values.reduce((a, b) => a < b ? a : b);
  },
  AggregateOps.max: (rows, field) {
    if (field == null) return null;
    final values = _numbers(rows, field);
    if (values.isEmpty) return null;
    return values.reduce((a, b) => a > b ? a : b);
  },
};

/// ラベル別集計の1点。チャートの1本／1切れにあたる。
class AggregateBucket {
  final String label;

  /// 集約結果。定まらないときは null。
  final num? value;

  const AggregateBucket(this.label, this.value);

  @override
  String toString() => 'AggregateBucket($label, $value)';
}

/// 集約オペレーションを名前で解決する。[register] で拡張可能。
class AggregateRegistry {
  final Map<String, AggregateFn> _ops;

  /// アプリが足した集約の名前だけ（組み込みは除く）。
  List<String> get customKeys => [
        for (final key in _ops.keys)
          if (!builtinAggregates.containsKey(key)) key,
      ]..sort();

  AggregateRegistry([Map<String, AggregateFn>? custom])
      : _ops = {...builtinAggregates, if (custom != null) ...custom};

  /// [rows] を [op] で畳む。`op` が未登録なら null。
  num? aggregate(String op, List<Map<String, Object?>> rows, {String? field}) {
    return _ops[op]?.call(rows, field);
  }

  /// [labelField] の値ごとに [rows] をまとめ、各グループを [op] で畳む。
  ///
  /// 並びは**ラベルの初出順**（言語をまたいで同じ順序にするため。ソートは
  /// Repository の責務）。ラベルが無い行は空文字のグループにまとまる。
  List<AggregateBucket> aggregateBy(
    String op,
    List<Map<String, Object?>> rows, {
    required String labelField,
    String? valueField,
  }) {
    final groups = <String, List<Map<String, Object?>>>{};
    for (final row in rows) {
      final label = row[labelField]?.toString() ?? '';
      (groups[label] ??= []).add(row);
    }
    return [
      for (final entry in groups.entries)
        AggregateBucket(entry.key, aggregate(op, entry.value, field: valueField)),
    ];
  }

  void register(String op, AggregateFn fn) => _ops[op] = fn;

  bool has(String op) => _ops.containsKey(op);
}
