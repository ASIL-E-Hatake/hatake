part of '../material_renderer.dart';

/// Page-level action buttons, gated by the current user's roles.
///
/// Every page kind declares `actions`; this keeps the button row and the
/// dispatch in one place instead of once per page renderer.
/// Runs an action that needs the page's own data — `export` (rows to a file)
/// and `print` (a report to paper). The page hands one of these in, so the
/// dispatch below never has to know which page kind it is looking at.
typedef _PageDataRunner = Future<bool> Function(
  BuildContext context,
  ActionDefinition action,
);

List<Widget> _pageActionButtons(
  BuildContext context,
  List<ActionDefinition> actions,
  ChangeNotifier controller, {
  DataRecord? record,
  _PageDataRunner? onExport,
  _PageDataRunner? onPrint,
}) {
  final roles = HatakeScope.of(context).roles;
  return [
    for (final action in actions)
      if (isAllowed(action.roles, roles)) ...[
        FilledButton(
          key: Key('hatake.action.${action.id}'),
          onPressed: () => _runPageAction(context, action, controller,
              record: record, onExport: onExport, onPrint: onPrint),
          child: Text(action.label),
        ),
        const SizedBox(width: 8),
      ],
  ];
}

/// Runs an action, with its declared hooks around it: `confirm` first, then the
/// action itself, then `onSuccess` — and `onSuccess` only when it worked.
///
/// Returns whether the action ran, so a caller that owns state around it (a
/// table's row selection) can react to success without guessing.
///
/// `navigate` moves through the router, `plugin` delegates to the registered
/// handler. Anything else is reported rather than silently ignored.
Future<bool> _runPageAction(
  BuildContext context,
  ActionDefinition action,
  ChangeNotifier controller, {
  DataRecord? record,
  List<DataRecord> records = const [],
  _PageDataRunner? onExport,
  _PageDataRunner? onPrint,
  Future<void> Function()? onCreate,
  void Function(List<Object?> keys)? onSelectFailed,
}) async {
  // 選んだ行にまとめて実行するなら、押す前に**何件動くのか**が分かっている。
  // 確認の文の `{count}` はここで埋まる（1件ずつのボタンでは埋めない＝件数が無い）。
  final count =
      action.scope == ActionScopes.selection ? records.length : null;
  // 聞くことがあるなら、その OK が確認そのもの（ダイアログを2枚出さない）。
  var input = const <String, Object?>{};
  if (action.prompt != null) {
    final answer = await _askActionPrompt(context, action, count: count);
    if (answer == null) return false; // キャンセル＝何も起きない
    input = answer;
  } else if (!await _confirmAction(context, action.confirm, count: count)) {
    return false;
  }
  if (!context.mounted) return false;
  final outcome = await _dispatchAction(context, action, controller,
      record: record,
      records: records,
      input: input,
      onExport: onExport,
      onPrint: onPrint,
      onCreate: onCreate,
      onSelectFailed: onSelectFailed);
  // null = 実行できなかった／失敗した。何が起きたかは dispatch が既に言っている
  // （言う場所を1つにしないと、失敗の文言が種類ごとに散る）。
  if (outcome == null) return false;
  if (!context.mounted) return true;
  _afterActionSuccess(context, action.onSuccess,
      record: record, outcome: outcome);
  return true;
}

