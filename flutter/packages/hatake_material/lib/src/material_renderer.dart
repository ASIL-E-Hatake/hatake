import 'package:flutter/material.dart';
import 'package:hatake/hatake.dart';

part 'renderer/app_shell.dart';
part 'renderer/app_menu.dart';
part 'renderer/app_breadcrumb.dart';
part 'renderer/table_support.dart';
part 'renderer/crud_page.dart';
part 'renderer/form_fields.dart';
part 'renderer/sub_table_field.dart';
part 'renderer/search_page.dart';
part 'renderer/detail_page.dart';
part 'renderer/form_page.dart';

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

/// A Material 3 [Renderer] for hatake pages.
///
/// Extend field-type support by passing [fieldBuilders] keyed by field type
/// (e.g. `{'color': (ctx) => ...}`); these take precedence over the built-ins.
class MaterialRenderer implements Renderer {
  final Map<String, MaterialFieldBuilder> fieldBuilders;

  /// Display formatters used for columns/fields with a `format`. Defaults to
  /// the built-in registry; pass a custom one to add/override formatters.
  final FormatterRegistry? formatters;

  const MaterialRenderer({this.fieldBuilders = const {}, this.formatters});

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
  Widget buildApp(
    BuildContext context,
    AppDefinition definition,
    HatakeRouter router,
  ) {
    return _MaterialAppShell(app: definition, router: router);
  }
}
