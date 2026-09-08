import 'package:flutter/material.dart';

/// デモで「いま見ている人」を切り替える札。
///
/// 権限は**見えないことが正しい**機能なので、切り替えて見せないと伝わらない。
/// 定義には `roles` が書いてあるのに、デモは誰の役割も配っていなかった＝動いている
/// 所が誰にも見えていなかった。
///
/// **役割はアプリが配るもの**（ログイン状態）で、定義に書くのは「誰に見せるか」だけ。
/// だからこの札は定義の側ではなく、アプリの側（デモ自身の作り）に置いてある。
class DemoRole {
  /// 札の id（キーに使う。`demo.role.<id>`）。
  final String id;

  /// 画面に出す言葉。役割名（`manager`）は識別子なので、そのままでは人に出せない
  /// （定義に画面の言葉を書く場所はまだ無いので、デモ側に持っている）。
  final String label;

  /// 切り替えると何が変わるか（1行）。デモは「変わったこと」が分かって初めて意味がある。
  final String note;

  /// アプリが配る役割（`HatakeScope(roles:)` に渡すもの）。
  final Set<String> roles;

  const DemoRole({
    required this.id,
    required this.label,
    required this.note,
    required this.roles,
  });
}

/// デモが配れる役割。**アプリ側の語彙**（`knownRoles`）と揃えてある。
const demoRoles = <DemoRole>[
  DemoRole(
    id: 'staff',
    label: '担当',
    note: '受注を探して入力できる。粗利と却下は見えない',
    roles: {'staff'},
  ),
  // 承認者は担当の仕事もできる（役割は足し算＝複数持てる）。
  DemoRole(
    id: 'manager',
    label: '承認者',
    note: '粗利の列・却下・原価管理が出る。一括承認は50件まで',
    roles: {'staff', 'manager'},
  ),
  DemoRole(
    id: 'anon',
    label: '誰でもない（未ログイン）',
    note: '持ち出し（CSV出力）ができない',
    roles: {},
  ),
];

class RoleSwitcher extends StatelessWidget {
  /// いま配っている役割。
  final Set<String> roles;

  final ValueChanged<Set<String>> onChanged;

  const RoleSwitcher({super.key, required this.roles, required this.onChanged});

  DemoRole get _current => demoRoles.firstWhere(
        (one) => one.roles.length == roles.length && one.roles.containsAll(roles),
        orElse: () => demoRoles.first,
      );

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      key: const Key('demo.roleSwitcher'),
      elevation: 6,
      color: theme.colorScheme.surfaceContainerHighest,
      borderRadius: BorderRadius.circular(24),
      child: PopupMenuButton<DemoRole>(
        tooltip: '見ている人を切り替える（権限は見えないことが正しいので、切り替えて確かめる）',
        position: PopupMenuPosition.over,
        onSelected: (one) => onChanged(one.roles),
        itemBuilder: (context) => [
          for (final one in demoRoles)
            PopupMenuItem<DemoRole>(
              key: Key('demo.role.${one.id}'),
              value: one,
              child: ListTile(
                dense: true,
                leading: Icon(
                  one.id == _current.id
                      ? Icons.radio_button_checked
                      : Icons.radio_button_unchecked,
                ),
                title: Text(one.label),
                subtitle: Text(one.note),
              ),
            ),
        ],
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.badge_outlined, size: 18),
              const SizedBox(width: 8),
              Text(
                '見ている人: ${_current.label}',
                key: const Key('demo.roleSwitcher.label'),
                style: theme.textTheme.labelLarge,
              ),
              const Icon(Icons.arrow_drop_down),
            ],
          ),
        ),
      ),
    );
  }
}
