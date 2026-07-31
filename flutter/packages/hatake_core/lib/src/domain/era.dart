import 'package:equatable/equatable.dart';

import '../util/dates.dart';

/// 元号（和暦）の定義。改元日（[year]/[month]/[day]）で区切る。
///
/// 将来の改元に備え、テーブルは差し替え可能にしておきたいが、いまは組込みの
/// [eras] を [eraOf] と `wareki` フォーマッタで共有している（単一の真実）。
class Era {
  /// 元号名（例: 令和）。
  final String name;

  /// 略記（例: R）。
  final String abbr;

  /// 改元日の年。
  final int year;

  /// 改元日の月。
  final int month;

  /// 改元日の日。
  final int day;

  const Era(this.name, this.abbr, this.year, this.month, this.day);

  /// 改元日（この日以降がこの元号）。
  DateTime get start => DateTime(year, month, day);
}

/// 組込みの元号テーブル（新しい順）。`wareki` フォーマッタと [eraOf] が共有する。
const List<Era> eras = [
  Era('令和', 'R', 2019, 5, 1),
  Era('平成', 'H', 1989, 1, 8),
  Era('昭和', 'S', 1926, 12, 25),
  Era('大正', 'T', 1912, 7, 30),
  Era('明治', 'M', 1868, 10, 23),
];

/// [eraOf] の結果。元号名・略記・和暦年（元年 = 1）。
class EraDate extends Equatable {
  /// 元号名（例: 令和）。
  final String name;

  /// 略記（例: R）。
  final String abbr;

  /// 和暦年（元年 = 1）。
  final int year;

  const EraDate({required this.name, required this.abbr, required this.year});

  @override
  List<Object?> get props => [name, abbr, year];

  @override
  String toString() => 'EraDate(name: $name, abbr: $abbr, year: $year)';
}

/// [date] の元号を算出する。明治より前は `null`。
///
/// [date] は `DateTime` か `yyyy-MM-dd` 文字列。和暦年は改元年を 1（元年）とする。
EraDate? eraOf(Object date) {
  final d = toDate(date);
  for (final e in eras) {
    if (!d.isBefore(e.start)) {
      return EraDate(name: e.name, abbr: e.abbr, year: d.year - e.year + 1);
    }
  }
  return null;
}
