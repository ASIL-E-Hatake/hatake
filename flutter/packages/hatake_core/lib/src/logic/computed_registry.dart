// 計算項目（`computed`）を、レコードから導出する。
//
// `computed` は構造化マップ:
// `{ op, fields: [..], separator? }`。`op` は組込み（`concat` / `sum` /
// `subtract` / `product`）またはプラグインで登録したキー。
//
// 他レジストリと同じく「開いた文字列キー + 差し替え可能」。Dart / TS / Java
// の3版で同じ結果になるよう実装をそろえること（conformance のため）。

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

/// 組込み計算オペレーション。名前は各言語版で共通。
final Map<String, ComputedFn> builtinComputeds = {
  // 連結: fields を separator（既定 ''）でつなぐ。
  'concat': (c, r) {
    final sep = c['separator']?.toString() ?? '';
    return _fields(c).map((f) => _str(r[f])).join(sep);
  },
  // 合計: fields の数値和（非数値/欠損は 0）。
  'sum': (c, r) {
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
