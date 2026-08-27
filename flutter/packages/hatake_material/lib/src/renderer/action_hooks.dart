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
///
/// [count] は「いま選んでいる行の数」。一括（`scope: selection`）のときだけ渡す。
/// **押す前に分かっているのは件数だけ**なので、埋まるのは `{count}` だけ
/// （`{failed}` / `{total}` / `{error}` は走ってからの話＝`hatake validate` が言う）。
Future<bool> _confirmAction(
  BuildContext context,
  ConfirmDefinition? confirm, {
  bool destructive = false,
  int? count,
}) async {
  if (confirm == null && !destructive) return true;
  final danger = confirm?.danger ?? destructive;
  final theme = Theme.of(context);
  final answer = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      key: const Key('hatake.confirm'),
      title: Text(_fillCount(confirm?.title, count) ??
          (danger ? '確認' : '実行の確認')),
      content: Text(_fillCount(confirm?.message, count) ??
          'この操作を実行してもよろしいですか？'),
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
  void Function(List<Object?> keys)? onSelectFailed,
}) {
  // 失敗が1件も無くて、送っていないぶんが在るだけ＝**止めた**（失敗ではない）。
  // そこに `onError` の文言（「承認できませんでした」）を出すのは嘘なので、枠組みの
  // 言葉で言う。失敗も混ざっているなら失敗なので、定義の文言を使う。
  final stoppedOnly =
      outcome != null && outcome.failed == 0 && outcome.skipped > 0;
  final declared = stoppedOnly ? null : action.onError?.message;
  final message = declared != null
      ? _fillActionMessage(declared, error: error, outcome: outcome)
      : _defaultFailureMessage(action, error: error, outcome: outcome);
  // 行を名指しできているなら、**どの行か**を開ける口を付ける。文言に入れるのは
  // アプリの選択（`{failedKeys}`）なので、入れていなくても行は追える。
  final named = outcome?.rows ?? const <FailedRow>[];
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(
    content: Text(message),
    action: named.isEmpty
        ? null
        : SnackBarAction(
            label: 'どの行か',
            onPressed: () {
              if (!context.mounted) return;
              _showFailedRows(context, action, outcome!,
                  onSelectFailed: onSelectFailed);
            },
          ),
  ));
}

/// 失敗した行を1件ずつ見せる。
///
/// 件数だけ言われても、現場は**全部やり直す**しかない。名指しできているなら、その行
/// だけを直せる。理由は行ごとに違うことがある（1件は締め済み、1件は在庫切れ）ので、
/// 1行にまとめずに並べる。
///
/// [onSelectFailed] を渡せる画面（表を持つ画面）では「この行だけ選ぶ」も出す＝もう一度
/// 押す相手を、人が選び直さなくていい。**いま画面に無い行は選べない**（読み直しで
/// 消えた行に対して実行できてしまうのを防ぐ）ので、選び直しは画面側が絞る。
Future<void> _showFailedRows(
  BuildContext context,
  ActionDefinition action,
  ActionOutcome outcome, {
  void Function(List<Object?> keys)? onSelectFailed,
}) {
  return showDialog<void>(
    context: context,
    builder: (context) => AlertDialog(
      key: const Key('hatake.failedRows'),
      title: Text('${action.label} — 失敗した ${outcome.failed} 件'),
      content: SizedBox(
        width: 420,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (!outcome.namesEveryFailure)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(
                  'このうち ${outcome.rows.length} 件だけが分かっています'
                  '（残りはアプリ側が行を報告していません）。',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
            for (final row in outcome.rows)
              ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                title: Text('${row.key ?? "（キーが分かりません）"}'),
                subtitle: row.reason == null ? null : Text(row.reason!),
              ),
          ],
        ),
      ),
      actions: [
        if (onSelectFailed != null && outcome.failedKeys.isNotEmpty)
          TextButton(
            key: const Key('hatake.failedRows.select'),
            onPressed: () {
              onSelectFailed(outcome.failedKeys);
              Navigator.of(context).pop();
            },
            child: const Text('この行だけ選ぶ'),
          ),
        TextButton(
          key: const Key('hatake.failedRows.close'),
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('閉じる'),
        ),
      ],
    ),
  );
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
  if (outcome != null && (outcome.failed > 0 || outcome.skipped > 0)) {
    // 「実行していない」は失敗ではない（もう一度押せば動く相手）。混ざるので、
    // どちらも数で言う＝押した人が次に何をすればいいかが読める。
    final rest = outcome.skipped > 0
        ? '${outcome.skipped} 件は実行していません'
        : null;
    if (outcome.failed == 0) {
      return '${outcome.succeeded} 件を実行しました（$rest）';
    }
    final failed = '${outcome.failed} 件失敗';
    final tail = rest == null ? failed : '$failed、$rest';
    return outcome.succeeded > 0
        ? '${outcome.succeeded} 件を実行しました（$tail）'
        : '${outcome.failed} 件すべて失敗しました${rest == null ? "" : "（$rest）"}';
  }
  return switch (action.type) {
    ActionTypes.export => '出力に失敗しました: $error',
    ActionTypes.print => '印刷に失敗しました: $error',
    _ => 'アクション "${action.id}" が失敗しました: $error',
  };
}

/// Fills `{count}` before the action runs (the number of rows the user picked).
///
/// 走る前に分かっているのは件数だけ。ここで `{failed}` を埋めないのは、まだ1件も
/// 失敗していないから＝0 と出すのは嘘になる（残った差し込みは文字のまま出るので、
/// 「埋まらなかった」と読める。`hatake validate` は押す前にそう言う）。
String? _fillCount(String? template, int? count) {
  if (template == null || count == null) return template;
  return template.replaceAll('{count}', '$count');
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
  // 送っていない件数。区切って実行して途中で止めたときだけ埋める（止めていないなら
  // 0 と出すのは嘘＝そこは文字のまま出して「当てはまらない」と読ませる）。
  final skipped = outcome?.skipped ?? 0;
  if (skipped > 0) text = text.replaceAll('{skipped}', '$skipped');
  // 行を名指しできたときだけ埋める。報告が件数だけなら文字のまま出す（`{failedKeys}`
  // が見えている＝「アプリ側が行を報告していない」と読める）。
  final keys = outcome?.failedKeys ?? const [];
  if (keys.isNotEmpty) {
    text = text.replaceAll('{failedKeys}', keys.join(', '));
  }
  return text;
}
