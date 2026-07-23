/// Built-in field type identifiers.
///
/// Field types are open strings — plugins may register additional types
/// without modifying the framework. These constants exist for discoverability
/// and to avoid typos in built-in usage.
abstract final class FieldTypes {
  const FieldTypes._();

  static const String text = 'text';
  static const String textarea = 'textarea';
  static const String number = 'number';
  static const String select = 'select';
  static const String multiSelect = 'multiSelect';
  static const String checkbox = 'checkbox';
  static const String radio = 'radio';
  static const String date = 'date';
  static const String dateTime = 'dateTime';
  static const String time = 'time';
}
