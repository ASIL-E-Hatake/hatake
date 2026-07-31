import '../util/dates.dart';

/// 会計年度・四半期・半期。開始月 [startMonth]（既定 4 月）で調整する。
///
/// 例（startMonth=4）: 2026-04-01→年度2026・Q1・上期、2026-03-31→年度2025・Q4・下期。

int _monthIndex(int month, int startMonth) => (month - startMonth + 12) % 12;

/// 会計年度。month >= startMonth ならその暦年、そうでなければ暦年-1。
int fiscalYear(Object date, {int startMonth = 4}) {
  final d = toDate(date);
  return d.month >= startMonth ? d.year : d.year - 1;
}

/// 四半期（1..4）。
int fiscalQuarter(Object date, {int startMonth = 4}) {
  final d = toDate(date);
  return _monthIndex(d.month, startMonth) ~/ 3 + 1;
}

/// 半期（1=上期 / 2=下期）。
int fiscalHalf(Object date, {int startMonth = 4}) {
  final d = toDate(date);
  return _monthIndex(d.month, startMonth) ~/ 6 + 1;
}
