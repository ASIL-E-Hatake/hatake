// Internal date helpers shared by the domain utils. Not exported.

/// Parses a date given as a `DateTime` or an ISO-ish `yyyy-MM-dd` string into a
/// date-only `DateTime` (local midnight). Throws on invalid input.
DateTime toDate(Object date) {
  if (date is DateTime) return DateTime(date.year, date.month, date.day);
  final s = date.toString();
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(s);
  if (m != null) {
    return DateTime(int.parse(m[1]!), int.parse(m[2]!), int.parse(m[3]!));
  }
  final parsed = DateTime.tryParse(s);
  if (parsed != null) return DateTime(parsed.year, parsed.month, parsed.day);
  throw ArgumentError('Invalid date: $date');
}

/// Formats a date as `yyyy-MM-dd`.
String isoDate(DateTime d) {
  String two(int v) => v.toString().padLeft(2, '0');
  return '${d.year.toString().padLeft(4, '0')}-${two(d.month)}-${two(d.day)}';
}
