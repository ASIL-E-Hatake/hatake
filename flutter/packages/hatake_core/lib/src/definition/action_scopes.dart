/// What an action runs on. Closed set — unlike an action *type*, this is not a
/// plugin point: a renderer can add kinds of button, but "what is it about" only
/// has these two answers.
abstract final class ActionScopes {
  const ActionScopes._();

  /// The screen (default). A `create` opens a form, an `export` writes the
  /// result set, a `print` prints the report.
  static const String page = 'page';

  /// The rows the user checked.
  ///
  /// Declaring this is also what makes the table selectable, so the checkbox
  /// column and the bulk button always arrive together. The button stays
  /// disabled while nothing is selected — a bulk button that does nothing when
  /// pressed teaches the user that the screen is broken.
  static const String selection = 'selection';
}
