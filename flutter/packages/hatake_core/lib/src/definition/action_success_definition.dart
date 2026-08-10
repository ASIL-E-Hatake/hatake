import 'package:equatable/equatable.dart';

/// What happens once an action succeeded.
///
/// Nothing here runs when the action fails — that is the whole point of putting
/// it in the definition instead of after the call: "saved, then go back to the
/// list" is a business rule, and it must not fire on an error.
class ActionSuccessDefinition extends Equatable {
  /// Shown briefly to the user (a snackbar / toast).
  final String? message;

  /// Page id to move to afterwards.
  final String? page;

  /// Route params for [page]; `$row.id` / `$record.id` resolve against the
  /// current row / record (same templating as a `navigate` action).
  final Map<String, Object?> params;

  const ActionSuccessDefinition({
    this.message,
    this.page,
    this.params = const {},
  });

  @override
  List<Object?> get props => [message, page, params];
}
