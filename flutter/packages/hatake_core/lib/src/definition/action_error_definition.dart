import 'package:equatable/equatable.dart';

/// What the user is told when the action failed.
///
/// Without this, a failure shows the reason as the system reported it
/// (`RepositoryHttpException: … 500 …`), which is true but not useful to the
/// person holding the mouse. The definition is the right place for the business
/// wording, because the same failure means different things per screen
/// （「在庫が足りません」/「締め済みなので直せません」）.
///
/// **A failure never moves the screen.** `onSuccess` can navigate; this cannot,
/// on purpose: moving away from the screen that failed hides what happened, and
/// the user needs the row still in front of them to fix it.
class ActionErrorDefinition extends Equatable {
  /// Shown instead of the raw failure. Placeholders, filled when known:
  ///
  /// * `{error}` … the reason as reported (put it in when the detail helps)
  /// * `{failed}` / `{count}` / `{total}` … row counts of a `scope: selection`
  ///   action (failed / succeeded / both)
  final String message;

  const ActionErrorDefinition({required this.message});

  @override
  List<Object?> get props => [message];
}
