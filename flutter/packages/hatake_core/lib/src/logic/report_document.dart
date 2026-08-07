// 帳票の中立な出力形（Renderer が描く前の「紙の中身」）。
//
// Definition + 行 → ReportDocument、が Framework の担当。ここから先（画面に
// 描く / PDF にする / プリンタに送る）は Renderer と opt-in アダプタの領分。
// `QuerySpec` / `DtoSpec` と同じ立ち位置。

/// 帳票の1行が何であるか。開いた文字列（プラグインが増やせる）。
abstract final class ReportBlockKinds {
  const ReportBlockKinds._();

  /// グループ見出し（コントロールブレイク）。
  static const String groupHeader = 'groupHeader';

  /// 明細1行。
  static const String detail = 'detail';

  /// グループの小計。
  static const String subtotal = 'subtotal';

  /// 全体の合計。
  static const String grandTotal = 'grandTotal';
}

/// 帳票の1行。
class ReportBlock {
  /// [ReportBlockKinds] のいずれか。
  final String kind;

  /// グループの深さ（0 が最も外側）。明細と総計は -1。
  final int level;

  /// グループ見出しのラベル（それ以外は空）。
  final String label;

  /// グループ見出しの値（それ以外は null）。
  final Object? value;

  /// 明細のレコード（それ以外は空）。
  final Map<String, Object?> row;

  /// 小計・総計の値。`report.totals` と**同じ順序**（同じ項目の sum と count の
  /// ように重複できるので、項目名ではなく位置で対応させる）。
  final List<num?> totals;

  const ReportBlock({
    required this.kind,
    this.level = -1,
    this.label = '',
    this.value,
    this.row = const {},
    this.totals = const [],
  });

  @override
  String toString() => 'ReportBlock($kind, level: $level, label: $label)';
}

/// 1枚の用紙。
class ReportSheet {
  /// 1始まりのページ番号。
  final int number;

  final List<ReportBlock> blocks;

  const ReportSheet({required this.number, required this.blocks});
}

/// 帳票1本ぶんの出力。
class ReportDocument {
  final List<ReportSheet> sheets;

  const ReportDocument(this.sheets);

  static const ReportDocument empty = ReportDocument([]);

  int get totalPages => sheets.length;

  bool get isEmpty => sheets.isEmpty;
}
