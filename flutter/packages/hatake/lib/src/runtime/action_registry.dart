import 'package:flutter/widgets.dart';
import 'package:hatake_core/hatake_core.dart';

/// A row a bulk handler could not get through.
///
/// The key is what the definition uses to point at a row (`page.key`), so the
/// framework can put it in a message or tick the row again — without knowing
/// anything about the business.
class FailedRow {
  /// The value of the page's key field for that row.
  final Object? key;

  /// Why that row failed, in the business's words. Null when the handler has
  /// nothing to add beyond "this one did not go through".
  final String? reason;

  const FailedRow(this.key, {this.reason});
}

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

  /// The rows it could not, **named**. Empty when the handler only counted.
  ///
  /// 「3件失敗しました」だけでは、現場は全部やり直すしかない。名指しできれば、
  /// その3件だけ直せる（文言の `{failedKeys}` に入り、画面でも選び直せる）。
  ///
  /// May be shorter than [failed]: a handler that knows 3 failed but can only
  /// name 1 says so, and the framework reports "1 of 3 が分かっています"
  /// rather than pretending the other 2 do not exist.
  final List<FailedRow> rows;

  const ActionOutcome({
    this.succeeded = 0,
    this.failed = 0,
    this.rows = const [],
  });

  /// The usual shape when the handler knows which rows failed: the count comes
  /// from the rows, so the two can never disagree.
  factory ActionOutcome.rejected({
    int succeeded = 0,
    required List<FailedRow> rows,
  }) =>
      ActionOutcome(succeeded: succeeded, failed: rows.length, rows: rows);

  /// Nothing failed. `onSuccess` runs.
  bool get isSuccess => failed == 0;

  /// Some worked and some did not. **`onSuccess` does not run**: moving on from
  /// a screen where 1 of 5 rows failed hides the one that needs attention.
  bool get isPartial => failed > 0 && succeeded > 0;

  int get total => succeeded + failed;

  /// The keys of the named rows, without the ones that have no key.
  ///
  /// A row with no key cannot be named in a message (there is nothing to
  /// write), so it is left out here and only shows in the list on screen.
  List<Object?> get failedKeys =>
      [for (final row in rows) if (row.key != null) row.key];

  /// Every failure is named（部分的にしか分かっていないなら、そう言うため）。
  bool get namesEveryFailure => rows.length >= failed;
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

  /// What the user typed into the action's `prompt`, keyed by field name.
  ///
  /// Empty when the action has no prompt. The values went through the same
  /// validation as a form (`required` / `validators` / `computed`), so a handler
  /// does not re-check what the definition already said.
  final DataRecord input;

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
  /// ctx.report(ActionOutcome.rejected(
  ///   succeeded: ctx.records.length - rejected.length,
  ///   // 行を名指しできるなら、そうする（画面で「どの行か」が出る）。
  ///   rows: [for (final one in rejected) FailedRow(one.orderNo, reason: one.why)],
  /// ));
  /// ```
  final void Function(ActionOutcome outcome) report;

  const ActionContext({
    required this.buildContext,
    required this.controller,
    required this.action,
    this.record,
    this.records = const [],
    this.input = const {},
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
