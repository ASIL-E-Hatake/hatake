part of '../material_renderer.dart';

/// Read-only search/list page renderer.
class _MaterialSearchPage extends StatefulWidget {
  final SearchPageDefinition definition;
  final ListController controller;
  final FormatterRegistry? formatters;

  const _MaterialSearchPage({
    required this.definition,
    required this.controller,
    required this.formatters,
  });

  @override
  State<_MaterialSearchPage> createState() => _MaterialSearchPageState();
}

class _MaterialSearchPageState extends State<_MaterialSearchPage> {
  late final FormatterRegistry _formatters =
      widget.formatters ?? FormatterRegistry();

  /// 一括実行のために選んだ行（`scope: selection` のボタンが在るときだけ使う）。
  final _selection = _RowSelection();

  @override
  void initState() {
    super.initState();
    // 行が入れ替わったら選択を捨てる（検索し直した・ページを変えた・一括実行の
    // あとで読み直した後に、画面に無い行へ実行できてしまうのを防ぐ）。
    widget.controller.addListener(_onRowsChanged);
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onRowsChanged);
    super.dispose();
  }

  void _onRowsChanged() {
    if (_selection.syncRows(widget.controller.items) && mounted) {
      setState(() {});
    }
  }

  SearchPageDefinition get _def => widget.definition;
  ListController get _controller => widget.controller;
  Set<String> get _roles => HatakeScope.of(context).roles;

  ActionDefinition? _actionById(String id) {
    for (final action in _def.actions) {
      if (action.id == id) return action;
    }
    return null;
  }

  /// One dispatcher for every page kind (see `_runPageAction`), so `confirm` /
  /// `onSuccess` behave the same wherever the action sits.
  Future<void> _runAction(ActionDefinition action, {DataRecord? record}) async {
    final selected = action.scope == ActionScopes.selection
        ? _selection.pick(_controller.items, _def.keyField)
        : const <DataRecord>[];
    final ran = await _runPageAction(
      context,
      action,
      _controller,
      record: record,
      records: selected,
      onExport: _export,
      onSelectRows: _selectRows,
      keyField: _def.keyField,
      onExportLeftover: _exportLeftoverRows,
    );
    // 実行できたら選択を解く（同じ行に二度実行するのは、まず事故）。
    if (ran && selected.isNotEmpty && mounted) {
      setState(_selection.clear);
    }
  }

  /// **その行だけを選び直す**（一括の続きを押せるようにする）。
  ///
  /// 使う場面は2つ。**一部だけ失敗した**とき（失敗した行だけ）と、**区切って実行して
  /// 途中で終わった**とき（まだ終わっていない行だけ）。「3件失敗しました」「3件は
  /// 実行していません」で終わると、現場は全部やり直すか選び直すことになる。
  /// いま画面に無い行は選ばない（[_RowSelection.keepOnly] が絞る）。
  void _selectRows(List<Object?> keys) {
    if (!mounted) return;
    setState(() => _selection.keepOnly(keys, _controller.items, _def.keyField));
  }

  /// Re-query so the CSV holds the whole result, not just the page on screen.

  /// 一括のあとに残った行を**画面の外へ持ち出す**（表の列と整形はこの画面が知っている）。
  ///
  /// 出す口と役割は**この画面の context**から引く（押されるのはダイアログの中＝
  /// `HatakeScope` の外なので、そこから引くと落ちる）。
  Future<bool> _exportLeftoverRows(
    ActionDefinition action,
    _Leftover leftover,
  ) {
    final scope = HatakeScope.of(context);
    return _exportLeftover(
      action,
      leftover,
      sink: scope.exportSink,
      roles: scope.roles,
      columns: _def.table.columns,
      keyField: _def.keyField,
      formatters: _formatters,
    );
  }

  Future<bool> _export(BuildContext context, ActionDefinition action) {
    return _runExportAction(
      context,
      action,
      columns: _def.table.columns,
      rows: _controller.fetchForExport,
      formatters: _formatters,
      fallbackName: _def.title,
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final rowActionIds = _def.table.rowActions;
    final pageActions = _def.actions
        .where((a) => !rowActionIds.contains(a.id) && isAllowed(a.roles, _roles))
        .toList();

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(_def.title, style: theme.textTheme.headlineSmall),
              ),
              for (final action in pageActions) ...[
                if (action.scope == ActionScopes.selection)
                  _bulkButton(
                    action: action,
                    count: _selection.pick(_controller.items, _def.keyField).length,
                    onPressed: () => _runAction(action),
                    roles: HatakeScope.of(context).roles,
                    // 選んだ行が全部満たすときだけ押せる（合わない件数はラベルへ）。
                    failing: _actionEnabled(
                      action,
                      rows: _selection.pick(_controller.items, _def.keyField),
                    ).failing,
                  )
                else
                  // 一覧の上のボタンには判定する相手が無いので出し分けない
                  // （書いても効かないことは validate が言う）。
                  FilledButton(
                    key: Key('hatake.action.${action.id}'),
                    onPressed: () => _runAction(action),
                    child: Text(action.label),
                  ),
                const SizedBox(width: 8),
              ],
            ],
          ),
          const SizedBox(height: 12),
          if (_def.search != null) ...[
            _SearchArea(search: _def.search!, onSearch: _controller.search),
            const SizedBox(height: 12),
          ],
          Expanded(child: _buildBody(rowActionIds)),
          const SizedBox(height: 8),
          _buildPagination(theme),
        ],
      ),
    );
  }

  Widget _buildBody(List<String> rowActionIds) {
    if (_controller.loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_controller.error != null) {
      return Center(
        child: Text(
          'エラー: ${_controller.error}',
          key: const Key('hatake.error'),
          style: TextStyle(color: Theme.of(context).colorScheme.error),
        ),
      );
    }
    if (_controller.items.isEmpty) {
      return const Center(
        child: Text('データがありません', key: Key('hatake.empty')),
      );
    }

    final columns =
        _def.table.columns.where((c) => isAllowed(c.roles, _roles)).toList();
    final rowActions = rowActionIds
        .map(_actionById)
        .whereType<ActionDefinition>()
        .where((a) => isAllowed(a.roles, _roles))
        .toList();

    // 表が選択可能になるのは、選んだ行に対して実行するボタンが在るときだけ。
    final selectable = _hasSelectionAction(_def.actions, _roles);

    return SingleChildScrollView(
      scrollDirection: Axis.vertical,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: DataTable(
          showCheckboxColumn: selectable,
          columns: [
            for (final column in columns)
              DataColumn(
                label: _sizedColumn(column, Text(column.label)),
                onSort: column.sortable
                    ? (index, ascending) =>
                        _controller.sortBy(column.field, ascending: ascending)
                    : null,
              ),
            if (rowActions.isNotEmpty) const DataColumn(label: Text('')),
          ],
          rows: [
            for (final record in _controller.items)
              DataRow(
                selected: selectable &&
                    _selection.has(record[_def.keyField]),
                onSelectChanged: !selectable
                    ? null
                    : (value) => setState(() => _selection.toggle(
                          record[_def.keyField],
                          selected: value ?? false,
                          rows: _controller.items,
                        )),
                cells: [
                  for (final column in columns)
                    DataCell(_sizedColumn(
                        column, _buildCell(column, record[column.field]))),
                  if (rowActions.isNotEmpty)
                    DataCell(Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        // 行のボタンは**その行のレコード**で判定する
                        // （`enabledWhen`）。押せないときは理由を添える。
                        for (final action in rowActions)
                          _withReason(
                            TextButton(
                              key: Key(
                                  'hatake.rowaction.${action.id}.${record[_def.keyField]}'),
                              onPressed: _actionEnabled(action, record: record)
                                      .enabled
                                  ? () => _runAction(action, record: record)
                                  : null,
                              child: Text(action.label),
                            ),
                            _actionEnabled(action, record: record),
                            {
                              for (final column in columns)
                                column.field: column.label,
                            },
                          ),
                      ],
                    )),
                ],
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildCell(ColumnDefinition column, Object? value) {
    final text = column.format != null
        ? _formatters.format(column.format!, value, column.config)
        : value?.toString() ?? '';
    switch (column.type) {
      case ColumnTypes.badge:
        return Chip(
          label: Text(text),
          visualDensity: VisualDensity.compact,
        );
      case ColumnTypes.boolean:
        return Icon(value == true ? Icons.check : Icons.close, size: 18);
      default:
        return Text(text);
    }
  }

  Widget _buildPagination(ThemeData theme) {
    final page = _controller.page;
    final pageCount = _controller.pageCount;
    return Row(
      mainAxisAlignment: MainAxisAlignment.end,
      children: [
        Text('全 ${_controller.totalCount} 件', style: theme.textTheme.bodySmall),
        const SizedBox(width: 16),
        IconButton(
          key: const Key('hatake.prev'),
          icon: const Icon(Icons.chevron_left),
          onPressed: page > 0 ? () => _controller.setPage(page - 1) : null,
        ),
        Text('${page + 1} / $pageCount'),
        IconButton(
          key: const Key('hatake.next'),
          icon: const Icon(Icons.chevron_right),
          onPressed:
              page < pageCount - 1 ? () => _controller.setPage(page + 1) : null,
        ),
      ],
    );
  }
}
