// 宣言的な条件（`visibleWhen` / `enabledWhen`）を、レコードに対して評価する。
//
// 条件は構造化マップ（`config` と同じく開いた形）で表す:
// - リーフ: `{ field, operator, value }`
// - 結合:   `{ all: [条件...] }`（AND） / `{ any: [条件...] }`（OR） / `{ not: 条件 }`
//
// `operator` は FilterOperators の値（`equals` `notEquals` `gt` `gte` `lt`
// `lte` `contains` `in` `isEmpty` `isNotEmpty`）。未知の演算子は false。
//
// Dart / TypeScript / Java の3版で同じ判定になるよう実装をそろえること
// （conformance のため）。

/// 数値化できれば num、できなければ null（bool は数値扱いしない）。
num? _toNum(Object? v) {
  if (v is bool) return null;
  if (v is num) return v;
  if (v is String) return num.tryParse(v.trim());
  return null;
}

String _str(Object? v) => v == null ? '' : v.toString();

bool _isEmptyValue(Object? v) =>
    v == null ||
    (v is String && v.trim().isEmpty) ||
    (v is Iterable && v.isEmpty);

bool _eq(Object? a, Object? b) {
  final na = _toNum(a), nb = _toNum(b);
  if (na != null && nb != null) return na == nb;
  return _str(a) == _str(b);
}

/// -1 / 0 / 1。両方数値なら数値比較、それ以外は文字列（コード単位）比較。
int _compare(Object? a, Object? b) {
  final na = _toNum(a), nb = _toNum(b);
  if (na != null && nb != null) return na.compareTo(nb);
  return _str(a).compareTo(_str(b));
}

bool _leaf(Map<String, Object?> cond, Map<String, Object?> record) {
  final field = cond['field'] as String?;
  final operator = cond['operator'] as String? ?? 'equals';
  if (field == null) return false;
  final actual = record[field];
  final value = cond['value'];
  switch (operator) {
    case 'equals':
      return _eq(actual, value);
    case 'notEquals':
      return !_eq(actual, value);
    case 'gt':
      return _compare(actual, value) > 0;
    case 'gte':
      return _compare(actual, value) >= 0;
    case 'lt':
      return _compare(actual, value) < 0;
    case 'lte':
      return _compare(actual, value) <= 0;
    case 'contains':
      if (actual is Iterable) return actual.any((e) => _eq(e, value));
      return _str(actual).contains(_str(value));
    case 'in':
      if (value is Iterable) return value.any((e) => _eq(e, actual));
      return false;
    case 'isEmpty':
      return _isEmptyValue(actual);
    case 'isNotEmpty':
      return !_isEmptyValue(actual);
    default:
      return false;
  }
}

/// [condition] を [record] に対して評価する。null/空条件は true（＝常に表示/活性）。
bool evaluateCondition(
  Map<String, Object?>? condition,
  Map<String, Object?> record,
) {
  if (condition == null || condition.isEmpty) return true;
  final all = condition['all'];
  if (all is List) {
    return all.every((c) => evaluateCondition(_asCond(c), record));
  }
  final any = condition['any'];
  if (any is List) {
    return any.any((c) => evaluateCondition(_asCond(c), record));
  }
  final not = condition['not'];
  if (not is Map) {
    return !evaluateCondition(_asCond(not), record);
  }
  return _leaf(condition, record);
}

Map<String, Object?>? _asCond(Object? node) =>
    node is Map ? node.cast<String, Object?>() : null;
