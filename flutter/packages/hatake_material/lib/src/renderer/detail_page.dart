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
              for (final action in definition.actions)
                if (isAllowed(action.roles, HatakeScope.of(context).roles)) ...[
                  FilledButton(
                    key: Key('hatake.action.${action.id}'),
                    onPressed: () => _runAction(context, action),
                    child: Text(action.label),
                  ),
                  const SizedBox(width: 8),
                ],
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
                    child: Text(
                      _display(field, record[field.field]),
                      key: Key('hatake.detail.${field.field}'),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ],
    );
  }

  String _display(FieldDefinition field, Object? value) {
    if (field.format != null) {
      return formatters.format(field.format!, value, field.config);
    }
    return value?.toString() ?? '';
  }

  /// One dispatcher for every page kind (see `_runPageAction`). A detail page has
  /// no rows, so an `export` action there reports that instead of pretending.
  Future<void> _runAction(BuildContext context, ActionDefinition action) {
    return _runPageAction(
      context,
      action,
      controller,
      record: controller.record,
    );
  }
}
