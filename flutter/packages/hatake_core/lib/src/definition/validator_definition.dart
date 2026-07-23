import 'package:equatable/equatable.dart';

/// Declares a validation rule to apply to a field.
///
/// [type] is an open string (see `ValidatorTypes`); [params] carries rule
/// arguments (e.g. `{'value': 20}` for `maxLength`). Execution is performed by
/// a validator registered against [type], not by this definition.
class ValidatorDefinition extends Equatable {
  final String type;
  final Map<String, Object?> params;

  /// Optional override message shown when validation fails.
  final String? message;

  const ValidatorDefinition({
    required this.type,
    this.params = const {},
    this.message,
  });

  @override
  List<Object?> get props => [type, params, message];
}
