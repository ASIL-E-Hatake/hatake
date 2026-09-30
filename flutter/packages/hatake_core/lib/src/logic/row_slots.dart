import '../definition/action_definition.dart';
import '../definition/action_scopes.dart';
import '../definition/action_types.dart';
import 'access.dart';

/// 表の行の右端に出るもの1つ。
///
/// [kind] は `edit` / `delete`（組み込み）か `action`（定義したボタン）。
class RowSlot {
  /// `edit` / `delete` / `action`。
  final String kind;

  /// 組み込みなら**宣言**（`type: edit` / `type: delete` の action。無ければ null）、
  /// 定義したボタンならそのボタン。宣言の `enabledWhen` / `confirm` / `onSuccess` を
  /// 効かせるのに使う。
  final ActionDefinition? action;

  const RowSlot(this.kind, this.action);

  /// 定義したボタンの印。
  static const String actionKind = 'action';
}

/// 組み込みの行の操作（`edit` / `delete`）の**宣言**。`type` で引く。
///
/// id は業務の言葉で付けてよい（`{ id: remove, type: delete }`）ので、id では引かない。
/// 0.9.21 まで Flutter だけが id で引いていて、`type: delete` に書いた `confirm` が
/// id を `delete` にしていないと効かなかった（Web は `type` で引いていた）。
ActionDefinition? builtInDeclaration(
  List<ActionDefinition> actions,
  String type,
) {
  for (final action in actions) {
    if (action.type == type) return action;
  }
  return null;
}

/// 行の右端に出すもの（**`table.rowActions` の並び順**）。
///
/// Web 版（`@hatake-fw/runtime` の `rowSlots`）と同じ答えになることは
/// `spec/conformance/row_slots.json` が見ている。
///
///   ・組み込みの `edit` / `delete` は、宣言が無くても出す（画面の機能）。宣言が在れば
///     その `roles` が効く＝**見せない役割には出さない**。0.9.21 まで Flutter は宣言の
///     `roles` を見ておらず、`roles: [admin]` と書いても誰にでも出ていた
///   ・定義したボタンは、同じ id の宣言が在って、その役割に見せてよく、行に出せる
///     （`scope: selection` でない）ものだけ
List<RowSlot> rowSlots(
  List<String> rowActionIds,
  List<ActionDefinition> actions,
  Set<String> roles,
) {
  final out = <RowSlot>[];
  for (final id in rowActionIds) {
    if (id == ActionTypes.edit || id == ActionTypes.delete) {
      final declaration = builtInDeclaration(actions, id);
      if (declaration != null && !isAllowed(declaration.roles, roles)) continue;
      out.add(RowSlot(id, declaration));
      continue;
    }
    ActionDefinition? found;
    for (final action in actions) {
      if (action.id == id) {
        found = action;
        break;
      }
    }
    if (found == null || found.scope == ActionScopes.selection) continue;
    if (!isAllowed(found.roles, roles)) continue;
    out.add(RowSlot(RowSlot.actionKind, found));
  }
  return out;
}
