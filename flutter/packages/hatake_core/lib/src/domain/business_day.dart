import '../util/dates.dart';

/// 営業日ユーティリティ。土日＋渡された祝日集合を「休み」とみなす。
///
/// 祝日カレンダーは外部データなので**引数で注入**する（ハードコードしない）。
/// [holidays] は `yyyy-MM-dd` 文字列の集合。

bool _isHoliday(DateTime d, Set<String> holidays) =>
    d.weekday == DateTime.saturday ||
    d.weekday == DateTime.sunday ||
    holidays.contains(isoDate(d));

/// 営業日かどうか（土日・祝日でない）。
bool isBusinessDay(Object date, {Set<String> holidays = const {}}) =>
    !_isHoliday(toDate(date), holidays);

/// 翌営業日（[date] より後で最初の営業日）を `yyyy-MM-dd` で返す。
String nextBusinessDay(Object date, {Set<String> holidays = const {}}) {
  var d = toDate(date).add(const Duration(days: 1));
  while (_isHoliday(d, holidays)) {
    d = d.add(const Duration(days: 1));
  }
  return isoDate(d);
}

/// 前営業日（[date] より前で最後の営業日）を `yyyy-MM-dd` で返す。
String prevBusinessDay(Object date, {Set<String> holidays = const {}}) {
  var d = toDate(date).subtract(const Duration(days: 1));
  while (_isHoliday(d, holidays)) {
    d = d.subtract(const Duration(days: 1));
  }
  return isoDate(d);
}
