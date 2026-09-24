part of '../material_renderer.dart';

/// Read-only single-record detail page renderer.
class _MaterialDetailPage extends StatelessWidget {
  final DetailPageDefinition definition;
  final DetailController controller;
  final FormatterRegistry formatters;

  const _MaterialDetailPage({
    required this.definition,
    required this.controller,
    required this.formatters,
  });

  /// この画面に書いてある選択肢。**詳細画面にも要る**（前は引いていなかったので、
  /// 一覧では「出荷済」と出る値が詳細では `shipped` のまま出ていた）。
  List<OptionsOwner> get _owners => optionOwnersOf(definition);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child:
                    Text(definition.title, style: theme.textTheme.headlineSmall),
              ),
              // 他の画面と同じ口を通す（権限で隠す・`enabledWhen` で灰色にする・
              // 押せない理由を添える、を画面ごとに書き分けない）。
              ..._pageActionButtons(
                context,
                definition.actions,
                controller,
                record: controller.record,
                labels: {
                  for (final field in definition.form.fields)
                    field.field: field.label,
                },
              ),
            ],
          ),
          const SizedBox(height: 12),
          Expanded(child: SingleChildScrollView(child: _buildBody(context))),
        ],
      ),
    );
  }

  Widget _buildBody(BuildContext context) {
    if (controller.loading) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(32),
          child: CircularProgressIndicator(),
        ),
      );
    }
    if (controller.error != null) {
      return Center(
        child: Text(
          'エラー: ${controller.error}',
          key: const Key('hatake.error'),
          style: TextStyle(color: Theme.of(context).colorScheme.error),
        ),
      );
    }
    final record = controller.record;
    if (record == null) {
      return const Center(child: Text('データがありません', key: Key('hatake.empty')));
    }
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final section in definition.form.sections) ...[
          if (section.title != null && section.title!.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 12, bottom: 4),
              child: Text(section.title!, style: theme.textTheme.titleSmall),
            ),
          for (final field in section.fields)
            if (isAllowed(field.roles, HatakeScope.of(context).roles))
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: 160,
                    child: Text(
                      field.label,
                      style: theme.textTheme.bodyMedium
                          ?.copyWith(color: theme.colorScheme.outline),
                    ),
                  ),
                  Expanded(
                    child: _value(context, field, record[field.field]),
                  ),
                ],
              ),
            ),
        ],
      ],
    );
  }

  /// 1項目の中身。**明細（`type: subTable`）だけは升に収まらない**ので表にする。
  ///
  /// 前はここも `toString()` だったので、明細が
  /// `[{orderNo: SO2026070001, lineNo: 1, …}]` と1行で出ていた（納品用の
  /// スクリーンショットに残って気づいた）。入力画面では表で出ているのに詳細だけ
  /// 生の入れ子が出る＝同じ定義が画面によって別の顔になっていた。
  Widget _value(BuildContext context, FieldDefinition field, Object? value) {
    if (field.type == FieldTypes.subTable && field.columns.isNotEmpty) {
      return _childRows(context, field, value);
    }
    return Text(
      cellText(formatters, _owners, field, value),
      key: Key('hatake.detail.${field.field}'),
    );
  }

  /// 明細を読み取り専用の表にする。行が無ければ何も出さない（空の枠は邪魔なので）。
  ///
  /// `source` を持つ明細（子を別の Repository から取るもの）は、親のレコードに値が
  /// 入っていないので**ここでは空**になる。読むだけの画面で子を取りに行くのは
  /// 入力画面と同じ仕掛けが要るため、今は表の見出しだけ出して中身は空にする。
  Widget _childRows(BuildContext context, FieldDefinition field, Object? value) {
    final theme = Theme.of(context);
    final rows = value is Iterable
        ? value.whereType<Map<String, Object?>>().toList()
        : const <Map<String, Object?>>[];
    final roles = HatakeScope.of(context).roles;
    final columns =
        field.columns.where((one) => isAllowed(one.roles, roles)).toList();
    if (rows.isEmpty || columns.isEmpty) {
      return Text('—', key: Key('hatake.detail.${field.field}'));
    }
    return Align(
      alignment: Alignment.centerLeft,
      child: DataTable(
        key: Key('hatake.detail.${field.field}'),
        columnSpacing: 24,
        headingRowHeight: 36,
        dataRowMinHeight: 32,
        dataRowMaxHeight: 40,
        columns: [
          for (final column in columns)
            DataColumn(
              label: Text(column.label, style: theme.textTheme.labelMedium),
            ),
        ],
        rows: [
          for (final row in rows)
            DataRow(
              cells: [
                for (final column in columns)
                  // 明細の中の選択肢は明細の中で引く（親の画面の選択肢とは別物）。
                  DataCell(Text(cellText(
                    formatters,
                    field.rowFields,
                    column,
                    row[column.field],
                  ))),
              ],
            ),
        ],
      ),
    );
  }
}
