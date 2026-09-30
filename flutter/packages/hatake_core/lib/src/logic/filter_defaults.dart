import '../definition/filter_definition.dart';
import '../definition/filter_operators.dart';
import '../definition/search_definition.dart';

/// 検索欄の既定値（`filter.defaultValue`）を、**その日の値**に解く（0.9.23）。
///
/// 決めるのはここだけで、画面は検索欄の初期値に、一覧は最初の読み込みの条件に、
/// ここが返したものを使う。TypeScript 版は `@hatake-fw/api` の `filterDefaults`。
/// 同じ答えになることは `spec/conformance/filter_defaults.json` が見ている。
///
/// **形の合わない書き方は出さない**（知らない語・範囲の語を範囲でない条件に書いた、
/// など）。変な条件で黙って読むより、既定値が無いほうが安全。
Map<String, Object?> filterDefaults(SearchDefinition? search, DateTime today) {
  final out = <String, Object?>{};
  for (final filter in search?.filters ?? const <FilterDefinition>[]) {
    final value = _resolve(filter, today);
    if (value != _none) out[filter.field] = value;
  }
  return out;
}

/// 「出さない」の印（null は範囲の片側として意味があるので使えない）。
const Object _none = Object();

String _two(int n) => n.toString().padLeft(2, '0');
String _iso(int y, int m, int d) => '$y-${_two(m)}-${_two(d)}';
int _daysIn(int y, int m) => DateTime(y, m + 1, 0).day;

bool _isWord(Object? v) => v is String && v.startsWith(r'$');

/// 1つの値を解く（範囲の語はここでは解けない）。解けなければ [_none]。
Object? _single(Object? value, DateTime today) {
  if (!_isWord(value)) return value;
  final y = today.year;
  final m = today.month;
  switch (value) {
    case r'$today':
      return _iso(y, m, today.day);
    case r'$startOfMonth':
      return _iso(y, m, 1);
    case r'$endOfMonth':
      return _iso(y, m, _daysIn(y, m));
    case r'$startOfYear':
      return _iso(y, 1, 1);
    case r'$endOfYear':
      return _iso(y, 12, 31);
    default:
      return _none;
  }
}

List<String>? _range(String value, DateTime today) {
  final y = today.year;
  final m = today.month;
  if (value == r'$thisMonth') return [_iso(y, m, 1), _iso(y, m, _daysIn(y, m))];
  if (value == r'$thisYear') return [_iso(y, 1, 1), _iso(y, 12, 31)];
  return null;
}

Object? _resolve(FilterDefinition filter, DateTime today) {
  final value = filter.defaultValue;
  if (value == null) return _none;

  if (filter.operator == FilterOperators.between) {
    if (value is String) return _range(value, today) ?? _none;
    if (value is! List || value.length != 2) return _none;
    final pair = <Object?>[];
    for (final one in value) {
      if (one == null) {
        pair.add(null);
        continue;
      }
      final got = _single(one, today);
      if (identical(got, _none)) return _none;
      pair.add(got);
    }
    return pair[0] == null && pair[1] == null ? _none : pair;
  }

  if (value is List) {
    if (filter.operator != FilterOperators.inList) return _none;
    final list = <Object?>[];
    for (final one in value) {
      final got = _single(one, today);
      if (identical(got, _none)) return _none;
      list.add(got);
    }
    return list;
  }

  return _single(value, today);
}
