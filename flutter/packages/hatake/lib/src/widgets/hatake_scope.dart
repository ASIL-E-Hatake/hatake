import 'package:flutter/widgets.dart';
import 'package:hatake_core/hatake_core.dart';

import '../renderer/renderer.dart';
import '../runtime/action_registry.dart';
import '../runtime/repository_registry.dart';

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

  HatakeScope({
    super.key,
    required this.repositories,
    required this.renderer,
    ValidatorRegistry? validators,
    ConverterRegistry? converters,
    ActionRegistry? actions,
    required super.child,
  })  : validators = validators ?? ValidatorRegistry(),
        converters = converters ?? ConverterRegistry(),
        actions = actions ?? ActionRegistry();

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
        oldWidget.actions != actions;
  }
}
