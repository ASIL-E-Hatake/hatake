// 宣言的な条件（`visibleWhen` / `enabledWhen`）を、レコードに対して評価する。
//
// 条件は構造化マップ（`config` と同じく開いた形）で表す:
// - リーフ: `{ field, operator, value }`
// - リーフ: `{ mode: create }` / `{ mode: edit }`（フォームの状態を見る）
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

/// 値が「同じ」か。数値として読めれば数値で、それ以外は文字列で比べる
/// （`'1'` と `1` は同じ）。条件式と選択肢の絞り込みで同じ判定を使うために公開。
bool looseEquals(Object? a, Object? b) => _eq(a, b);

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

bool _leaf(
  Map<String, Object?> cond,
  Map<String, Object?> record,
  String? mode,
) {
  // `{ mode: create }` は「新規のときだけ」。レコードの中身では分からないので、
  // 呼び出し側（フォーム）から渡してもらう。分からない場所（読み取り専用の詳細
  // 画面など）では false ＝「その状態ではない」。
  final wanted = cond['mode'] as String?;
  if (wanted != null) return mode != null && mode == wanted;
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
///
/// [mode] はフォームの状態（[ConditionModes]）。`{ mode: create }` を判定するために
/// 使う。渡さなければ mode のリーフは false になる（その状態だと言えないので）。
bool evaluateCondition(
  Map<String, Object?>? condition,
  Map<String, Object?> record, {
  String? mode,
}) {
  if (condition == null || condition.isEmpty) return true;
  final all = condition['all'];
  if (all is List) {
    return all.every((c) => evaluateCondition(_asCond(c), record, mode: mode));
  }
  final any = condition['any'];
  if (any is List) {
    return any.any((c) => evaluateCondition(_asCond(c), record, mode: mode));
  }
  final not = condition['not'];
  if (not is Map) {
    return !evaluateCondition(_asCond(not), record, mode: mode);
  }
  return _leaf(condition, record, mode);
}

/// `{ mode: ... }` に書ける値。フォームが新規入力中か、既存レコードの編集中か。
abstract final class ConditionModes {
  const ConditionModes._();

  /// 新規（まだ保存されていない）。
  static const String create = 'create';

  /// 既存レコードの編集。
  static const String edit = 'edit';

  static const Set<String> all = {create, edit};
}

Map<String, Object?>? _asCond(Object? node) =>
    node is Map ? node.cast<String, Object?>() : null;
