part of '../material_renderer.dart';

/// Applies a column's declared fixed width (DSL `column.width`) to [child].
///
/// Besides honoring the definition, a fixed width makes the column immune to
/// text-measurement timing: on web, CJK glyphs come from a font that is fetched
/// asynchronously, so a column sized purely from its content can collapse to
/// one character on the first frame and only recover after a rebuild.
Widget _sizedColumn(ColumnDefinition column, Widget child) {
  final width = column.width;
  if (width == null) return child;
  return SizedBox(
    width: width,
    // Keep a fixed-width cell on one line so a long value cannot wrap past the
    // row height; Text inherits these from the enclosing DefaultTextStyle.
    child: DefaultTextStyle.merge(
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      child: child,
    ),
  );
}

/// 一括実行のための行の選択。
///
/// `DataTable` は `DataRow.onSelectChanged` を渡すとチェックボックス列と全選択を
/// 自分で描くので、ここが持つのは**何を選んだか**だけ。
///
/// 覚えるのはキーで、渡すのは行そのもの（[pick]）。行が入れ替わったら選択は捨てる
/// （[syncRows]）＝検索し直した・ページを変えた・一括実行後に読み直した後で、
/// 画面に無い行に対して実行できてしまうのを防ぐ。
class _RowSelection {
  final Set<Object?> _keys = {};

  /// 選択を採った時点の行。入れ替わりの判定にだけ使う（中身は見ない）。
  List<DataRecord>? _rows;

  bool get isEmpty => _keys.isEmpty;

  bool has(Object? key) => _keys.contains(key);

  void toggle(Object? key,
      {required bool selected, required List<DataRecord> rows}) {
    _rows = rows;
    if (selected) {
      _keys.add(key);
    } else {
      _keys.remove(key);
    }
  }

  /// いま画面に出ている行のうち、選ばれているもの。
  List<DataRecord> pick(List<DataRecord> rows, String keyField) => [
        for (final row in rows)
          if (_keys.contains(row[keyField])) row
      ];

  /// その行だけを選んだ状態にする（一括が一部だけ失敗したときの選び直し）。
  ///
  /// **いま画面に無いキーは捨てる。** 読み直しで消えた行を選んだままにすると、画面に
  /// 出ていない行に対して実行できてしまう（[syncRows] が守っているのと同じ話）。
  void keepOnly(
    Iterable<Object?> keys,
    List<DataRecord> rows,
    String keyField,
  ) {
    final visible = {for (final row in rows) row[keyField]};
    _rows = rows;
    _keys
      ..clear()
      ..addAll(keys.where(visible.contains));
  }

  /// 行が入れ替わっていたら選択を捨てる。捨てたかどうかを返す（再描画の判断用）。
  bool syncRows(List<DataRecord> rows) {
    if (_rows == null || identical(_rows, rows)) return false;
    _rows = rows;
    if (_keys.isEmpty) return false;
    _keys.clear();
    return true;
  }

  void clear() => _keys.clear();
}

/// この画面に「選んだ行に対して実行する」ボタンが在るか。
///
/// 在るかどうかで表が選択可能になる＝**チェックボックスだけ出て何もできない**、
/// **一括ボタンだけ出て選べない**、のどちらも書けない形にしてある。
bool _hasSelectionAction(List<ActionDefinition> actions, Set<String> roles) {
  return actions.any(
    (a) => a.scope == ActionScopes.selection && isAllowed(a.roles, roles),
  );
}

/// 一覧の上の見出しとボタン。
///
/// ボタンは**折り返す**（`Wrap`）。横に並べ続けると、狭い窓や長いラベル
/// （「一括承認（3 件：1 件は条件に合いません）」）で画面の外へ出て、**押せない
/// ボタン**になる（出ていないのと同じ）。見出しより広い場所をボタンに配るのは、
/// 折り返す前に横へ並べたいから。
Widget _listHeader(String title, ThemeData theme, List<Widget> buttons) => Row(
      children: [
        Expanded(child: Text(title, style: theme.textTheme.headlineSmall)),
        if (buttons.isNotEmpty)
          Flexible(
            flex: 2,
            child: Wrap(
              alignment: WrapAlignment.end,
              spacing: 8,
              runSpacing: 8,
              children: buttons,
            ),
          ),
      ],
    );

