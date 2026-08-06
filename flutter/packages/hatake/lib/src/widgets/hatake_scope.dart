import 'package:flutter/widgets.dart';
import 'package:hatake_core/hatake_core.dart';

import '../renderer/renderer.dart';
import '../runtime/action_registry.dart';
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
        oldWidget.roles != roles;
  }
}
