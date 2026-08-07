import 'package:equatable/equatable.dart';

import 'action_definition.dart';
import 'dashboard_item_definition.dart';
import 'form_definition.dart';
import 'layout_definition.dart';
import 'search_definition.dart';
import 'section_definition.dart';
import 'table_definition.dart';
import 'wizard_step_definition.dart';

/// The current DSL version. Backward compatibility is a top priority; the
/// version travels with every definition so parsers can migrate older inputs.
const String kDslVersion = '1.0';

/// Base type for all page definitions — the Single Source of Truth that
/// renderers draw. It is independent of how it was obtained (YAML / JSON /
/// Dart builder / API): everything converges here.
///
/// Sealed so the set of page kinds is known to renderers via exhaustive
/// `switch`, while new kinds are added deliberately (not ad hoc).
sealed class PageDefinition extends Equatable {
  /// Stable page identifier.
  final String id;

  /// Page title.
  final String title;

  /// DSL version this definition conforms to.
  final String dslVersion;

  const PageDefinition({
    required this.id,
    required this.title,
    this.dslVersion = kDslVersion,
  });
}

/// Shared shape for list + form business pages (crud, master). Lets one
/// controller and renderer serve every "table + form over a repository" page.
abstract interface class CrudLike {
  String get id;
  String get title;
  String get repository;
  String get keyField;
  SearchDefinition? get search;
  TableDefinition get table;
  FormDefinition get form;
  List<ActionDefinition> get actions;
}

/// A create/read/update/delete page: search + table + form over a single
/// [repository]. This is hatake's first-class business component.
class CrudPageDefinition extends PageDefinition implements CrudLike {
  /// Key used to resolve the user-provided [Repository] implementation.
  @override
  final String repository;

  /// The primary-key field name of a record.
  @override
  final String keyField;

  /// Optional search area. When null, the table lists all records.
  @override
  final SearchDefinition? search;

  /// The results table.
  @override
  final TableDefinition table;

  /// The create / edit form.
  @override
  final FormDefinition form;

  /// Page-level actions (e.g. create, export).
  @override
  final List<ActionDefinition> actions;

  const CrudPageDefinition({
    required super.id,
    required super.title,
    super.dslVersion,
    required this.repository,
    this.keyField = 'id',
    this.search,
    required this.table,
    required this.form,
    this.actions = const [],
  });

  @override
  List<Object?> get props => [
        id,
        title,
        dslVersion,
        repository,
        keyField,
        search,
        table,
        form,
        actions,
      ];
}

/// A read-only search/list page (照会画面): search + table, no mutation form.
///
/// Row actions reference page-level plugin [actions] by id (e.g. a "detail"
/// action), dispatched with the row as context.
class SearchPageDefinition extends PageDefinition {
  /// Key resolving the user-provided [Repository] implementation.
  final String repository;

  /// The primary-key field name of a record.
  final String keyField;

  /// Optional search area. When null, the table lists all records.
  final SearchDefinition? search;

  /// The results table.
  final TableDefinition table;

  /// Page-level actions (also referenced by `table.rowActions`).
  final List<ActionDefinition> actions;

  const SearchPageDefinition({
    required super.id,
    required super.title,
    super.dslVersion,
    required this.repository,
    this.keyField = 'id',
    this.search,
    required this.table,
    this.actions = const [],
  });

  @override
  List<Object?> get props => [
        id,
        title,
        dslVersion,
        repository,
        keyField,
        search,
        table,
        actions,
      ];
}

/// A master-maintenance page. Structurally identical to [CrudPageDefinition]
/// (search + table + form); a distinct kind so renderers/apps can treat master
/// screens specially later (e.g. compact layout) without changing the DSL.
class MasterPageDefinition extends PageDefinition implements CrudLike {
  @override
  final String repository;
  @override
  final String keyField;
  @override
  final SearchDefinition? search;
  @override
  final TableDefinition table;
  @override
  final FormDefinition form;
  @override
  final List<ActionDefinition> actions;

  const MasterPageDefinition({
    required super.id,
    required super.title,
    super.dslVersion,
    required this.repository,
    this.keyField = 'id',
    this.search,
    required this.table,
    required this.form,
    this.actions = const [],
  });