/// The action itself.
///
/// Returns the outcome when it ran, or **null** when it did not — a missing
/// handler, a page that cannot export, a thrown failure, or a bulk run that came
/// back with failures. Null is what stops `onSuccess`.
///
/// Every failure is reported **here**: one place decides how a failure is worded
/// (and lets the definition's `onError` replace it), instead of each runner
/// inventing its own snackbar.
Future<ActionOutcome?> _dispatchAction(
  BuildContext context,
  ActionDefinition action,
  ChangeNotifier controller, {
  DataRecord? record,
  List<DataRecord> records = const [],
  DataRecord input = const {},
  _PageDataRunner? onExport,
  _PageDataRunner? onPrint,
  Future<void> Function()? onCreate,
  void Function(List<Object?> keys)? onSelectFailed,
}) async {
  try {
    return await _dispatch(context, action, controller,
        record: record,
        records: records,
        input: input,
        onExport: onExport,
        onPrint: onPrint,
        onCreate: onCreate,
        onSelectFailed: onSelectFailed);
  } catch (error) {
    // 例外を外に投げると、押しても何も起きない（Flutter のログにだけ出る）。
    if (context.mounted) _showActionFailure(context, action, error: error);
    return null;
  }
}

Future<ActionOutcome?> _dispatch(
  BuildContext context,
  ActionDefinition action,
  ChangeNotifier controller, {
  DataRecord? record,
  List<DataRecord> records = const [],
  DataRecord input = const {},
  _PageDataRunner? onExport,
  _PageDataRunner? onPrint,
  Future<void> Function()? onCreate,
  void Function(List<Object?> keys)? onSelectFailed,
}) async {
  // 選んだ行に対して実行できるのは、いまはアプリ側の処理（plugin）だけ。
  // 「消す」を複数まとめるのは、取り消せない操作の事故を大きくするので入れていない。
  if (action.scope == ActionScopes.selection &&
      action.type != ActionTypes.plugin) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('アクション "${action.id}" は選んだ行に対しては'
          '実行できません（scope: selection は type: plugin だけ）')),
    );
    return null;
  }
  if (action.type == ActionTypes.create) {
    if (onCreate == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('アクション "${action.id}" はこのページでは使えません')),
      );
      return null;
    }
    await onCreate();
    // フォームを開いただけ＝まだ結果は出ていないので onSuccess は動かさない
    // （保存できたかどうかは、この時点では分からない）。
    return null;
  }
  if (action.type == ActionTypes.navigate) {
    _navigateAction(context, action, record: record);
    return const ActionOutcome();
  }
  if (action.type == ActionTypes.plugin) {
    final registry = HatakeScope.of(context).actions;
    final handler =
        action.plugin == null ? null : registry.resolve(action.plugin!);
    if (handler == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('アクション "${action.id}" のハンドラが未登録です')),
      );
      return null;
    }
    ActionOutcome? reported;
    await handler(ActionContext(
      buildContext: context,
      controller: controller,
      action: action,
      record: record,
      records: records,
      input: input,
      report: (outcome) => reported = outcome,
    ));
    // 何も言わずに戻った＝うまくいった。一括なら渡した行数を件数として扱う
    // （`{count}` がハンドラの手間ゼロで埋まる）。
    final outcome =
        reported ?? ActionOutcome(succeeded: records.length);
    if (outcome.isSuccess) return outcome;
    // 全部だめ・一部だめ。**一部でも onSuccess は動かさない**（1件失敗したまま
    // 画面を移すと、直すべき行が視界から消える）。
    if (context.mounted) {
      _showActionFailure(context, action,
          outcome: outcome, onSelectFailed: onSelectFailed);
    }
    return null;
  }
  if (action.type == ActionTypes.export) {
    // Only pages with rows can export; say so rather than nothing.
    if (onExport == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('アクション "${action.id}" はこのページでは出力できません')),
      );
      return null;
    }
    return await onExport(context, action) ? const ActionOutcome() : null;
  }
  if (action.type == ActionTypes.print) {
    // 刷れるのは帳票だけ（紙の形は report が決めるので、report が無ければ紙が無い）。
    if (onPrint == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('アクション "${action.id}" はこのページでは刷れません'
            '（type: print は帳票の画面だけ）')),
      );
      return null;
    }
    return await onPrint(context, action) ? const ActionOutcome() : null;
  }
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(content: Text('アクション "${action.id}" は未実装です')),
  );
  return null;
}
