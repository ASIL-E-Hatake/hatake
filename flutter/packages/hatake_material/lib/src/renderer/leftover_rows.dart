part of '../material_renderer.dart';

/// 一括のあとに**残った行を画面の外へ持ち出す**（CSV）。
///
/// なぜ要るのか: 一括の失敗と中断は、そこで終わりではない。「担当に配る」「翌日やり直す」
/// が続くのに、残った行が分かるのは**その画面の中だけ**（検索し直す・ページを変える・
/// 閉じるで消える）。選び直しは「いま・ここ」の話で、明日の話にはならない。
///
/// 出すのは**1枚**にする。押した人が片付ける相手は「失敗した行」と「実行していない行」に
/// 分かれるが、次にやることは同じ（この行をどうにかする）なので、分けて2枚出す方が手間が
/// 増える。代わりに**理由の列**を足して、どちらなのかを行ごとに書く。
class _Leftover {
  /// 失敗した行（アプリが名指しできたぶん）。
  final List<DataRecord> failed;

  /// まだ終わっていない行（送っていない＋失敗した区切り）。
  final List<DataRecord> unfinished;

  /// キー → 失敗の理由（アプリが書いたぶんだけ）。
  final Map<Object?, String> reasons;

  const _Leftover({
    this.failed = const [],
    this.unfinished = const [],
    this.reasons = const {},
  });

  bool get isEmpty => failed.isEmpty && unfinished.isEmpty;

  int get length => failed.length + unfinished.length;
}

/// 理由を書く列。**表の列と衝突しない名前**にする（項目名は業務が決めるので、
/// `reason` のような普通の名前は使えない）。
const _reasonField = 'hatake:reason';

/// 実行していない行の理由（失敗ではないので、そう書く）。
const _notRunReason = '実行していません';

/// [_Leftover] を「表の列＋理由」の CSV にして、アプリの出す口へ渡す。
///
/// 出す口（`exportSink`）が無ければ**ボタンを出さない**側で止めているので、ここに来る
/// 時点では在る。列は**その人に見えている列だけ**（画面に出せない列を持ち出せるのは
/// おかしい＝`type: export` と同じ扱い）。
///
/// [sink] と [roles] を渡してもらうのは、**押される場所がダイアログの中**だから
/// （ダイアログは別のルートなので `HatakeScope` の外に居る＝そこから引くと落ちる）。
/// フォームの中身を描くときに検証を渡してもらうのと同じ理由。
Future<bool> _exportLeftover(
  ActionDefinition action,
  _Leftover leftover, {
  required ExportSink? sink,
  required Set<String> roles,
  required List<ColumnDefinition> columns,
  required String keyField,
  required FormatterRegistry formatters,
}) async {
  if (sink == null) return false;
  final visible = [
    for (final column in columns)
      if (isAllowed(column.roles, roles)) column,
    const ColumnDefinition(field: _reasonField, label: '理由'),
  ];
  // 失敗した行を先に出す（直してからやり直す相手＝手が要る側）。
  final rows = <DataRecord>[
    for (final row in leftover.failed)
      {...row, _reasonField: leftover.reasons[row[keyField]] ?? '失敗しました'},
    for (final row in leftover.unfinished) {...row, _reasonField: _notRunReason},
  ];
  await sink(ExportRequest(
    filename: '${action.label}_残り.csv',
    mimeType: 'text/csv',
    // 業務で開くのは Excel なので、既定は BOM 付き（`type: export` の既定と同じ形を
    // 使う＝持ち出し方が2通りにならない）。
    text: toCsv(
      visible,
      rows,
      options: const CsvOptions(bom: true),
      formatters: formatters,
    ),
    charset: 'utf-8',
    actionId: action.id,
  ));
  return true;
}

/// 「失敗した 3 件・実行していない 5 件」のような言い方（何が入っている CSV なのか）。
String _leftoverLabel(_Leftover leftover) {
  final parts = [
    if (leftover.failed.isNotEmpty) '失敗した ${leftover.failed.length} 件',
    if (leftover.unfinished.isNotEmpty)
      '実行していない ${leftover.unfinished.length} 件',
  ];
  return parts.join('・');
}
