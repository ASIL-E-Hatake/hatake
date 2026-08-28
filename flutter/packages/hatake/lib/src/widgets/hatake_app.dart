import 'package:flutter/widgets.dart';
import 'package:hatake_core/hatake_core.dart';

import '../runtime/hatake_router.dart';
import '../runtime/route_url.dart';
import 'hatake_router_scope.dart';
import 'hatake_scope.dart';

/// Entry point for a whole app: sets up the [HatakeRouter] from an
/// [AppDefinition] and delegates the shell (menu + content) to the scope's
/// renderer. Wrap it in a [HatakeScope] like the single-page views.
///
/// On the web the address bar follows the current screen and vice versa, so a
/// screen can be linked to, reloaded and reached with the browser's back button
/// (see [routeToUri] for the shape of the URL).
class HatakeApp extends StatefulWidget {
  final AppDefinition app;

  /// Keeps the URL and the current screen in step. Turn it off for an app that
  /// owns its own routing (one embedding hatake in a larger navigator), so two
  /// routers do not fight over the address bar.
  final bool syncUrl;

  /// Where the URL is read and written. Defaults to the browser; a test passes
  /// its own so the sync can be exercised without one.
  final RouteUrl url;

  /// 画面をどう開くか（[AppNavigation]）を**定義より優先する**。
  ///
  /// null なら定義の `app.navigation`（書いていなければ `single`）。同じ定義を
  /// 端末で出し分けるための口＝PC ではタブ、タブレットでは遷移、が同じ定義でできる。
  /// 業務としての既定は定義に書き、アプリの都合はここで上書きする。
  final String? navigation;

  const HatakeApp({
    super.key,
    required this.app,
    this.syncUrl = true,
    this.url = const SystemRouteUrl(),
    this.navigation,
  });

  @override
  State<HatakeApp> createState() => _HatakeAppState();
}

class _HatakeAppState extends State<HatakeApp> with WidgetsBindingObserver {
  late final HatakeRouter _router = HatakeRouter(
    _initialRoute(),
    navigation: widget.navigation ?? widget.app.navigation,
  );

  /// True while the router is being moved *by* the platform (the back button),
  /// so the answer is not written straight back into the history as a new entry.
  bool _fromPlatform = false;

  @override
  void initState() {
    super.initState();
    if (!widget.syncUrl) return;
    WidgetsBinding.instance.addObserver(this);
    _router.addListener(_writeUrl);
    // Spell out the first screen (`/` → `/dashboard`) by rewriting the entry
    // instead of adding one — otherwise back would return to a URL that only
    // ever redirected here.
    widget.url.write(routeToUri(_router.current), replace: true);
  }

  /// The route the app was opened with, when the URL names a page this app has.
  /// Anything else — no URL, `/`, a page from another build — opens home, which
  /// is the only screen guaranteed to exist.
  AppRoute _initialRoute() {
    if (widget.syncUrl) {
      final uri = widget.url.initial;
      if (uri != null) {
        final route = routeFromUri(uri, knows: _hasPage);
        if (route != null) return route;
      }
    }
    return AppRoute(_initialPageId());
  }

  bool _hasPage(String id) => widget.app.pages.any((p) => p.id == id);

  String _initialPageId() {
    final app = widget.app;
    if (app.home != null) {
      final match = _firstLeaf(
        app.menu,
        (m) => m.id == app.home || m.page == app.home,
      );
      return match?.page ?? app.home!;
    }
    final first = _firstLeaf(app.menu, (_) => true);
    return first?.page ?? (app.pages.isNotEmpty ? app.pages.first.id : '');
  }

  MenuItem? _firstLeaf(List<MenuItem> menu, bool Function(MenuItem) test) {
    for (final item in menu) {
      if (item.isGroup) {
        final found = _firstLeaf(item.children, test);
        if (found != null) return found;
      } else if (item.page != null && test(item)) {
        return item;
      }
    }
    return null;
  }

  void _writeUrl() {
    if (_fromPlatform) return;
    widget.url.write(routeToUri(_router.current));
  }

  /// The browser moved (back, forward, a pasted URL). Answering false leaves the
  /// URL alone, which is what an id from another app should do.
  ///
  /// A history move **replaces** the stack rather than pushing onto it: the
  /// browser's history is already the record of where the user has been, and
  /// keeping a second one behind it would make back mean two different things.
  @override
  Future<bool> didPushRouteInformation(RouteInformation information) async {
    final route = routeFromUri(information.uri, knows: _hasPage);
    if (route == null) return false;
    _fromPlatform = true;
    _router.go(route.pageId, params: route.params);
    _fromPlatform = false;
    return true;
  }

  @override
  void dispose() {
    if (widget.syncUrl) {
      _router.removeListener(_writeUrl);
      WidgetsBinding.instance.removeObserver(this);
    }
    _router.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final renderer = HatakeScope.of(context).renderer;
    return HatakeRouterScope(
      router: _router,
      child: renderer.buildApp(context, widget.app, _router),
    );
  }
}
