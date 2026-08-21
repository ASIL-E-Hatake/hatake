import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:hatake/hatake.dart';

import 'material_theme.dart';

part 'renderer/app_shell.dart';
part 'renderer/app_menu.dart';
part 'renderer/app_breadcrumb.dart';
part 'renderer/table_support.dart';
part 'renderer/action_hooks.dart';
part 'renderer/page_actions.dart';
part 'renderer/action_prompt.dart';
part 'renderer/options_fetcher.dart';
part 'renderer/filter_input.dart';
part 'renderer/crud_page.dart';
part 'renderer/form_fields.dart';
part 'renderer/sub_table_field.dart';
part 'renderer/sub_table_paged.dart';
part 'renderer/search_page.dart';
part 'renderer/detail_page.dart';
part 'renderer/form_page.dart';
part 'renderer/wizard_page.dart';
part 'renderer/dashboard_page.dart';
part 'renderer/dashboard_chart.dart';
part 'renderer/export_action.dart';
part 'renderer/print_action.dart';
part 'renderer/report_page.dart';

/// Context handed to a custom [MaterialFieldBuilder] for a form field.
class MaterialFieldContext {
  final BuildContext buildContext;
  final FieldDefinition field;

  /// Current value of the field in the form draft.
  final Object? value;

  /// Call to update the field value in the form draft.
  final ValueChanged<Object?> onChanged;

  /// Current validation message for the field, or null.
  final String? errorText;

  const MaterialFieldContext({
    required this.buildContext,
    required this.field,
    required this.value,
    required this.onChanged,
    required this.errorText,
  });
}

/// Builds the input widget for a form field of a given type. Register these on
/// [MaterialRenderer] to add or override how field types render.
typedef MaterialFieldBuilder = Widget Function(MaterialFieldContext context);

/// Context handed to a custom [MaterialDashboardItemBuilder] for one card.
///
/// The card's frame (title, height, tap action, loading and error states) is
/// already drawn; a builder only fills the body from [state].
class MaterialDashboardItemContext {
  final BuildContext buildContext;
  final DashboardItemDefinition item;

  /// Rows / aggregated value / chart points loaded for this card.
  final DashboardItemState state;

  /// Formatters for display (honours the item's `format` + `config`).
  final FormatterRegistry formatters;

  const MaterialDashboardItemContext({
    required this.buildContext,
    required this.item,
    required this.state,
    required this.formatters,
  });
}

/// Builds the body of a dashboard card of a given item type. Register these on
/// [MaterialRenderer] to add item types (e.g. a gauge) or override built-ins.
typedef MaterialDashboardItemBuilder = Widget Function(
  MaterialDashboardItemContext context,
);

/// A Material 3 [Renderer] for hatake pages.
///
/// Extend field-type support by passing [fieldBuilders] keyed by field type
/// (e.g. `{'color': (ctx) => ...}`); these take precedence over the built-ins.
class MaterialRenderer implements Renderer, RegistryReporter {
  final Map<String, MaterialFieldBuilder> fieldBuilders;

  /// Display formatters used for columns/fields with a `format`. Defaults to
  /// the built-in registry; pass a custom one to add/override formatters.
  final FormatterRegistry? formatters;

  /// Bodies for dashboard card types, keyed by item type (e.g.
  /// `{'gauge': (ctx) => ...}`); these take precedence over the built-ins.
  final Map<String, MaterialDashboardItemBuilder> dashboardItemBuilders;

  const MaterialRenderer({
    this.fieldBuilders = const {},
    this.formatters,
    this.dashboardItemBuilders = const {},
  });

  /// この Renderer に渡された独自の登録（`registrySnapshot` が拾う）。
  /// 組み込みは含めない＝アプリが足したものだけを名乗る。
  @override
  Map<String, List<String>> get registeredNames => {
        RegistryKinds.fieldTypes: fieldBuilders.keys.toList()..sort(),
        RegistryKinds.dashboardItemTypes: dashboardItemBuilders.keys.toList()
          ..sort(),
        RegistryKinds.formatters: formatters?.customKeys ?? const [],
      };

  @override
  Widget buildCrudPage(
    BuildContext context,
    CrudLike definition,
    CrudController controller,
  ) {
    return _MaterialCrudPage(
      definition: definition,
      controller: controller,
      fieldBuilders: fieldBuilders,
      formatters: formatters,
    );
  }

  @override
  Widget buildSearchPage(
    BuildContext context,
    SearchPageDefinition definition,
    ListController controller,
  ) {
    return _MaterialSearchPage(
      definition: definition,
      controller: controller,
      formatters: formatters,
    );
  }

  @override
  Widget buildDetailPage(
    BuildContext context,
    DetailPageDefinition definition,
    DetailController controller,
  ) {
    return _MaterialDetailPage(
      definition: definition,
      controller: controller,
      formatters: formatters ?? FormatterRegistry(),
    );
  }

  @override
  Widget buildFormPage(
    BuildContext context,
    FormPageDefinition definition,
    FormController controller,
  ) {
    return _MaterialFormPage(
      definition: definition,
      controller: controller,
      fieldBuilders: fieldBuilders,
      formatters: formatters,
    );
  }

  @override
  Widget buildWizardPage(
    BuildContext context,
    WizardPageDefinition definition,
    WizardController controller,
  ) {
    return _MaterialWizardPage(
      definition: definition,
      controller: controller,
      fieldBuilders: fieldBuilders,
      formatters: formatters,
    );
  }

  @override
  Widget buildDashboardPage(
    BuildContext context,
    DashboardPageDefinition definition,
    DashboardController controller,
  ) {
    return _MaterialDashboardPage(
      definition: definition,
      controller: controller,
      formatters: formatters ?? FormatterRegistry(),
      itemBuilders: dashboardItemBuilders,
    );
  }

  @override
  Widget buildReportPage(
    BuildContext context,
    ReportPageDefinition definition,
    ReportController controller,
  ) {
    return _MaterialReportPage(
      definition: definition,
      controller: controller,
      formatters: formatters ?? FormatterRegistry(),
    );
  }

  @override
  Widget buildApp(
    BuildContext context,
    AppDefinition definition,
    HatakeRouter router,
  ) {
    return _MaterialAppShell(app: definition, router: router);
  }
}
