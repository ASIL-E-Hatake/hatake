import 'package:equatable/equatable.dart';

/// A single validation failure tied to a field.
class ValidationError extends Equatable {
  final String field;
  final String message;

  const ValidationError({required this.field, required this.message});

  @override
  List<Object?> get props => [field, message];
}

/// The outcome of validating a record against a form's rules.
class ValidationResult extends Equatable {
  final List<ValidationError> errors;

  const ValidationResult(this.errors);

  static const ValidationResult valid = ValidationResult([]);

  bool get isValid => errors.isEmpty;

  /// Errors for a specific field.
  List<ValidationError> forField(String field) =>
      errors.where((e) => e.field == field).toList();

  @override
  List<Object?> get props => [errors];
}
