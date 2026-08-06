part of '../material_renderer.dart';

/// Child-row grid for a `subTable` whose rows come from their own repository
/// (`source` present): pages through them and saves each row immediately.
///
/// The parent must already exist — without its key there is no foreign key to
/// write, so the grid says so instead of pretending to accept rows.
class _PagedSubTableField extends StatefulWidget {
  final FieldDefinition field;
  final SubTableControllerFactory factory;
  final Object? parentKey;
  final FormatterRegistry formatters;
  final ValidatorRegistry validators;
  final Map<String, MaterialFieldBuilder> fieldBuilders;
  final Set<String> roles;
  final bool readOnly;

  const _PagedSubTableField({
    required this.field,
    required this.factory,
    required this.parentKey,
    required this.formatters,
    required this.validators,
    required this.fieldBuilders,
    required this.roles,
    required this.readOnly,
  });

  @override
  State<_PagedSubTableField> createState() => _PagedSubTableFieldState();
}

class _PagedSubTableFieldState extends State<_PagedSubTableField> {
  late SubTableController _controller;

  @override
  void initState() {
    super.initState();
    _controller = widget.factory(widget.field, widget.parentKey);
    _controller.load();
  }

  @override
  void didUpdateWidget(_PagedSubTableField oldWidget) {
    super.didUpdateWidget(oldWidget);
    // The parent got saved (or we moved to another record): re-key the rows.
    if (oldWidget.parentKey != widget.parentKey) {
      _controller.dispose();
      _controller = widget.factory(widget.field, widget.parentKey);
      _controller.load();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  FieldDefinition get _field => widget.field;

  Future<void> _editRow({DataRecord? row}) async {
    final edited = await showDialog<DataRecord>(
      context: context,
      barrierDismissible: false,
      builder: (_) => _SubTableRowDialog(
        field: _field,
        initial: row ?? const {},
        fieldBuilders: widget.fieldBuilders,
        roles: widget.roles,
        validators: widget.validators,
        // Persisting is the controller's job; the dialog only collects a row.
      ),
    );
    if (edited == null) return;
    // Keep the row's key and parent key, which the editor does not show.
    await _controller.saveRow({...?row, ...edited});
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _controller,
      builder: (context, _) => _build(context),
    );
  }

  Widget _build(BuildContext context) {
    final theme = Theme.of(context);
    final columns =
        _field.columns.where((c) => isAllowed(c.roles, widget.roles)).toList();
    final editable = !widget.readOnly && _controller.canEdit;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(_field.label, style: theme.textTheme.titleSmall),
            ),
            if (editable)
              TextButton.icon(
                key: Key('hatake.subtable.${_field.field}.add'),
                onPressed: _controller.saving ? null : () => _editRow(),
                icon: const Icon(Icons.add),
                label: const Text('行を追加'),
              ),
          ],
        ),
        if (_controller.error != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Text(
              'エラー: ${_controller.error}',
              key: Key('hatake.subtable.${_field.field}.error'),
              style: TextStyle(color: theme.colorScheme.error, fontSize: 12),
            ),
          ),
        if (!_controller.canEdit)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Text(
              '先に保存すると明細を入力できます',
              key: Key('hatake.subtable.${_field.field}.needsParent'),
              style: TextStyle(color: theme.colorScheme.outline),
            ),
          )
        else if (_controller.loading)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Center(child: CircularProgressIndicator()),
          )
        else if (_controller.rows.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Text(
              '明細がありません',
              key: Key('hatake.subtable.${_field.field}.empty'),
              style: TextStyle(color: theme.colorScheme.outline),
            ),
          )
        else
          _buildGrid(columns, editable),
        if (_controller.canEdit) _buildPagination(theme),
      ],
    );
  }

  Widget _buildGrid(List<ColumnDefinition> columns, bool editable) {
    final rows = _controller.rows;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: DataTable(
        key: Key('hatake.subtable.${_field.field}'),
        columnSpacing: 24,
        headingRowHeight: 40,
        dataRowMinHeight: 40,
        dataRowMaxHeight: 48,
        columns: [
          for (final column in columns)
            DataColumn(label: _sizedColumn(column, Text(column.label))),
          if (editable) const DataColumn(label: Text('')),
        ],
        rows: [
          for (var i = 0; i < rows.length; i++)
            DataRow(
              cells: [
                for (final column in columns)
                  DataCell(
                    _sizedColumn(column, Text(_cellText(column, rows[i]))),
                    onTap: editable ? () => _editRow(row: rows[i]) : null,
                  ),
                if (editable)
                  DataCell(Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(
                        key: Key('hatake.subtable.${_field.field}.edit.$i'),
                        icon: const Icon(Icons.edit_outlined, size: 18),
                        tooltip: '編集',
                        onPressed: () => _editRow(row: rows[i]),
                      ),
                      IconButton(
                        key: Key('hatake.subtable.${_field.field}.delete.$i'),
                        icon: const Icon(Icons.delete_outline, size: 18),
                        tooltip: '削除',
                        onPressed: () => _controller.deleteRow(rows[i]),
                      ),
                    ],
                  )),
              ],
            ),
        ],
      ),
    );
  }

  Widget _buildPagination(ThemeData theme) {
    final page = _controller.page;
    final pageCount = _controller.pageCount;
    final field = _field.field;
    return Row(
      mainAxisAlignment: MainAxisAlignment.end,
      children: [
        Text('全 ${_controller.totalCount} 件', style: theme.textTheme.bodySmall),
        const SizedBox(width: 8),
        IconButton(
          key: Key('hatake.subtable.$field.prev'),
          icon: const Icon(Icons.chevron_left, size: 20),
          onPressed: page > 0 ? () => _controller.setPage(page - 1) : null,
        ),
        Text('${page + 1} / $pageCount', style: theme.textTheme.bodySmall),
        IconButton(
          key: Key('hatake.subtable.$field.next'),
          icon: const Icon(Icons.chevron_right, size: 20),
          onPressed:
              page < pageCount - 1 ? () => _controller.setPage(page + 1) : null,
        ),
      ],
    );
  }

  String _cellText(ColumnDefinition column, DataRecord row) {
    final value = row[column.field];
    if (column.format != null) {
      return widget.formatters.format(column.format!, value, column.config);
    }
    return value?.toString() ?? '';
  }
}
