import 'parse_exception.dart';

/// Typed, forgiving accessors over a normalized `Map<String, Object?>`.
extension MapReaders on Map<String, Object?> {
  /// Reads a required non-empty string, throwing with [at] on failure.
  String reqString(String key, {required String at}) {
    final value = this[key];
    if (value is String && value.isNotEmpty) return value;
    throw DefinitionParseException(
      'Missing or empty required string "$key"',
      path: at,
    );
  }

  String? optString(String key) {
    final value = this[key];
    return value is String ? value : null;
  }

  bool optBool(String key, {bool orElse = false}) {
    final value = this[key];
    return value is bool ? value : orElse;
  }

  int? optInt(String key) {
    final value = this[key];
    if (value is int) return value;
    if (value is String) return int.tryParse(value);
    return null;
  }

  double? optDouble(String key) {
    final value = this[key];
    if (value is num) return value.toDouble();
    if (value is String) return double.tryParse(value);
    return null;
  }

  Map<String, Object?>? optMap(String key) {
    final value = this[key];
    return value is Map<String, Object?> ? value : null;
  }

  List<Object?> optList(String key) {
    final value = this[key];
    return value is List ? value : const [];
  }
}
