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
}) {
  if (onSuccess == null) return;
  final message = onSuccess.message;
  if (message != null) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
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
