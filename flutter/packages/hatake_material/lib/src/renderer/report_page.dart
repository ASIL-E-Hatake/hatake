part of '../material_renderer.dart';

/// Report (帳票) renderer: output conditions on top, one sheet at a time below.
///
/// The sheet is drawn at the declared paper's aspect ratio, so what is on screen
/// is what the paper would hold. Actually printing it (PDF, printer) is an
/// opt-in adapter's job — the framework stops at the document. `hatake_print`
/// is that adapter, and it follows the same rules this preview does (column
/// widths, formats, hidden columns, one sheet per ReportSheet), so the paper
/// holds what the screen showed.
class _MaterialReportPage extends StatelessWidget {
  final ReportPageDefinition definition;
  final ReportController controller;
  final FormatterRegistry formatters;

  const _MaterialReportPage({
    required this.definition,
    required this.controller,
    required this.formatters,
  });

  /// Row height, matching what a data table gives the app's other lists.
  static const double _rowHeight = 44;

  /// A4 and friends, long side over short side.
  static double _paperRatio(PaperDefinition paper) {
    final ratio = switch (paper.size) {
      PaperSizes.letter => 279 / 216,
      PaperSizes.b5 => 257 / 182,
      _ => 297 / 210, // A4 / A3 share the ISO ratio.
    };
    return paper.isLandscape ? 1 / ratio : ratio;
  }

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
              ..._pageActionButtons(context, definition.actions, controller,
                  onExport: _export),
            ],
          ),
          const SizedBox(height: 12),
          if (definition.search != null) ...[
            _SearchArea(search: definition.search!, onSearch: controller.run),
            const SizedBox(height: 12),
          ],
          Expanded(child: _body(context)),
          if (controller.totalPages > 1) ...[
            const SizedBox(height: 8),
            _sheetNavigator(context),
          ],
        ],
      ),
    );
  }

  Future<bool> _export(BuildContext context, ActionDefinition action) {
    return _runExportAction(
      context,
      action,
      columns: definition.table.columns,
      // A report already read one bounded chunk; export exactly what it shows.
      rows: (_) async => controller.rows,
      formatters: formatters,
      fallbackName: definition.title,
    );
  }

  Widget _body(BuildContext context) {
    if (controller.loading) {
      return const Center(child: CircularProgressIndicator());
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
    final sheet = controller.sheet;
    if (sheet == null) {
      return const Center(
        child: Text('データがありません', key: Key('hatake.empty')),
      );
    }
    return SingleChildScrollView(
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 900),
          child: LayoutBuilder(
            // Paper shape as a *minimum*: a sheet whose rows do not fit grows
            // instead of overflowing (rowsPerPage is a line count, and rows are
            // as tall as the app's other lists).
            builder: (context, constraints) => ConstrainedBox(
              constraints: BoxConstraints(
                minHeight: constraints.maxWidth *
                    _paperRatio(definition.report.paper),
              ),
              child: _sheet(context, sheet),
            ),
          ),
        ),
      ),
    );
  }

  /// One sheet of paper: title, page number, column headings, then the blocks.
  ///
  /// The rows deliberately look like the app's other lists (same text size, row
  /// height and dividers as a `search` / `master` table). Every block kind goes
  /// through [_cells], so the columns line up across details and totals.
  Widget _sheet(BuildContext context, ReportSheet sheet) {
    final theme = Theme.of(context);
    final roles = HatakeScope.of(context).roles;
    final columns =
        definition.table.columns.where((c) => isAllowed(c.roles, roles)).toList();
    return Card(
      key: const Key('hatake.report.sheet'),
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(definition.title,
                      style: theme.textTheme.titleMedium),
                ),
                Text('${sheet.number} / ${controller.totalPages}',
                    style: theme.textTheme.bodySmall),
              ],
            ),
            const SizedBox(height: 12),
            _headings(context, columns),
            for (var i = 0; i < sheet.blocks.length; i++)
              _block(context, sheet.blocks[i], columns, i),
          ],
        ),
      ),
    );
  }

  /// Column widths come from the definition (`column.width`); the rest share
  /// what is left. Used by every row so nothing can drift out of alignment.
  List<Widget> _cells(
    List<ColumnDefinition> columns,
    Widget Function(ColumnDefinition column) build,
  ) {
    return [
      for (final column in columns)
        if (column.width == null)
          Expanded(child: _aligned(column, build(column)))
        else
          SizedBox(width: column.width, child: _aligned(column, build(column))),
    ];
  }

  Widget _aligned(ColumnDefinition column, Widget child) => Padding(
        padding: const EdgeInsets.only(right: 12),
        child: Align(alignment: _alignOf(column), child: child),
      );

  /// Heading row, styled like a data table's (outline label + a divider under).
  Widget _headings(BuildContext context, List<ColumnDefinition> columns) {
    final theme = Theme.of(context);
    return Column(
      children: [
        SizedBox(
          height: 40,
          child: Row(
            children: _cells(
              columns,
              (column) => Text(
                column.label,
                style: theme.textTheme.labelMedium
                    ?.copyWith(color: theme.colorScheme.outline),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ),
        ),
        Divider(height: 1, color: theme.colorScheme.outlineVariant),
      ],
    );
  }

  /// [index] is the block's position on this sheet — several subtotals of the
  /// same level can share a sheet, so the level alone is not a unique key.
  Widget _block(
    BuildContext context,
    ReportBlock block,
    List<ColumnDefinition> columns,
    int index,
  ) {
    final theme = Theme.of(context);
    switch (block.kind) {
      case ReportBlockKinds.groupHeader:
        // Spans the whole row: a group label is prose, not a cell, and a narrow
        // first column would clip it.
        return Container(
          key: Key('hatake.report.group.$index'),
          decoration: BoxDecoration(
            color: theme.colorScheme.surfaceContainerHighest,
            border: Border(
              bottom: BorderSide(color: theme.colorScheme.outlineVariant),
            ),
          ),
          padding: EdgeInsets.only(
            left: 8 + 16.0 * block.level,
            right: 8,
            top: 8,
            bottom: 8,
          ),
          child: Text(
            '${block.label}: ${block.value ?? ''}',
            style: theme.textTheme.titleSmall,
          ),
        );
      case ReportBlockKinds.detail:
        return Container(
          key: Key('hatake.report.detail.$index'),
          height: _rowHeight,
          decoration: BoxDecoration(
            border: Border(
              bottom: BorderSide(
                color: theme.colorScheme.outlineVariant.withValues(alpha: 0.5),
              ),
            ),
          ),
          child: Row(
            children: _cells(
              columns,
              (column) => Text(
                _cell(column, block.row[column.field]),
                style: theme.textTheme.bodyMedium,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ),
        );
      case ReportBlockKinds.subtotal:
        return _totalLine(context, block, columns, '小計', index);
      case ReportBlockKinds.grandTotal:
        return _totalLine(context, block, columns, '合計', index);
      default:
        return const SizedBox.shrink();
    }
  }

  /// A total line: the label on the left, each figure under its own column.
  Widget _totalLine(
    BuildContext context,
    ReportBlock block,
    List<ColumnDefinition> columns,
    String label,
    int index,
  ) {
    final theme = Theme.of(context);
    final isGrand = block.kind == ReportBlockKinds.grandTotal;
    return Container(
      key: Key(isGrand
          ? 'hatake.report.grandTotal'
          : 'hatake.report.subtotal.$index'),
      height: _rowHeight,
      decoration: BoxDecoration(
        color: isGrand ? theme.colorScheme.surfaceContainerHighest : null,
        border: Border(
          top: BorderSide(
            color: theme.colorScheme.outlineVariant,
            width: isGrand ? 1.5 : 1,
          ),
        ),
      ),
      child: DefaultTextStyle.merge(
        style: theme.textTheme.bodyMedium!.copyWith(
          fontWeight: FontWeight.bold,
          color: isGrand ? null : theme.colorScheme.onSurfaceVariant,
        ),
        child: Row(
          children: [
            for (var i = 0; i < columns.length; i++)
              if (columns[i].width == null)
                Expanded(child: _aligned(columns[i], _totalCell(columns[i], block, i, label)))
              else
                SizedBox(
                  width: columns[i].width,
                  child: _aligned(columns[i], _totalCell(columns[i], block, i, label)),
                ),
          ],
        ),
      ),
    );
  }

  Widget _totalCell(
    ColumnDefinition column,
    ReportBlock block,
    int index,
    String label,
  ) {
    return Text(
      index == 0 ? label : _totalFor(column, block),
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
    );
  }

  /// The declared totals that belong under [column], formatted like its cells.
  /// Two totals may share a column (sum + count), so they are joined.
  String _totalFor(ColumnDefinition column, ReportBlock block) {
    final parts = <String>[];
    for (var i = 0; i < definition.report.totals.length; i++) {
      final total = definition.report.totals[i];
      if (total.field != column.field) continue;
      if (i >= block.totals.length) continue;
      final value = block.totals[i];
      if (value == null) continue;
      // count is a plain tally, so it keeps the column's formatter out of it.
      parts.add(total.aggregate == AggregateOps.count
          ? '${value.toInt()} 件'
          : _cell(column, value));
    }
    return parts.join(' / ');
  }

  String _cell(ColumnDefinition column, Object? value) {
    if (column.format != null) {
      return formatters.format(column.format!, value, column.config);
    }
    return value?.toString() ?? '';
  }

  /// Numbers read right-aligned on paper; everything else stays left.
  Alignment _alignOf(ColumnDefinition column) =>
      column.type == ColumnTypes.number
          ? Alignment.centerRight
          : Alignment.centerLeft;

  Widget _sheetNavigator(BuildContext context) {
    final index = controller.sheetIndex;
    return Row(
      mainAxisAlignment: MainAxisAlignment.end,
      children: [
        Text('全 ${controller.rows.length} 件',
            style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(width: 16),
        IconButton(
          key: const Key('hatake.report.prev'),
          icon: const Icon(Icons.chevron_left),
          onPressed: index > 0 ? () => controller.setSheet(index - 1) : null,
        ),
        Text('${index + 1} / ${controller.totalPages}',
            key: const Key('hatake.report.pageIndicator')),
        IconButton(
          key: const Key('hatake.report.next'),
          icon: const Icon(Icons.chevron_right),
          onPressed: index < controller.totalPages - 1
              ? () => controller.setSheet(index + 1)
              : null,
        ),
      ],
    );
  }
}
