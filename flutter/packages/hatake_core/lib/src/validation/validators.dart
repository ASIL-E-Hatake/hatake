import '../definition/validator_definition.dart';
import '../definition/validator_types.dart';

/// Validates a single [value] against a [ValidatorDefinition], returning an
/// error message on failure or null when valid.
typedef ValidatorFn = String? Function(
  Object? value,
  ValidatorDefinition definition,
);

num? _toNum(Object? value) {
  if (value is num) return value;
  if (value is String) return num.tryParse(value);
  return null;
}

bool _isEmpty(Object? value) =>
    value == null ||
    (value is String && value.trim().isEmpty) ||
    (value is Iterable && value.isEmpty);

/// Built-in validators keyed by [ValidatorTypes]. Default messages are in
/// Japanese and can be overridden per rule via `ValidatorDefinition.message`.
final Map<String, ValidatorFn> builtinValidators = {
  ValidatorTypes.required: (value, def) =>
      _isEmpty(value) ? '必須項目です' : null,
  ValidatorTypes.maxLength: (value, def) {
    final max = (def.params['value'] as num?)?.toInt();
    if (max == null || value == null) return null;
    return value.toString().length > max ? '$max文字以内で入力してください' : null;
  },
  ValidatorTypes.minLength: (value, def) {
    final min = (def.params['value'] as num?)?.toInt();
    if (min == null || _isEmpty(value)) return null;
    return value.toString().length < min ? '$min文字以上で入力してください' : null;
  },
  ValidatorTypes.min: (value, def) {
    final min = def.params['value'] as num?;
    final n = _toNum(value);
    if (min == null || n == null) return null;
    return n < min ? '$min以上で入力してください' : null;
  },
  ValidatorTypes.max: (value, def) {
    final max = def.params['value'] as num?;
    final n = _toNum(value);
    if (max == null || n == null) return null;
    return n > max ? '$max以下で入力してください' : null;
  },
  ValidatorTypes.pattern: (value, def) {
    final source = def.params['pattern'] as String?;
    if (source == null || _isEmpty(value)) return null;
    return RegExp(source).hasMatch(value.toString()) ? null : '形式が正しくありません';
  },
  ValidatorTypes.email: (value, def) {
    if (_isEmpty(value)) return null;
    final re = RegExp(r'^[\w.+-]+@[\w-]+\.[\w.-]+$');
    return re.hasMatch(value.toString())
        ? null
        : 'メールアドレスの形式が正しくありません';
  },
  ValidatorTypes.postalCode: (value, def) {
    if (_isEmpty(value)) return null;
    return RegExp(r'^\d{3}-?\d{4}$').hasMatch(value.toString())
        ? null
        : '郵便番号の形式が正しくありません';
  },
};

/// Resolves validator types to their implementations. Extensible: register
/// custom validators (plugins) without modifying the framework.
class ValidatorRegistry {
  final Map<String, ValidatorFn> _validators;

  ValidatorRegistry([Map<String, ValidatorFn>? custom])
      : _validators = {
          ...builtinValidators,
          if (custom != null) ...custom,
        };

  /// Runs the validator for [definition]; returns null when valid, or when no
  /// validator is registered for the type (unknown types are ignored so that
  /// plugin types degrade gracefully).
  String? run(Object? value, ValidatorDefinition definition) =>
      _validators[definition.type]?.call(value, definition);

  /// Registers (or replaces) a validator implementation.
  void register(String type, ValidatorFn fn) => _validators[type] = fn;

  bool contains(String type) => _validators.containsKey(type);
}
