import 'package:equatable/equatable.dart';

import '../util/dates.dart';

/// 年・月の期間（年齢・勤続年数など）。
class Tenure extends Equatable {
  final int years;
  final int months;
  const Tenure({required this.years, required this.months});

  @override
  List<Object?> get props => [years, months];

  @override
  String toString() => 'Tenure(years: $years, months: $months)';
}

int _totalMonths(DateTime from, DateTime to) {
  var months = (to.year - from.year) * 12 + (to.month - from.month);
  if (to.day < from.day) months -= 1; // 日が未達なら1ヶ月引く
  return months;
}

/// [from] から [to] までの満年・月（勤続年数など）。
Tenure tenure(Object from, Object to) {
  final months = _totalMonths(toDate(from), toDate(to));
  return Tenure(years: months ~/ 12, months: months % 12);
}

/// [asOf] 時点の満年齢（誕生日未達なら1引く）。
int ageAt(Object birth, Object asOf) => tenure(birth, asOf).years;
