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
  final Map<String, TextEditingController> _textFilters = {};
  final Map<String, Object?> _selectFilters = {};
  late final FormatterRegistry _formatters =
      widget.formatters ?? FormatterRegistry();

  SearchPageDefinition get _def => widget.definition;
  ListController get _controller => widget.controller;
  Set<String> get _roles => HatakeScope.of(context).roles;

  @override
  void initState() {
    super.initState();
    for (final filter in _def.search?.filters ?? const []) {
      if (filter.type == FieldTypes.select) {
        _selectFilters[filter.field] = null;
      } else {
        _textFilters[filter.field] = TextEditingController();
      }
    }
  }

  @override
  void dispose() {
    for (final controller in _textFilters.values) {
      controller.dispose();
    }
    super.dispose();
  }

  void _runSearch() {
    final filters = <String, Object?>{};
    _textFilters.forEach((field, controller) {
      final text = controller.text.trim();
      if (text.isNotEmpty) filters[field] = text;
    });
    _selectFilters.forEach((field, value) {
      if (value != null) filters[field] = value;
    });
    _controller.search(filters);
  }

  ActionDefinition? _actionById(String id) {
    for (final action in _def.actions) {
      if (action.id == id) return action;
    }
    return null;
  }

  Future<void> _runAction(ActionDefinition action, {DataRecord? record}) async {
    if (action.type == ActionTypes.navigate) {
      _navigateAction(context, action, record: record);
      return;
    }
    final registry = HatakeScope.of(context).actions;
    final handler =
        action.plugin == null ? null : registry.resolve(action.plugin!);
    if (handler == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('アクション "${action.id}" のハンドラが未登録です')),
      );
      return;
    }
    await handler(ActionContext(
      buildContext: context,
      controller: _controller,
      action: action,
      record: record,
    ));
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
            _buildSearchArea(),
            const SizedBox(height: 12),
          ],
          Expanded(child: _buildBody(rowActionIds)),
          const SizedBox(height: 8),
          _buildPagination(theme),
        ],
      ),
    );
  }

  Widget _buildSearchArea() {
    return Wrap(
      spacing: 12,
      runSpacing: 12,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        for (final filter in _def.search!.filters)
          SizedBox(width: 220, child: _buildFilterInput(filter)),
        FilledButton.icon(
          key: const Key('hatake.search'),
          onPressed: _runSearch,
          icon: const Icon(Icons.search),
          label: const Text('検索'),
        ),
      ],
    );
  }

  Widget _buildFilterInput(FilterDefinition filter) {
    if (filter.type == FieldTypes.select) {
      return DropdownButtonFormField<Object?>(
        key: Key('hatake.filter.${filter.field}'),
        initialValue: _selectFilters[filter.field],
        decoration: InputDecoration(
          labelText: filter.label,
          border: const OutlineInputBorder(),
          isDense: true,
        ),
        items: [
          const DropdownMenuItem<Object?>(value: null, child: Text('—')),
          for (final option in filter.options)
            DropdownMenuItem<Object?>(
              value: option.value,
              child: Text(option.label),
            ),
        ],
        onChanged: (value) =>
            setState(() => _selectFilters[filter.field] = value),
      );
    }
    return TextField(
      key: Key('hatake.filter.${filter.field}'),
      controller: _textFilters[filter.field],
      decoration: InputDecoration(
        labelText: filter.label,
        border: const OutlineInputBorder(),
        isDense: true,
      ),
      onSubmitted: (_) => _runSearch(),
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

    return SingleChildScrollView(
      scrollDirection: Axis.vertical,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: DataTable(
          columns: [
            for (final column in columns)
              DataColumn(
                label: Text(column.label),
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
                cells: [
                  for (final column in columns)
                    DataCell(_buildCell(column, record[column.field])),
                  if (rowActions.isNotEmpty)
                    DataCell(Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        for (final action in rowActions)
                          TextButton(
                            key: Key(
                                'hatake.rowaction.${action.id}.${record[_def.keyField]}'),
                            onPressed: () =>
                                _runAction(action, record: record),
                            child: Text(action.label),
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