  @override
  List<Object?> get props =>
      [id, title, dslVersion, repository, keyField, search, table, form, actions];
}

/// A standalone form page (single-record create or edit) — the form portion of
/// CRUD on its own. When shown with a record key it edits; otherwise it
/// creates. Useful for wizard steps, "new X" screens, and edit routes.
class FormPageDefinition extends PageDefinition {
  final String repository;
  final String keyField;
  final FormDefinition form;
  final List<ActionDefinition> actions;

  const FormPageDefinition({
    required super.id,
    required super.title,
    super.dslVersion,
    required this.repository,
    this.keyField = 'id',
    this.form = const FormDefinition(),
    this.actions = const [],
  });

  @override
  List<Object?> get props =>
      [id, title, dslVersion, repository, keyField, form, actions];
}

/// A stepped-input page (ウィザード): the form split into [steps], each validated
/// on its own before advancing, and persisted once on the final step.
///
/// Structurally it is a [FormPageDefinition] whose form arrives pre-sliced — so
/// [form] exposes every step as one form for the final submit, while
/// [WizardStepDefinition.form] scopes validation to a single step.
class WizardPageDefinition extends PageDefinition {
  final String repository;
  final String keyField;

  /// Steps in declaration order. At least one.
  final List<WizardStepDefinition> steps;

  final List<ActionDefinition> actions;

  const WizardPageDefinition({
    required super.id,
    required super.title,
    super.dslVersion,
    required this.repository,
    this.keyField = 'id',
    this.steps = const [],
    this.actions = const [],
  });

  /// Every step as a single form (one section per step), used to normalize and
  /// validate the whole record before saving.
  FormDefinition get form => FormDefinition(
        sections: [
          for (final step in steps)
            SectionDefinition(
              title: step.title,
              fields: step.fields,
              layout: step.layout,
            ),
        ],
      );

  /// Index of the first step declaring [field], or -1 when no step does. Lets a
  /// renderer jump back to where a whole-form error actually lives.
  int stepIndexOfField(String field) {
    for (var i = 0; i < steps.length; i++) {
      if (steps[i].fields.any((f) => f.field == field)) return i;
    }
    return -1;
  }

  @override
  List<Object?> get props =>
      [id, title, dslVersion, repository, keyField, steps, actions];
}

/// A dashboard page: a grid of read-only cards ([items]), each one a small query
/// against a repository plus how to display its result.
///
/// Unlike the other page kinds a dashboard has no single record and no single
/// repository — [repository] is only the default for items that omit their own.
/// An optional [search] area applies to every item, which is how a period or
/// branch selector filters the whole board at once.
class DashboardPageDefinition extends PageDefinition {
  /// Default repository key for items that declare none.
  final String? repository;

  /// Cards, in declaration order.
  final List<DashboardItemDefinition> items;

  /// Card grid: how many columns wide the board is on a wide layout.
  final LayoutDefinition layout;

  /// Optional filters applied to every item's query.
  final SearchDefinition? search;

  final List<ActionDefinition> actions;

  const DashboardPageDefinition({
    required super.id,
    required super.title,
    super.dslVersion,
    this.repository,
    this.items = const [],
    this.layout = const LayoutDefinition(columns: 2),
    this.search,
    this.actions = const [],
  });

  /// Repository key for [item] — its own, or the page default.
  /// Null when neither is declared (the renderer reports it).
  String? repositoryOf(DashboardItemDefinition item) =>
      item.repository ?? repository;

  @override
  List<Object?> get props =>
      [id, title, dslVersion, repository, items, layout, search, actions];
}

/// A read-only detail page: displays a single record's fields (grouped by the
/// [form]'s sections), formatted for display. The record to show is supplied
/// to the view at runtime (e.g. from navigation).
class DetailPageDefinition extends PageDefinition {
  final String repository;
  final String keyField;

  /// Fields to display (same structure as a form; rendered read-only).
  final FormDefinition form;

  final List<ActionDefinition> actions;

  const DetailPageDefinition({
    required super.id,
    required super.title,
    super.dslVersion,
    required this.repository,
    this.keyField = 'id',
    this.form = const FormDefinition(),
    this.actions = const [],
  });

  @override
  List<Object?> get props =>
      [id, title, dslVersion, repository, keyField, form, actions];
}
