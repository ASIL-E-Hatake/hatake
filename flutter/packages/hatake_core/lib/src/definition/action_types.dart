/// Built-in action type identifiers. Open strings — extensible via plugins.
abstract final class ActionTypes {
  const ActionTypes._();

  /// Open the create form.
  static const String create = 'create';

  /// Edit the current / selected record.
  static const String edit = 'edit';

  /// Delete the current / selected record.
  static const String delete = 'delete';

  /// Delegate to a registered action plugin (see [ActionDefinition.plugin]).
  static const String plugin = 'plugin';
}
