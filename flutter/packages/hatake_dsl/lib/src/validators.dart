import 'package:hatake_core/hatake_core.dart';

/// Validator helper functions producing [ValidatorDefinition]s.
///
/// These mirror the built-in [ValidatorTypes] and keep builder code concise:
/// `field('code', label: 'コード', validators: [maxLength(20)])`.

ValidatorDefinition maxLength(int value, {String? message}) =>
    ValidatorDefinition(
      type: ValidatorTypes.maxLength,
      params: {'value': value},
      message: message,
    );

ValidatorDefinition minLength(int value, {String? message}) =>
    ValidatorDefinition(
      type: ValidatorTypes.minLength,
      params: {'value': value},
      message: message,
    );

ValidatorDefinition minValue(num value, {String? message}) =>
    ValidatorDefinition(
      type: ValidatorTypes.min,
      params: {'value': value},
      message: message,
    );

ValidatorDefinition maxValue(num value, {String? message}) =>
    ValidatorDefinition(
      type: ValidatorTypes.max,
      params: {'value': value},
      message: message,
    );

ValidatorDefinition pattern(String regex, {String? message}) =>
    ValidatorDefinition(
      type: ValidatorTypes.pattern,
      params: {'pattern': regex},
      message: message,
    );

ValidatorDefinition email({String? message}) =>
    ValidatorDefinition(type: ValidatorTypes.email, message: message);
