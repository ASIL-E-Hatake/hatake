/// Built-in table column render types. Open strings — extensible via plugins.
abstract final class ColumnTypes {
  const ColumnTypes._();

  static const String text = 'text';
  static const String number = 'number';
  static const String badge = 'badge';
  static const String boolean = 'boolean';
  static const String date = 'date';
  static const String dateTime = 'dateTime';
}
