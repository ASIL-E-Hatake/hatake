part of '../material_renderer.dart';

/// Page-level action buttons, gated by the current user's roles.
///
/// Every page kind declares `actions`; this keeps the button row and the
/// dispatch in one place instead of once per page renderer.
/// Handles an `export` action for a page that has rows to export.
typedef _ExportRunner = Future<void> Function(
  BuildContext context,
  ActionDefinition action,
);

List<Widget> _pageActionButtons(
  BuildContext context,
  List<ActionDefinition> actions,
  ChangeNotifier controller, {
  DataRecord? record,
  _ExportRunner? onExport,
}) {
  final roles = HatakeScope.of(context).roles;
  return [
    for (final action in actions)
      if (isAllowed(action.roles, roles)) ...[
        FilledButton(
          key: Key('hatake.action.${action.id}'),
          onPressed: () => _runPageAction(context, action, controller,
              record: record, onExport: onExport),
          child: Text(action.label),
        ),
        const SizedBox(width: 8),
      ],
  ];
}

/// Runs a page-level action: `navigate` moves through the router, `plugin`
/// delegates to the registered handler. Anything else is reported rather than
/// silently ignored.
Future<void> _runPageAction(
  BuildContext context,
  ActionDefinition action,
  ChangeNotifier controller, {
  DataRecord? record,
  _ExportRunner? onExport,
}) async {
  if (action.type == ActionTypes.navigate) {
    _navigateAction(context, action, record: record);
    return;
  }
  if (action.type == ActionTypes.plugin) {
    final registry = HatakeScope.of(context).actions;
    final handler =
        action.plugin == null ? null : registry.resolve(action.plugin!);
    if (handler == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('アクション "${action.id}" のハンドラが未登録です')),
      );
      return;
    }
    await handler(ActionContext(
      buildContext: context,
      controller: controller,
      action: action,
      record: record,
    ));
    return;
  }
  if (action.type == ActionTypes.export) {
    // Only pages with rows can export; say so rather than nothing.
    if (onExport == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('アクション "${action.id}" はこのページでは出力できません')),
      );
      return;
    }
    await onExport(context, action);
    return;
  }
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(content: Text('アクション "${action.id}" は未実装です')),
  );
}
