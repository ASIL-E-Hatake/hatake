import 'package:equatable/equatable.dart';

import 'action_error_definition.dart';
import 'action_prompt_definition.dart';
import 'action_scopes.dart';
import 'action_success_definition.dart';
import 'action_types.dart';
import 'app_navigation.dart';
import 'batch_size.dart';
import 'confirm_definition.dart';
import 'row_limit.dart';

/// A page-level or row-level action (button / menu item).
class ActionDefinition extends Equatable {
  /// Stable identifier, referenced by e.g. `TableDefinition.rowActions`.
  final String id;

  /// Action type (see [ActionTypes]). Open string, plugin-extensible.
  final String type;

  /// Display label.
  final String label;

  /// What the action runs on (see [ActionScopes]). `page` acts on the screen;
  /// `selection` acts on the rows the user checked — which is also what makes
  /// the table selectable, so a checkbox column can never appear with nothing
  /// to do, and a bulk button can never appear with no way to choose rows.
  final String scope;

  /// When [type] is `plugin`, the registered action plugin key to invoke.
  final String? plugin;

  /// Ask before running. A `delete` action asks even when this is null.
  final ConfirmDefinition? confirm;

  /// What to do once it succeeded (message / navigation). Not run on failure.
  final ActionSuccessDefinition? onSuccess;

  /// What the user is told when it failed. Null = the reason is shown as the
  /// system reported it.
  final ActionErrorDefinition? onError;

  /// Asked before it runs (a small form). Its values reach the handler as
  /// `ActionContext.input`, and its OK **replaces** the confirmation dialog.
  final ActionPromptDefinition? prompt;

  /// How many rows one press may act on, for `scope: selection`.
  ///
  /// 業務の決めごと（「承認は20件まで、管理者は上限なし」）。上限を超えて選んでいる間、
  /// ボタンは**押せない**（件数と上限をラベルに出す）。切り詰めて実行はしない＝選んだ
  /// うちの一部だけが動いたことに気づけないのが一番まずい。null = 上限を決めていない
  /// （選べるのは画面に出ている行だけなので、実際の上限は1ページの件数になる）。
  ///
  /// 役割で変わる上限は [RowLimit.byRole]。実際の上限は
  /// `maxRows?.forRoles(roles)` で決まる（null なら上限なし）。
  final RowLimit? maxRows;

  /// `scope: selection` のとき、**1回のハンドラ呼び出しに渡す件数**。
  ///
  /// 書かなければ、選んだ行を**全部まとめて1回**渡す（呼ぶのは1回＝一括の既定）。
  /// 書くと**枠組みが回す側**になるので、「どこまで進んだか」を出せて、**区切りで
  /// 止められる**。1回で送ってしまうと、枠組みには途中の状態が分からない
  /// （だから進み具合も中断も、区切りが在るときだけの機能）。
  ///
  /// 止めたぶん・送らなかったぶんは [ActionOutcome.skipped] として報告に出る
  /// （文言の `{skipped}` に入る）。
  ///
  /// 役割で変わる件数は [BatchSize.byRole]。実際の件数は
  /// `batchSize?.forRoles(roles)`（当てはまる役割が複数なら**一番小さい**方＝
  /// `maxRows` とは逆。上限は権限の広さ、区切りは1回に押し付ける量なので）。
  final BatchSize? batchSize;

  /// 押せるのは、この条件に合っているときだけ（条件の書き方は `visibleWhen` と同じ）。
  ///
  /// **判定する相手は置き場所で決まる**:
  ///   ・行アクション … その行のレコード
  ///   ・`scope: selection` … 選んだ行**全部**（1件でも合わなければ押せない＝選んだ
  ///     うちの一部だけが動くのを作らない。`maxRows` を超えたときと同じ考え方）
  ///   ・入力する画面（`form` / `wizard`）… **いま入力されている値**（保存前。計算
  ///     した項目も含む。`{ mode: create }` / `{ mode: edit }` も判定できる）
  ///   ・読むだけの画面（`detail`）… いま開いているレコード
  ///   ・判定する相手が無い画面のボタン … **押せるまま**（出し分けられないので
  ///     出し分けない。書いても効かないことは `hatake validate` が言う）
  ///
  /// 権限（[roles]）との違いは「見えるかどうか」と「いま押せるかどうか」。権限で
  /// 隠すものは最初から出ないが、こちらは**出たまま灰色になる**（その操作が在ること
  /// 自体は分かる形にしておく）。
  final Map<String, Object?>? enabledWhen;

  /// Plugin / renderer specific extra configuration.
  final Map<String, Object?> config;

  /// 遷移のボタンが**どこに開くか**（[ActionOpen]。`type: navigate` のとき）。
  ///
  /// 既定は `same`＝いまの画面の続きとして進む。`tab` は「一覧を残したまま個別を開く」
  /// ＝業務の意図なので定義に書ける。並べる場所が無いアプリ（`navigation: single`）では
  /// 効かない（`validate` が言う）。
  final String open;

  /// Roles allowed to use this action (see `isAllowed`). Empty = everyone.
  final List<String> roles;

  const ActionDefinition({
    required this.id,
    required this.type,
    required this.label,
    this.scope = ActionScopes.page,
    this.plugin,
    this.confirm,
    this.onSuccess,
    this.onError,
    this.prompt,
    this.maxRows,
    this.batchSize,
    this.enabledWhen,
    this.config = const {},
    this.open = ActionOpen.same,
    this.roles = const [],
  });

  @override
  List<Object?> get props => [
        id,
        type,
        label,
        scope,
        plugin,
        confirm,
        onSuccess,
        onError,
        prompt,
        maxRows,
        batchSize,
        enabledWhen,
        config,
        open,
        roles,
      ];
}
