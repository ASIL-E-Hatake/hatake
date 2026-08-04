import 'package:flutter/widgets.dart';
import 'package:hatake_core/hatake_core.dart';

import '../runtime/hatake_router.dart';
import 'hatake_router_scope.dart';
import 'hatake_scope.dart';

/// Entry point for a whole app: sets up the [HatakeRouter] from an
/// [AppDefinition] and delegates the shell (menu + content) to the scope's
/// renderer. Wrap it in a [HatakeScope] like the single-page views.
class HatakeApp extends StatefulWidget {
  final AppDefinition app;

  const HatakeApp({super.key, required this.app});

  @override
  State<HatakeApp> createState() => _HatakeAppState();
}

class _HatakeAppState extends State<HatakeApp> {
  late final HatakeRouter _router = HatakeRouter(AppRoute(_initialPageId()));

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

  @override
  void dispose() {
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
