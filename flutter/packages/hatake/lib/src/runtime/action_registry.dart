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

  /// The rows the user had checked, for an action declared with
  /// `scope: selection`. Empty for every other action.
  ///
  /// Full records, not keys: a bulk handler usually needs a field or two to
  /// decide (状態・金額), and making it read them back one by one would turn one
  /// button into N requests.
  final List<DataRecord> records;

  const ActionContext({
    required this.buildContext,
    required this.controller,
    required this.action,
    this.record,
    this.records = const [],
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

  /// 登録されているプラグインの名前。組み込みのプラグインアクションは無いので、
  /// 全部がアプリの登録（`registrySnapshot` が使う）。
  List<String> get customKeys => _handlers.keys.toList()..sort();
}
