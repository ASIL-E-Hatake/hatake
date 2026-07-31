import 'package:flutter/widgets.dart';
import 'package:hatake_core/hatake_core.dart';

/// Context handed to a plugin action handler when it runs.
class ActionContext {
  /// A build context valid at the moment the action fired (for dialogs,
  /// snackbars, navigation, ...).
  final BuildContext buildContext;

  /// The controller of the page that triggered the action (a `CrudController`,
  /// `ListController`, or `DetailController` — all are [ChangeNotifier]s).
  /// Cast to the concrete type if you need its methods (e.g. `load()`).
  final ChangeNotifier controller;

  /// The action definition that fired.
  final ActionDefinition action;

  /// The row the action applies to, for row-level actions; null for
  /// page-level actions.
  final DataRecord? record;

  const ActionContext({
    required this.buildContext,
    required this.controller,
    required this.action,
    this.record,
  });
}

/// A plugin action implementation.
typedef ActionHandler = Future<void> Function(ActionContext context);

/// Resolves `type: plugin` action keys to handlers.
///
/// The framework ships no side-effecting actions; applications and plugins
/// register their own here and provide the registry through `HatakeScope`.
class ActionRegistry {
  final Map<String, ActionHandler> _handlers;

  ActionRegistry([Map<String, ActionHandler>? handlers])
      : _handlers = {...?handlers};

  /// Returns the handler registered under [key], or null if none.
  ActionHandler? resolve(String key) => _handlers[key];

  /// Registers (or replaces) a handler.
  void register(String key, ActionHandler handler) => _handlers[key] = handler;

  bool contains(String key) => _handlers.containsKey(key);
}
