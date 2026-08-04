part of '../material_renderer.dart';

/// Material app shell: a NavigationRail of the visible menu leaves plus the
/// current page. Rebuilds on route change; menu/pages are role-gated.
class _MaterialAppShell extends StatelessWidget {
  final AppDefinition app;
  final HatakeRouter router;

  const _MaterialAppShell({required this.app, required this.router});

  @override
  Widget build(BuildContext context) {
    final roles = HatakeScope.of(context).roles;
    return ListenableBuilder(
      listenable: router,
      builder: (context, _) {
        final leaves = _visibleLeaves(app.menu, roles);
        final route = router.current;
        final selected = leaves.indexWhere((l) => l.page == route.pageId);
        final page = app.pageById(route.pageId);

        return Scaffold(
          appBar: AppBar(
            title: Text(app.title),
            leading: router.canPop
                ? IconButton(
                    key: const Key('hatake.app.back'),
                    icon: const Icon(Icons.arrow_back),
                    onPressed: router.pop,
                  )
                : null,
          ),
          body: Row(
            children: [
              if (leaves.length >= 2)
                NavigationRail(
                  selectedIndex: selected < 0 ? null : selected,
                  labelType: NavigationRailLabelType.all,
                  onDestinationSelected: (i) => router.go(leaves[i].page!),
                  destinations: [
                    for (final leaf in leaves)
                      NavigationRailDestination(
                        icon: Icon(_iconFor(leaf.icon)),
                        label: Text(leaf.label),
                      ),
                  ],
                ),
              if (leaves.length >= 2) const VerticalDivider(width: 1),
              Expanded(
                child: page == null
                    ? Center(
                        child: Text(
                          'ページ "${route.pageId}" が見つかりません',
                          key: const Key('hatake.app.notfound'),
                        ),
                      )
                    : HatakePageView(
                        // Fresh state per route so controllers re-init.
                        key: ValueKey('${route.pageId}#${router.depth}'),
                        definition: page,
                        recordKey: route.params['id'],
                      ),
              ),
            ],
          ),
        );
      },
    );
  }
}

/// Flattens the menu tree to the leaves the current roles may see.
List<MenuItem> _visibleLeaves(List<MenuItem> menu, Set<String> roles) {
  final out = <MenuItem>[];
  for (final item in menu) {
    if (!isAllowed(item.roles, roles)) continue;
    if (item.isGroup) {
      out.addAll(_visibleLeaves(item.children, roles));
    } else if (item.page != null) {
      out.add(item);
    }
  }
  return out;
}

/// Handles a `navigate` action: pushes the target route, resolving params
/// (`$row.id` etc.) against [record]. No-op with a hint when not in an app.
void _navigateAction(
  BuildContext context,
  ActionDefinition action, {
  DataRecord? record,
}) {
  final router = HatakeRouterScope.maybeOf(context);
  final page = action.config['page'] as String?;
  if (router == null || page == null) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('遷移先が解決できません（"${action.id}"）')),
    );
    return;
  }
  final params = resolveRouteParams(
    (action.config['params'] as Map?)?.cast<String, Object?>(),
    record,
  );
  router.push(page, params: params);
}

/// Maps a menu icon name to a Material icon (small built-in set; default box).
IconData _iconFor(String? name) {
  switch (name) {
    case 'people':
      return Icons.people;
    case 'settings':
      return Icons.settings;
    case 'dashboard':
      return Icons.dashboard;
    case 'list':
      return Icons.list;
    case 'inventory':
      return Icons.inventory_2;
    default:
      return Icons.folder_outlined;
  }
}
