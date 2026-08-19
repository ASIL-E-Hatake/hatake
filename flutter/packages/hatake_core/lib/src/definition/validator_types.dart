/// Built-in validator type identifiers. Open strings — extensible via plugins.
abstract final class ValidatorTypes {
  const ValidatorTypes._();

  static const String required = 'required';
  static const String maxLength = 'maxLength';
  static const String minLength = 'minLength';
  static const String pattern = 'pattern';
  static const String min = 'min';
  static const String max = 'max';
  static const String email = 'email';
  static const String postalCode = 'postalCode';

  /// Compares this field with another one (cross-field validation). Takes
  /// `operator` and `field`; optionally `aggregate` + `of` to fold child rows.
  static const String compare = 'compare';
}
