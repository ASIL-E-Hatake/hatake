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

/// そのボタンが**いま押せるか**（`enabledWhen`）。
///
/// 判定する相手は置き場所で決まる（[ActionDefinition.enabledWhen] に書いてある）。
/// 相手が無ければ**押せるまま**にする＝出し分けられないので出し分けない（書いても
/// 効かないことは `hatake validate` が言う）。
class _ActionEnabled {
  final bool enabled;

  /// 選んだ行のうち、条件に合わない行の数（一括のときだけ）。
  final int failing;

  /// 条件が見ている項目（押せない理由を言うのに使う）。
  final List<String> fields;

  const _ActionEnabled(this.enabled, {this.failing = 0, this.fields = const []});
}

/// [action] を [record]（1件）か [rows]（選んだ行）に対して判定する。
///
/// 一括は**全部満たすときだけ押せる**（1件でも合わなければ押せない）。選んだうちの
/// 一部だけが動いたことに、押した人は気づけないので（`maxRows` と同じ考え方）。
_ActionEnabled _actionEnabled(
  ActionDefinition action, {
  DataRecord? record,
  List<DataRecord>? rows,
  String? mode,
}) {
  final condition = action.enabledWhen;
  if (condition == null || condition.isEmpty) return const _ActionEnabled(true);
  final fields = conditionFieldNames(condition);
  if (rows != null) {
    final failing = rows
        .where((row) => !evaluateCondition(condition, row, mode: mode))
        .length;
    return _ActionEnabled(failing == 0, failing: failing, fields: fields);
  }
  if (record == null) return _ActionEnabled(true, fields: fields);
  return _ActionEnabled(
    evaluateCondition(condition, record, mode: mode),
    fields: fields,
  );
}

/// 押せない理由（**何の状態で決まるのか**まで言う）。
///
/// 文言を書かせない＝定義から出す。項目の業務名が分かるなら業務名で言う（[labels]）。
String _whyDisabled(_ActionEnabled state, Map<String, String> labels) {
  if (state.fields.isEmpty) return 'いまは押せません';
  final named = state.fields.map((one) => labels[one] ?? one).join(' / ');
  return 'いまは押せません（$named によります）';
}

/// 押せないボタンに理由を添える（押せるときはそのまま）。
Widget _withReason(
  Widget button,
  _ActionEnabled state,
  Map<String, String> labels,
) =>
    state.enabled
        ? button
        : Tooltip(message: _whyDisabled(state, labels), child: button);

List<Widget> _pageActionButtons(
  BuildContext context,
  List<ActionDefinition> actions,
  ChangeNotifier controller, {
  DataRecord? record,
  _PageDataRunner? onExport,
  _PageDataRunner? onPrint,
  /// 項目名 → 業務名（押せない理由を業務の言葉で言うため）。
  Map<String, String> labels = const {},
}) {
  final roles = HatakeScope.of(context).roles;
  final out = <Widget>[];
  for (final action in actions) {
    if (!isAllowed(action.roles, roles)) continue;
    // レコードが在る画面（form / detail）はその1件で判定する。無い画面では
    // 出し分けない（判定する相手が無い＝押せるまま）。
    final state = _actionEnabled(action, record: record);
    out.add(_withReason(
      FilledButton(
        key: Key('hatake.action.${action.id}'),
        onPressed: state.enabled
            ? () => _runPageAction(context, action, controller,
                record: record, onExport: onExport, onPrint: onPrint)
            : null,
        child: Text(action.label),
      ),
      state,
      labels,
    ));
    out.add(const SizedBox(width: 8));
  }
  return out;
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
    /// 1回ぶん（区切り1つぶん）を呼ぶ。
    ///
    /// 何も言わずに戻った＝うまくいった。一括なら渡した行数を件数として扱う
    /// （`{count}` がハンドラの手間ゼロで埋まる）。
    Future<ActionOutcome> call(List<DataRecord> rows) async {
      ActionOutcome? reported;
      await handler(ActionContext(
        buildContext: context,
        controller: controller,
        action: action,
        record: record,
        records: rows,
        input: input,
        report: (outcome) => reported = outcome,
      ));
      return reported ?? ActionOutcome(succeeded: rows.length);
    }

    // 区切って実行するなら、**枠組みが回す側**になる（進み具合を出して、区切りで
    // 止められる）。区切りが1回で終わるなら今までと同じ＝ダイアログは出さない
    // （出しても一瞬で消えるだけで、読む間が無い）。
    final batchSize = action.batchSize;
    final batched = action.scope == ActionScopes.selection &&
        batchSize != null &&
        records.length > batchSize;
    final outcome = batched
        ? await _BulkRunner(
            context: context,
            action: action,
            records: records,
            batchSize: batchSize,
            runBatch: call,
          ).run()
        : await call(records);
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
