// 計算項目（`computed`）を、レコードから導出する。
//
// モードは2つ。
//
//   `{ op: product, fields: [qty, price] }`     同じレコードの項目を畳む
//   `{ op: sum, field: lines, of: amount }`     **明細（subTable）の行**を畳む
//
// 行を畳む側は `where` で**畳む前に行を絞れる**（条件の言葉は visibleWhen と同じもの
// ＝条件の書き方を2つ持たない。判定するのは行1件）。`join` だけは数ではなく文字を作る
// （行を並べて1行にする）ので、集約からは借りずにここで実装する。
//
// 行を畳む側は、集約の語彙（`count` / `sum` / `avg` / `min` / `max`）と実装を
// [builtinAggregates] からそのまま借りる＝**同じ集約を2つ持たない**（ダッシュボードの
// カードと `compare` の検証と、同じ数が出る）。
//
// `field` を使う側の前提は、行が**親のレコードと一緒に来ている**こと。`source` を持つ
// subTable はページ送りで別に持つので、ここには行が無い（`hatake validate` が言う）。
//
// 他レジストリと同じく「開いた文字列キー + 差し替え可能」。Dart / TS / Java
// の3版で同じ結果になるよう実装をそろえること（conformance のため）。

import 'aggregate.dart';

/// 1つの計算項目の実装。[computed] の設定と [record] から値を導出する。
typedef ComputedFn = Object? Function(
  Map<String, Object?> computed,
  Map<String, Object?> record,
);

num? _toNum(Object? v) {
  if (v is bool) return null;
  if (v is num) return v;
  if (v is String) return num.tryParse(v.trim());
  return null;
}

String _str(Object? v) => v == null ? '' : v.toString();

List<String> _fields(Map<String, Object?> c) => [
      for (final f in (c['fields'] as List? ?? const [])) f.toString(),
    ];

/// 行を畳むモードか（`field` に subTable の項目名が書いてある）。
bool _foldsRows(Map<String, Object?> c) {
  final field = c['field'];
  return field is String && field.isNotEmpty;
}

/// `field` が指す明細の行。`where` があれば、**畳む前に**絞る。
///
/// 条件は行1件に対して評価する（`{ mode: create }` は行では分からないので渡さない）。
List<Map<String, Object?>> _rows(
  Map<String, Object?> c,
  Map<String, Object?> record,
) {
  final raw = record[c['field'].toString()];
  final rows = <Map<String, Object?>>[
    if (raw is List)
      for (final row in raw)
        if (row is Map) {for (final e in row.entries) '${e.key}': e.value},
  ];
  return rowsMatching(rows, c['where']);
}

/// `field` が指す明細の行を、[op] の集約で畳む。
///
/// 畳めないとき（行が無い・集約が知らない名前）は **null**。0 を返さないのは、
/// 「行が無い」と「合計が 0」を画面で見分けられなくなるため。
num? _fold(String op, Map<String, Object?> c, Map<String, Object?> record) {
  final aggregate = builtinAggregates[op];
  if (aggregate == null) return null;
  final of = c['of'];
  return aggregate(_rows(c, record), of is String ? of : null);
}

/// 組込み計算オペレーション。名前は各言語版で共通。
final Map<String, ComputedFn> builtinComputeds = {
  // 連結: fields を separator（既定 ''）でつなぐ。
  'concat': (c, r) {
    final sep = c['separator']?.toString() ?? '';
    return _fields(c).map((f) => _str(r[f])).join(sep);
  },
  // 合計。`field` があれば**明細の行**を畳み、無ければ fields の数値和
  // （非数値/欠損は 0）。sum だけが両方のモードを持つのは、「小計＝明細の金額」も
  // 「合計＝小計＋税」も足し算で、op の名前を分けると読む人が迷うため。
  'sum': (c, r) {
    if (_foldsRows(c)) return _fold('sum', c, r);
    num total = 0;
    for (final f in _fields(c)) {
      total += _toNum(r[f]) ?? 0;
    }
    return total;
  },
  // 差: fields[0] - 残りの合計。
  'subtract': (c, r) {
    final fields = _fields(c);
    if (fields.isEmpty) return 0;
    num total = _toNum(r[fields.first]) ?? 0;
    for (final f in fields.skip(1)) {
      total -= _toNum(r[f]) ?? 0;
    }
    return total;
  },
  // 積: fields の数値積（非数値/欠損は 1）。
  'product': (c, r) {
    num total = 1;
    for (final f in _fields(c)) {
      total *= _toNum(r[f]) ?? 1;
    }
    return total;
  },
  // 行を畳むだけの op（同じレコードの項目に対しては意味が無いので、`field` が
  // 無ければ null）。名前と結果は集約の語彙そのまま。
  'count': (c, r) => _foldsRows(c) ? _fold('count', c, r) : null,
  'avg': (c, r) => _foldsRows(c) ? _fold('avg', c, r) : null,
  'min': (c, r) => _foldsRows(c) ? _fold('min', c, r) : null,
  'max': (c, r) => _foldsRows(c) ? _fold('max', c, r) : null,
  // 行を**並べて1行にする**。数ではなく文字が出るので、集約（数を1つにする）とは
  // 別物＝実装もここにある。区切りの既定は ', '（concat の既定が空なのは姓と名を
  // 詰めるためで、行を並べるときに詰めると読めない）。空の値は飛ばす。
  'join': (c, r) {
    if (!_foldsRows(c)) return null;
    final of = c['of'];
    if (of is! String) return null;
    final sep = c['separator']?.toString() ?? ', ';
    return [
      for (final row in _rows(c, r))
        if (_str(row[of]).isNotEmpty) _str(row[of]),
    ].join(sep);
  },
};

/// 計算オペレーションを名前で解決する。[register] で拡張可能。
class ComputedRegistry {
  final Map<String, ComputedFn> _ops;

  /// アプリが足した計算の名前だけ（組み込みは除く）。
  List<String> get customKeys => [
        for (final key in _ops.keys)
          if (!builtinComputeds.containsKey(key)) key,
      ]..sort();

  ComputedRegistry([Map<String, ComputedFn>? custom])
      : _ops = {...builtinComputeds, if (custom != null) ...custom};

  /// [computed] を [record] から計算する。`op` が未登録なら null。
  Object? compute(
    Map<String, Object?>? computed,
    Map<String, Object?> record,
  ) {
    if (computed == null) return null;
    final op = computed['op'] as String?;
    if (op == null) return null;
    return _ops[op]?.call(computed, record);
  }

  void register(String op, ComputedFn fn) => _ops[op] = fn;

  bool has(String op) => _ops.containsKey(op);
}
