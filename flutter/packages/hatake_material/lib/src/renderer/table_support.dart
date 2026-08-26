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

  void toggle(Object? key, {required bool selected, required List<DataRecord> rows}) {
    _rows = rows;
    if (selected) {
      _keys.add(key);
    } else {
      _keys.remove(key);
    }
  }

  /// いま画面に出ている行のうち、選ばれているもの。
  List<DataRecord> pick(List<DataRecord> rows, String keyField) =>
      [for (final row in rows) if (_keys.contains(row[keyField])) row];

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

/// 一括ボタンの見せ方。選んだ件数を出す（0 件なら押せない）。
///
/// 定義に上限（`maxRows`）が書いてあるときは、超えて選んでいる間**押せない**。
/// ラベルには「いま何件で、何件までか」を出す＝押してから断られるのではなく、
/// 押す前に理由が読める。**切り詰めて実行はしない**（選んだうちの一部だけが動いた
/// ことに、押した人は気づけない）。
///
/// 上限は役割で変わる（`byRole`）ので、[roles] を渡して**その人の上限**を出す。
Widget _bulkButton({
  required ActionDefinition action,
  required int count,
  required VoidCallback onPressed,
  Set<String> roles = const {},
}) {
  final max = action.maxRows?.forRoles(roles);
  final tooMany = max != null && count > max;
  return FilledButton(
    key: Key('hatake.action.${action.id}'),
    onPressed: count == 0 || tooMany ? null : onPressed,
    child: Text(switch (count) {
      0 => action.label,
      _ when tooMany => '${action.label}（$count 件：$max 件まで）',
      _ => '${action.label}（$count 件）',
    }),
  );
}
