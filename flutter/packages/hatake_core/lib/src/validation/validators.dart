import '../definition/validator_definition.dart';
import '../definition/validator_types.dart';
import '../i18n/message_resolver.dart';

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

/// Built-in validators keyed by [ValidatorTypes]. Messages are resolved via a
/// [MessageResolver] (default locale Japanese) so they can be localized or
/// overridden; per-rule override via `ValidatorDefinition.message` still wins.
Map<String, ValidatorFn> builtinValidators([MessageResolver? messages]) {
  final m = messages ?? MessageResolver();
  return {
    ValidatorTypes.required: (value, def) =>
        _isEmpty(value) ? m.resolve('required') : null,
    ValidatorTypes.maxLength: (value, def) {
      final max = (def.params['value'] as num?)?.toInt();
      if (max == null || value == null) return null;
      return value.toString().length > max
          ? m.resolve('maxLength', {'value': max})
          : null;
    },
    ValidatorTypes.minLength: (value, def) {
      final min = (def.params['value'] as num?)?.toInt();
      if (min == null || _isEmpty(value)) return null;
      return value.toString().length < min
          ? m.resolve('minLength', {'value': min})
          : null;
    },
    ValidatorTypes.min: (value, def) {
      final min = def.params['value'] as num?;
      final n = _toNum(value);
      if (min == null || n == null) return null;
      return n < min ? m.resolve('min', {'value': min}) : null;
    },
    ValidatorTypes.max: (value, def) {
      final max = def.params['value'] as num?;
      final n = _toNum(value);
      if (max == null || n == null) return null;
      return n > max ? m.resolve('max', {'value': max}) : null;
    },
    ValidatorTypes.pattern: (value, def) {
      final source = def.params['pattern'] as String?;
      if (source == null || _isEmpty(value)) return null;
      return RegExp(source).hasMatch(value.toString())
          ? null
          : m.resolve('pattern');
    },
    ValidatorTypes.email: (value, def) {
      if (_isEmpty(value)) return null;
      final re = RegExp(r'^[\w.+-]+@[\w-]+\.[\w.-]+$');
      return re.hasMatch(value.toString()) ? null : m.resolve('email');
    },
    ValidatorTypes.postalCode: (value, def) {
      if (_isEmpty(value)) return null;
      return RegExp(r'^\d{3}-?\d{4}$').hasMatch(value.toString())
          ? null
          : m.resolve('postalCode');
    },
  };
}

/// Resolves validator types to their implementations. Extensible: register
/// custom validators (plugins) without modifying the framework.
class ValidatorRegistry {
  final Map<String, ValidatorFn> _validators;

  /// [custom] adds/overrides validators; [messages] localizes built-in
  /// messages (default locale Japanese).
  ValidatorRegistry([
    Map<String, ValidatorFn>? custom,
    MessageResolver? messages,
  ]) : _validators = {
          ...builtinValidators(messages),
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
