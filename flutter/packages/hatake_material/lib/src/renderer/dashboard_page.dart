part of '../material_renderer.dart';

/// Dashboard page renderer: a grid of independently loading cards.
class _MaterialDashboardPage extends StatelessWidget {
  final DashboardPageDefinition definition;
  final DashboardController controller;
  final FormatterRegistry formatters;
  final Map<String, MaterialDashboardItemBuilder> itemBuilders;

  const _MaterialDashboardPage({
    required this.definition,
    required this.controller,
    required this.formatters,
    required this.itemBuilders,
  });

  static const double _gap = 12;

  /// Narrower than this and the board collapses to a single column.
  static const double _minCardWidth = 260;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final roles = HatakeScope.of(context).roles;
    final items =
        definition.items.where((i) => isAllowed(i.roles, roles)).toList();

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
              IconButton(
                key: const Key('hatake.dashboard.reload'),
                tooltip: '再読み込み',
                icon: const Icon(Icons.refresh),
                onPressed: controller.loading ? null : controller.load,
              ),
              const SizedBox(width: 8),
              ..._pageActionButtons(context, definition.actions, controller),
            ],
          ),
          const SizedBox(height: 12),
          if (definition.search != null) ...[
            _SearchArea(
              search: definition.search!,
              onSearch: controller.search,
            ),
            const SizedBox(height: 12),
          ],
          Expanded(
            child: SingleChildScrollView(child: _grid(context, items)),
          ),
        ],
      ),
    );
  }

  /// Lays the cards out on a `layout.columns` grid, honouring each item's span
  /// and collapsing to one column when there is no room.
  Widget _grid(BuildContext context, List<DashboardItemDefinition> items) {
    final columns = definition.layout.columns < 1 ? 1 : definition.layout.columns;
    return LayoutBuilder(
      builder: (context, constraints) {
        final available = constraints.maxWidth.isFinite
            ? constraints.maxWidth
            : _minCardWidth * columns + _gap * (columns - 1);
        final perRow = available < _minCardWidth * 2 ? 1 : columns;
        final cell =
            ((available - _gap * (perRow - 1)) / perRow).floorToDouble();
        return Wrap(
          spacing: _gap,
          runSpacing: _gap,
          children: [
            for (final item in items)
              SizedBox(
                width: _cardWidth(item, cell, perRow),
                child: _card(context, item),
              ),
          ],
        );
      },
    );
  }

  double _cardWidth(DashboardItemDefinition item, double cell, int perRow) {
    final span = item.span < 1 ? 1 : (item.span > perRow ? perRow : item.span);
    return cell * span + _gap * (span - 1);
  }

  Widget _card(BuildContext context, DashboardItemDefinition item) {
    final theme = Theme.of(context);
    final state = controller.stateOf(item);
    final action = _actionById(item.action);
    return Card(
      key: Key('hatake.dashboard.${item.id}'),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: action == null
            ? null
            : () => _runPageAction(context, action, controller),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: SizedBox(
            height: _cardHeight(item),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.title,
                  style: theme.textTheme.titleSmall
                      ?.copyWith(color: theme.colorScheme.outline),
                ),
                const SizedBox(height: 8),
                Expanded(child: _body(context, item, state)),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// Card height: uniform per kind so rows line up, overridable per item with
  /// `config: { height: <px> }`.
  double _cardHeight(DashboardItemDefinition item) {
    final configured = item.config['height'];
    if (configured is num) return configured.toDouble();
    return item.type == DashboardItemTypes.metric ? 76 : 220;
  }

  Widget _body(
    BuildContext context,
    DashboardItemDefinition item,
    DashboardItemState state,
  ) {
    if (state.loading) {
      return const Center(
        child: SizedBox(
          width: 20,
          height: 20,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      );
    }
    if (state.error != null) {
      return SingleChildScrollView(
        child: Text(
          'エラー: ${state.error}',
          key: Key('hatake.dashboard.${item.id}.error'),
          style: TextStyle(color: Theme.of(context).colorScheme.error),
        ),
      );
    }
    final custom = itemBuilders[item.type];
    if (custom != null) {
      return custom(MaterialDashboardItemContext(
        buildContext: context,
        item: item,
        state: state,
        formatters: formatters,
      ));
    }
    switch (item.type) {
      case DashboardItemTypes.metric:
        return _metric(context, item, state);
      case DashboardItemTypes.table:
        return _table(context, item, state);
      case DashboardItemTypes.chart:
        return _DashboardChart(
          item: item,
          buckets: state.buckets,
          formatters: formatters,
        );
      default:
        return Text(
          '項目型 "${item.type}" は未対応です',
          key: Key('hatake.dashboard.${item.id}.unsupported'),
          style: TextStyle(color: Theme.of(context).colorScheme.error),
        );
    }
  }

  Widget _metric(
    BuildContext context,
    DashboardItemDefinition item,
    DashboardItemState state,
  ) {
    final value = state.value;
    final text = value == null
        ? '—'
        : item.format != null
            ? formatters.format(item.format!, value, item.config)
            : value.toString();
    return Align(
      alignment: Alignment.centerLeft,
      child: Text(
        text,
        key: Key('hatake.dashboard.${item.id}.value'),
        style: Theme.of(context).textTheme.headlineMedium,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
    );
  }

  Widget _table(
    BuildContext context,
    DashboardItemDefinition item,
    DashboardItemState state,
  ) {
    final theme = Theme.of(context);
    final roles = HatakeScope.of(context).roles;
    final columns =
        item.columns.where((c) => isAllowed(c.roles, roles)).toList();
    if (state.rows.isEmpty || columns.isEmpty) {
      return Center(
        child: Text(
          'データがありません',
          key: Key('hatake.dashboard.${item.id}.empty'),
        ),
      );
    }
    return SingleChildScrollView(
      key: Key('hatake.dashboard.${item.id}.table'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              for (final column in columns)
                Expanded(
                  child: Text(
                    column.label,
                    style: theme.textTheme.bodySmall
                        ?.copyWith(color: theme.colorScheme.outline),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
            ],
          ),
          const Divider(height: 12),
          for (final row in state.rows)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                children: [
                  for (final column in columns)
                    Expanded(
                      child: Text(
                        _cellText(column, row[column.field]),
                        style: theme.textTheme.bodyMedium,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  String _cellText(ColumnDefinition column, Object? value) {
    if (column.format != null) {
      return formatters.format(column.format!, value, column.config);
    }
    return value?.toString() ?? '';
  }

  ActionDefinition? _actionById(String? id) {
    if (id == null) return null;
    for (final action in definition.actions) {
      if (action.id == id) return action;
    }
    return null;
  }
}
