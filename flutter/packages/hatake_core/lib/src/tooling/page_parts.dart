import '../definition/action_definition.dart';
import '../definition/dashboard_item_definition.dart';
import '../definition/form_definition.dart';
import '../definition/page_definition.dart';
import '../definition/search_definition.dart';
import '../definition/table_definition.dart';
import '../definition/wizard_step_definition.dart';

/// Reads the parts a page may or may not have.
///
/// The page kinds are separate classes because a renderer wants exhaustive
/// `switch`es — but tooling (an index, a summary) asks the same question of
/// every kind: "does this one have a table? which fields does it hold?".
/// Without these, every tool repeats the same eight-way switch.
///
/// Each accessor returns null / empty rather than throwing: "this kind has no
/// form" is an answer, not an error.
extension PageParts on PageDefinition {
  /// The search area, when this kind has one and the definition declared it.
  SearchDefinition? get searchArea => switch (this) {
        CrudPageDefinition(:final search) => search,
        SearchPageDefinition(:final search) => search,
        MasterPageDefinition(:final search) => search,
        ReportPageDefinition(:final search) => search,
        DashboardPageDefinition(:final search) => search,
        _ => null,
      };

  /// The results table, when this kind has one.
  TableDefinition? get tableArea => switch (this) {
        CrudPageDefinition(:final table) => table,
        SearchPageDefinition(:final table) => table,
        MasterPageDefinition(:final table) => table,
        ReportPageDefinition(:final table) => table,
        _ => null,
      };

  /// The form, when this kind has one. A wizard is excluded on purpose: its
  /// fields live in [steps], and folding them into one form here would count
  /// them twice.
  FormDefinition? get formArea => switch (this) {
        CrudPageDefinition(:final form) => form,
        MasterPageDefinition(:final form) => form,
        FormPageDefinition(:final form) => form,
        DetailPageDefinition(:final form) => form,
        _ => null,
      };

  /// Wizard steps (empty for every other kind).
  List<WizardStepDefinition> get steps => switch (this) {
        WizardPageDefinition(:final steps) => steps,
        _ => const [],
      };

  /// Dashboard cards (empty for every other kind).
  List<DashboardItemDefinition> get cards => switch (this) {
        DashboardPageDefinition(:final items) => items,
        _ => const [],
      };

  /// Page-level actions. Every kind has them.
  List<ActionDefinition> get pageActions => switch (this) {
        CrudPageDefinition(:final actions) => actions,
        SearchPageDefinition(:final actions) => actions,
        MasterPageDefinition(:final actions) => actions,
        DetailPageDefinition(:final actions) => actions,
        FormPageDefinition(:final actions) => actions,
        WizardPageDefinition(:final actions) => actions,
        DashboardPageDefinition(:final actions) => actions,
        ReportPageDefinition(:final actions) => actions,
      };

  /// The repository key this page reads from. Null on a dashboard that leaves
  /// it to each card.
  String? get repositoryKey => switch (this) {
        CrudPageDefinition(:final repository) => repository,
        SearchPageDefinition(:final repository) => repository,
        MasterPageDefinition(:final repository) => repository,
        DetailPageDefinition(:final repository) => repository,
        FormPageDefinition(:final repository) => repository,
        WizardPageDefinition(:final repository) => repository,
        ReportPageDefinition(:final repository) => repository,
        DashboardPageDefinition(:final repository) => repository,
      };
}
