import 'package:flutter/widgets.dart';
import 'package:hatake_core/hatake_core.dart';

/// How a bulk handler finished: how many rows it got through, and how many it
/// could not.
///
/// A partial result is the normal case for `scope: selection` — 5 orders, one of
/// them already shipped — and it is neither a success nor a failure. Reporting
/// it lets the framework say **which** it was in the definition's own words,
/// instead of every handler inventing its own snackbar.
class ActionOutcome {
  /// Rows the handler got through.
  final int succeeded;

  /// Rows it could not (already shipped, rejected by the server, …).
  final int failed;

  const ActionOutcome({this.succeeded = 0, this.failed = 0});

  /// Nothing failed. `onSuccess` runs.
  bool get isSuccess => failed == 0;

  /// Some worked and some did not. **`onSuccess` does not run**: moving on from
  /// a screen where 1 of 5 rows failed hides the one that needs attention.
  bool get isPartial => failed > 0 && succeeded > 0;

  int get total => succeeded + failed;
}

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

  /// Tells the framework how it went, so the message the user sees comes from
  /// the definition (`onSuccess.message` / `onError.message`) instead of from
  /// the handler.
  ///
  /// Optional: a handler that either works or throws needs nothing here (a
  /// thrown error is a failure, a clean return is a success). Report when the
  /// answer is **partial** — the case a bulk action runs into constantly.
  ///
  /// ```dart
  /// final rejected = await api.approve(ctx.records);
  /// ctx.report(ActionOutcome(
  ///   succeeded: ctx.records.length - rejected.length,
  ///   failed: rejected.length,
  /// ));
  /// ```
  final void Function(ActionOutcome outcome) report;

  const ActionContext({
    required this.buildContext,
    required this.controller,
    required this.action,
    this.record,
    this.records = const [],
    this.report = _ignoreOutcome,
  });
}

/// The default for [ActionContext.report]: a handler that says nothing is taken
/// at its word (returned = worked, threw = failed).
void _ignoreOutcome(ActionOutcome outcome) {}

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
