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

  /// Export the page's rows (CSV by default). The framework builds the text
  /// from the table's columns; handing it to the user (download, save dialog,
  /// share) is the application's job — see the export sink on `HatakeScope`.
  /// Options live in `ActionDefinition.config` (see `CsvOptions.fromConfig`).
  static const String export = 'export';

  /// Print the page's report. The framework builds the paper's *contents* and
  /// hands them to the print sink on `HatakeScope`; producing the bytes (PDF,
  /// printer codes) belongs to an opt-in adapter — see `hatake_print`.
  ///
  /// Only a page with a `report` can print: the paper's shape comes from the
  /// report (paper, groups, totals), and there is no paper without it.
  static const String print = 'print';

  /// Navigate to another page (see `AppDefinition`). Target page id and route
  /// params are carried in `ActionDefinition.config` as `page` / `params`.
  static const String navigate = 'navigate';
}
