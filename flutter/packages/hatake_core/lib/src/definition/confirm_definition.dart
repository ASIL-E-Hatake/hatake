import 'package:equatable/equatable.dart';

/// Ask the user before running an action.
///
/// Written on the action rather than in code, because "delete asks first" is a
/// business rule about that button, not a rendering detail. A `delete` action
/// asks even without this; declaring it replaces the wording.
class ConfirmDefinition extends Equatable {
  /// Dialog heading. Null = the renderer's default.
  final String? title;

  /// The question itself.
  final String message;

  /// Label of the button that runs the action. Null = the renderer's default.
  final String? okLabel;

  /// Label of the button that does nothing. Null = the renderer's default.
  final String? cancelLabel;

  /// Style the confirming button as destructive.
  final bool danger;

  const ConfirmDefinition({
    this.title,
    required this.message,
    this.okLabel,
    this.cancelLabel,
    this.danger = false,
  });

  @override
  List<Object?> get props => [title, message, okLabel, cancelLabel, danger];
}
