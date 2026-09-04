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

  /// 明細（`subTable`）の**行どうし**の規則: `of` に書いた行の項目が重ならないこと。
  /// 行の中だけを見ていては分からない転び方（「同じ品名が2行にある」）を見る。
  static const String unique = 'unique';
}
