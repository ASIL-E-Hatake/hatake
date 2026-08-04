part of '../material_renderer.dart';

/// Trail of the pushed routes (e.g. 受注照会 › 受注詳細). Ancestors are tappable
/// and jump straight back via [HatakeRouter.popTo]; the current page is plain.
/// Shown only when something has been pushed.
class _AppBreadcrumb extends StatelessWidget {
  final AppDefinition app;
  final HatakeRouter router;

  const _AppBreadcrumb({required this.app, required this.router});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final stack = router.stack;
    final crumbs = <Widget>[];

    for (var i = 0; i < stack.length; i++) {
      final route = stack[i];
      final label = app.pageById(route.pageId)?.title ?? route.pageId;
      final isCurrent = i == stack.length - 1;
      if (i > 0) {
        crumbs.add(Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Text('›', style: TextStyle(color: theme.colorScheme.outline)),
        ));
      }
      crumbs.add(
        isCurrent
            ? Text(label, style: theme.textTheme.bodySmall)
            : InkWell(
                key: Key('hatake.breadcrumb.${route.pageId}'),
                onTap: () => router.popTo(i),
                child: Text(
                  label,
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: theme.colorScheme.primary),
                ),
              ),
      );
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      child: Row(children: crumbs),
    );
  }
}
