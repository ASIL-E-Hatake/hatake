part of '../material_renderer.dart';

/// Declarative action hooks: ask before, react after.
///
/// Both live on the action in the definition, so "delete asks first" and "saved,
/// then back to the list" stop being Dart written once per screen.

/// Shows the confirmation and returns whether to go ahead.
///
/// [destructive] is for the built-in `delete`, which asks even when the
/// definition says nothing — a destructive default is the safer default, and
/// declaring `confirm` only replaces the wording.
Future<bool> _confirmAction(
  BuildContext context,
  ConfirmDefinition? confirm, {
  bool destructive = false,
}) async {
  if (confirm == null && !destructive) return true;
  final danger = confirm?.danger ?? destructive;
  final theme = Theme.of(context);
  final answer = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      key: const Key('hatake.confirm'),
      title: Text(confirm?.title ?? (danger ? '確認' : '実行の確認')),
      content: Text(confirm?.message ?? 'この操作を実行してもよろしいですか？'),
      actions: [
        TextButton(
          key: const Key('hatake.confirm.cancel'),
          onPressed: () => Navigator.of(context).pop(false),
          child: Text(confirm?.cancelLabel ?? 'キャンセル'),
        ),
        FilledButton(
          key: const Key('hatake.confirm.ok'),
          style: danger
              ? FilledButton.styleFrom(
                  backgroundColor: theme.colorScheme.error,
                  foregroundColor: theme.colorScheme.onError,
                )
              : null,
          onPressed: () => Navigator.of(context).pop(true),
          child: Text(confirm?.okLabel ?? (danger ? '削除' : 'OK')),
        ),
      ],
    ),
  );
  return answer ?? false; // 閉じられた = やらない
}

/// Runs `onSuccess`: a short message, then a move to another page.
///
/// Only called when the action actually succeeded, which is the reason for
/// declaring it instead of writing it after the call.
void _afterActionSuccess(
  BuildContext context,
  ActionSuccessDefinition? onSuccess, {
  DataRecord? record,
  ActionOutcome? outcome,
}) {
  if (onSuccess == null) return;
  final message = onSuccess.message;
  if (message != null) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(_fillActionMessage(message, outcome: outcome))),
    );
  }
  final page = onSuccess.page;
  if (page == null) return;
  final router = HatakeRouterScope.maybeOf(context);
  if (router == null) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('遷移先が解決できません（アプリ定義の外です）')),
    );
    return;
  }
  router.push(page, params: resolveRouteParams(onSuccess.params, record));
}

/// The declared action for a built-in row action id (`edit` / `delete`), if the
/// page bothered to declare one. Used to pick up its hooks.
ActionDefinition? _declaredAction(List<ActionDefinition> actions, String id) {
  for (final action in actions) {
    if (action.id == id) return action;
  }
  return null;
}

/// Tells the user the action failed, in the definition's words when it has any.
///
/// The raw reason (`RepositoryHttpException: … 500 …`) is true but useless to the
/// person holding the mouse, and the same failure means different things per
/// screen（「在庫が足りません」/「締め済みなので直せません」）. `onError.message`
/// is where that wording belongs.
///
/// **A failure never moves the screen** (unlike `onSuccess`): leaving the screen
/// that failed hides what happened, and the row to fix is still on it.
void _showActionFailure(
  BuildContext context,
  ActionDefinition action, {
  Object? error,
  ActionOutcome? outcome,
}) {
  final declared = action.onError?.message;
  final message = declared != null
      ? _fillActionMessage(declared, error: error, outcome: outcome)
      : _defaultFailureMessage(action, error: error, outcome: outcome);
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
}

/// What to say when the definition says nothing.
///
/// Keeps the wording of the thing that failed (出力 / 印刷) rather than one
/// generic sentence: the user is looking at a button, not at an action id.
String _defaultFailureMessage(
  ActionDefinition action, {
  Object? error,
  ActionOutcome? outcome,
}) {
  if (outcome != null && outcome.failed > 0) {
    return outcome.isPartial
        ? '${outcome.succeeded} 件を実行しました（${outcome.failed} 件失敗）'
        : '${outcome.failed} 件すべて失敗しました';
  }
  return switch (action.type) {
    ActionTypes.export => '出力に失敗しました: $error',
    ActionTypes.print => '印刷に失敗しました: $error',
    _ => 'アクション "${action.id}" が失敗しました: $error',
  };
}

/// Fills the placeholders a message may carry.
///
/// The count placeholders are filled **only when counts are known** (a
/// `scope: selection` action that ran). Elsewhere the template is left as it is:
/// showing `0 件を承認しました` would be a lie, and leaving `{count}` visible
/// says plainly that the placeholder did not apply. `hatake validate` says the
/// same thing before it ever runs.
String _fillActionMessage(
  String template, {
  Object? error,
  ActionOutcome? outcome,
}) {
  var text = template;
  if (error != null) text = text.replaceAll('{error}', '$error');
  if (outcome != null && outcome.total > 0) {
    text = text
        .replaceAll('{count}', '${outcome.succeeded}')
        .replaceAll('{failed}', '${outcome.failed}')
        .replaceAll('{total}', '${outcome.total}');
  }
  return text;
}
