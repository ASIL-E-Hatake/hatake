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

        // 並べて開くなら、**開いているタブを全部作って前面だけ見せる**（作り直さない
        // ＝検索結果も入力もタブに付いて回る。それがタブの値打ち）。
        final content = router.tabsOpen
            ? _tabbedContent()
            : _singleContent(route, page);

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
                        inner,
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
                      child: _buildMenu(context, roles, route.pageId),
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

  /// 1画面ぶん（`single`）。
  Widget _singleContent(AppRoute route, PageDefinition? page) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (router.canPop) _AppBreadcrumb(app: app, router: router),
        // Fresh state per route so controllers re-init.
        Expanded(
          child: _pageOrMissing(
            route,
            page,
            key: ValueKey('${route.pageId}#${router.depth}'),
          ),
        ),
      ],
    );
  }

  /// 並べて開いた全部（前面だけ見せる）。
  ///
  /// 鍵はタブの**安定した id**（閉じても番号を詰めない）＋そのタブの深さ。これで
  /// 「他のタブを閉じたら残ったタブが作り直される」が起きない。
  Widget _tabbedContent() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _AppTabBar(app: app, router: router),
        if (router.canPop) _AppBreadcrumb(app: app, router: router),
        Expanded(
          child: IndexedStack(
            index: router.frontTab,
            sizing: StackFit.expand,
            children: [
              for (final tab in router.tabs)
                _pageOrMissing(
                  tab.current,
                  app.pageById(tab.current.pageId),
                  key: ValueKey(
                      'tab${tab.id}#${tab.depth}#${tab.current.pageId}'),
                ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _pageOrMissing(
    AppRoute route,
    PageDefinition? page, {
    required Key key,
  }) {
    if (page == null) {
      return Center(
        child: Text(
          'ページ "${route.pageId}" が見つかりません',
          key: const Key('hatake.app.notfound'),
        ),
      );
    }
    return HatakePageView(
      key: key,
      definition: page,
      recordKey: route.params['id'],
    );
  }

  Widget _buildMenu(
    BuildContext context,
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
        // タブなら「開いていればそれを前に出す」。上限に達していたら**開かずに言う**。
        if (!router.select(pageId)) _tooManyTabs(context);
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
  // 既定は「いまの画面の続き」。`open: tab` と書いたものだけ別のタブで開く（並べる
  // 場所が無いアプリでは無視される＝書いても壊れない）。
  final opened = router.navigate(
    page,
    params: params,
    newTab: action.open == ActionOpen.tab,
  );
  if (!opened) _tooManyTabs(context);
}
