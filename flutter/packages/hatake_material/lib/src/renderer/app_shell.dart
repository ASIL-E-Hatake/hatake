part of '../material_renderer.dart';

/// Material app shell: navigation menu + the current page.
///
/// Responsive: a permanent sidebar from [_wideBreakpoint] up, a Drawer below it
/// (Material's compact breakpoint). Rebuilds on route change; menu and pages are
/// role-gated, and pushed routes get a breadcrumb.
class _MaterialAppShell extends StatelessWidget {
  final AppDefinition app;
  final HatakeRouter router;

  const _MaterialAppShell({required this.app, required this.router});

  /// Material's compact/medium boundary: below this the menu collapses.
  static const double _wideBreakpoint = 600;

  @override
  Widget build(BuildContext context) {
    final theme = app.theme;
    if (theme != null) {
      // Applied here rather than at the caller's MaterialApp so that `app.theme`
      // works with nothing but the definition. Everything below — menu, pages,
      // dialogs opened from them — inherits it.
      return Theme(
        data: materialThemeOf(
          theme,
          platformBrightness: MediaQuery.platformBrightnessOf(context),
        ),
        child: Builder(builder: _buildShell),
      );
    }
    return _buildShell(context);
  }

  Widget _buildShell(BuildContext context) {
    final roles = HatakeScope.of(context).roles;
    return ListenableBuilder(
      listenable: router,
      builder: (context, _) {
        final route = router.current;
        final page = app.pageById(route.pageId);
        // A menu is only worth showing when there is somewhere else to go.
        final hasMenu = _visibleLeaves(app.menu, roles).length >= 2;
        final wide = MediaQuery.sizeOf(context).width >= _wideBreakpoint;

        final content = Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (router.canPop) _AppBreadcrumb(app: app, router: router),
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
        );

        return Scaffold(
          appBar: AppBar(
            title: Text(app.title),
            // Back wins over the drawer handle while inside a pushed route.
            leading: router.canPop
                ? IconButton(
                    key: const Key('hatake.app.back'),
                    icon: const Icon(Icons.arrow_back),
                    onPressed: router.pop,
                  )
                : null,
          ),
          drawer: hasMenu && !wide
              ? Drawer(
                  child: SafeArea(
                    // Builder gives a context under Scaffold so the drawer can
                    // close itself on selection.
                    child: Builder(
                      builder: (inner) => _buildMenu(
                        roles,
                        route.pageId,
                        onSelected: () => Scaffold.of(inner).closeDrawer(),
                      ),
                    ),
                  ),
                )
              : null,
          body: hasMenu && wide
              ? Row(
                  children: [
                    SizedBox(
                      width: 220,
                      child: _buildMenu(roles, route.pageId),
                    ),
                    const VerticalDivider(width: 1),
                    Expanded(child: content),
                  ],
                )
              : content,
        );
      },
    );
  }

  Widget _buildMenu(
    Set<String> roles,
    String currentPageId, {
    VoidCallback? onSelected,
  }) {
    return _AppMenu(
      menu: app.menu,
      roles: roles,
      currentPageId: currentPageId,
      onSelect: (pageId) {
        onSelected?.call();
        router.go(pageId);
      },
    );
  }
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