/// そのボタンを**行に出せる**か。
///
/// 出せないのは「選んだ行に対して実行するボタン」（`scope: selection`）だけ。行に
/// 並べると、押した行ではなく**チェックした行**に実行することになる（何も選んで
/// いなければ何も起きない）＝押した人には壊れて見える。行には出さず、一覧の上の
/// 一括ボタンとして出す（`rowActions` に並べても効かないことは `validate` が言う
/// ＝`selection-as-rowaction`）。
bool _fitsRow(ActionDefinition action) =>
    action.scope != ActionScopes.selection;

/// `table.rowActions` に並んだ id のうち、**その行のボタンとして出せる**もの。
///
/// 並びは定義のまま（書いた順に出る）。引けないものは行に出さない: 同じ id の宣言が
/// 無い（`rowaction-not-declared`）・その役割には見せない・選んだ行に実行するボタン。
/// 組み込みの行アクション（`edit` / `delete`）はここには出てこない（宣言ではなく
/// 画面の機能なので、画面側が自分で描く）。
List<ActionDefinition> _rowActions(
  List<String> ids,
  List<ActionDefinition> actions,
  Set<String> roles,
) {
  final declared = {for (final action in actions) action.id: action};
  return [
    for (final id in ids)
      if (declared[id] case final action?)
        if (_fitsRow(action) && isAllowed(action.roles, roles)) action,
  ];
}

/// 一覧の**上**に出すボタンか（行に出したものは出さない＝同じボタンを2か所に出さない）。
///
/// 行に並べても行には出せないボタン（`scope: selection`）は、上に残す。消すと
/// **どこからも押せないボタン**になる。
bool _onPageTop(ActionDefinition action, List<String> rowActionIds) =>
    !rowActionIds.contains(action.id) || !_fitsRow(action);

/// 行のボタン1つ。
///
/// **その行のレコード**で判定する（`enabledWhen`）。押せないときは灰色にして、
/// 何の状態で決まるのかを添える＝理由の無い灰色を出さない。
Widget _rowActionButton({
  required ActionDefinition action,
  required DataRecord record,
  required Object? rowKey,
  required Map<String, String> labels,
  required VoidCallback onPressed,
}) {
  final state = _actionEnabled(action, record: record);
  return _withReason(
    TextButton(
      key: Key('hatake.rowaction.${action.id}.$rowKey'),
      onPressed: state.enabled ? onPressed : null,
      child: Text(action.label),
    ),
    state,
    labels,
  );
}

/// 一括ボタンの見せ方。選んだ件数を出す（0 件なら押せない）。
///
/// 定義に上限（`maxRows`）が書いてあるときは、超えて選んでいる間**押せない**。
/// ラベルには「いま何件で、何件までか」を出す＝押してから断られるのではなく、
/// 押す前に理由が読める。**切り詰めて実行はしない**（選んだうちの一部だけが動いた
/// ことに、押した人は気づけない）。
///
/// 上限は役割で変わる（`byRole`）ので、[roles] を渡して**その人の上限**を出す。
///
/// 行の状態で出し分ける（`enabledWhen`）ときは、**選んだ行が全部満たすときだけ**
/// 押せる。ラベルには「何件が条件に合わないか」を出す＝押す前に、選び直せば押せる
/// ことが読める（上限と同じ作法）。
///
/// 0 件のときも同じ作法で**なぜ押せないのか**を出す。灰色のボタンだけが並んでいると、
/// 押した人には壊れているように見える（この画面で一番よくある行き止まり）。言い分けは
/// [hasRows] で決める＝**選べる行が1つも無い**のか、**まだ選んでいない**のか。
/// 読み込み中は分からないので何も足さない（`null`）。無いと決めつけて「行がありません」
/// と言うと、出てくる行を待っている間だけ嘘になる。
Widget _bulkButton({
  required ActionDefinition action,
  required int count,
  required VoidCallback onPressed,
  Set<String> roles = const {},
  int failing = 0,
  bool? hasRows,
}) {
  final max = action.maxRows?.forRoles(roles);
  final tooMany = max != null && count > max;
  return FilledButton(
    key: Key('hatake.action.${action.id}'),
    onPressed: count == 0 || tooMany || failing > 0 ? null : onPressed,
    child: Text(switch (count) {
      0 when hasRows == false => '${action.label}（行がありません）',
      0 when hasRows == true => '${action.label}（行を選んでください）',
      0 => action.label,
      _ when tooMany => '${action.label}（$count 件：$max 件まで）',
      _ when failing > 0 => '${action.label}（$count 件：$failing 件は条件に合いません）',
      _ => '${action.label}（$count 件）',
    }),
  );
}
