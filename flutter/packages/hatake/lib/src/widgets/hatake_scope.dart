import 'package:flutter/widgets.dart';
import 'package:hatake_core/hatake_core.dart';

import '../renderer/renderer.dart';
import '../runtime/action_registry.dart';
import '../runtime/export_sink.dart';
import '../runtime/print_sink.dart';
import '../runtime/repository_registry.dart';
import '../runtime/sub_table_controller.dart';

/// Builds the runtime for a repository-backed `subTable` field. Renderers get
/// one of these from [HatakeScope.subTableController] so they never resolve
/// repositories themselves; it is a plain function so it can also be passed
/// into dialog routes, which sit outside the scope's subtree.
typedef SubTableControllerFactory = SubTableController Function(
  FieldDefinition field,
  Object? parentKey,
);

/// Provides the active [Renderer], [RepositoryRegistry], and the plugin
/// registries ([ValidatorRegistry], [ActionRegistry]) to the widget tree.
///
/// Wrap the part of your app that renders hatake pages in a [HatakeScope].
class HatakeScope extends InheritedWidget {
  final RepositoryRegistry repositories;
  final Renderer renderer;

  /// Validators available to forms. Register custom validators here to extend
  /// the framework without modifying it.
  final ValidatorRegistry validators;

  /// Converters used to normalize field input before validation/persistence.
  final ConverterRegistry converters;

  /// Handlers for `type: plugin` actions.
  final ActionRegistry actions;

  /// Receives the documents `type: export` actions produce (CSV and friends).
  /// Null = no sink, and an export says so instead of silently doing nothing:
  /// the framework builds the text but never performs I/O.
  final ExportSink? exportSink;

  /// Receives the reports `type: print` actions want on paper. Null = no sink,
  /// and a print action says so instead of silently doing nothing.
  ///
  /// The framework hands over the report and its rows; making bytes out of them
  /// is an opt-in adapter's job (`hatake_print`), and printing them is platform
  /// I/O. Neither is something this package knows how to do — which is why an
  /// app that never prints carries no printing code at all.
  final PrintSink? printSink;

  /// Roles of the current user, used to gate fields/columns/actions declared
  /// with `roles` (see `isAllowed`). Empty = the user has no roles, so anything
  /// with a non-empty `roles` is hidden. UI-level display gating only — real
  /// authorization stays outside the framework.
  final Set<String> roles;

  HatakeScope({
    super.key,
    required this.repositories,
    required this.renderer,
    ValidatorRegistry? validators,
    ConverterRegistry? converters,
    ActionRegistry? actions,
    this.exportSink,
    this.printSink,
    Set<String>? roles,
    required super.child,
  })  : validators = validators ?? ValidatorRegistry(),
        converters = converters ?? ConverterRegistry(),
        actions = actions ?? ActionRegistry(),
        roles = roles ?? const {};

  /// Runtime for a repository-backed `subTable` [field] under the parent record
  /// identified by [parentKey] (null while the parent is unsaved). The caller
  /// owns the returned controller and must dispose it.
  SubTableController subTableController(
    FieldDefinition field,
    Object? parentKey,
  ) {
    return SubTableController(
      field: field,
      repository: repositories.resolve(field.source!.repository),
      parentKey: parentKey,
      validator: FormValidator(validators),
    );
  }

  static HatakeScope of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<HatakeScope>();
    assert(scope != null, 'No HatakeScope found in the widget tree.');
    return scope!;
  }

  @override
  bool updateShouldNotify(HatakeScope oldWidget) {
    return oldWidget.repositories != repositories ||
        oldWidget.renderer != renderer ||
        oldWidget.validators != validators ||
        oldWidget.converters != converters ||
        oldWidget.actions != actions ||
        oldWidget.exportSink != exportSink ||
        oldWidget.printSink != printSink ||
        oldWidget.roles != roles;
  }
}
