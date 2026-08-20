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
/// `navigate` moves through the router, `plugin` delegates to the registered
/// handler. Anything else is reported rather than silently ignored.
Future<void> _runPageAction(
  BuildContext context,
  ActionDefinition action,
  ChangeNotifier controller, {
  DataRecord? record,
  _PageDataRunner? onExport,
  _PageDataRunner? onPrint,
  Future<void> Function()? onCreate,
}) async {
  if (!await _confirmAction(context, action.confirm)) return;
  if (!context.mounted) return;
  if (!await _dispatchAction(context, action, controller,
      record: record,
      onExport: onExport,
      onPrint: onPrint,
      onCreate: onCreate)) {
    return;
  }
  if (!context.mounted) return;
  _afterActionSuccess(context, action.onSuccess, record: record);
}

/// The action itself. Returns whether it succeeded (so `onSuccess` does not run
/// after a missing handler or a page that cannot export).
Future<bool> _dispatchAction(
  BuildContext context,
  ActionDefinition action,
  ChangeNotifier controller, {
  DataRecord? record,
  _PageDataRunner? onExport,
  _PageDataRunner? onPrint,
  Future<void> Function()? onCreate,
}) async {
  if (action.type == ActionTypes.create) {
    if (onCreate == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('アクション "${action.id}" はこのページでは使えません')),
      );
      return false;
    }
    await onCreate();
    // フォームを開いただけ＝まだ結果は出ていないので onSuccess は動かさない
    // （保存できたかどうかは、この時点では分からない）。
    return false;
  }
  if (action.type == ActionTypes.navigate) {
    _navigateAction(context, action, record: record);
    return true;
  }
  if (action.type == ActionTypes.plugin) {
    final registry = HatakeScope.of(context).actions;
    final handler =
        action.plugin == null ? null : registry.resolve(action.plugin!);
    if (handler == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('アクション "${action.id}" のハンドラが未登録です')),
      );
      return false;
    }
    await handler(ActionContext(
      buildContext: context,
      controller: controller,
      action: action,
      record: record,
    ));
    return true;
  }
  if (action.type == ActionTypes.export) {
    // Only pages with rows can export; say so rather than nothing.
    if (onExport == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('アクション "${action.id}" はこのページでは出力できません')),
      );
      return false;
    }
    return onExport(context, action);
  }
  if (action.type == ActionTypes.print) {
    // 刷れるのは帳票だけ（紙の形は report が決めるので、report が無ければ紙が無い）。
    if (onPrint == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('アクション "${action.id}" はこのページでは刷れません'
            '（type: print は帳票の画面だけ）')),
      );
      return false;
    }
    return onPrint(context, action);
  }
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(content: Text('アクション "${action.id}" は未実装です')),
  );
  return false;
}
