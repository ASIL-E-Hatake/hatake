import 'package:flutter/widgets.dart';

import '../runtime/hatake_router.dart';

/// Exposes the active [HatakeRouter] to page renderers so `navigate` actions
/// can push routes. Present only inside a `HatakeApp`; standalone pages get
/// null from [maybeOf] and treat navigate as a no-op.
class HatakeRouterScope extends InheritedWidget {
  final HatakeRouter router;

  const HatakeRouterScope({
    super.key,
    required this.router,
    required super.child,
  });

  static HatakeRouter? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<HatakeRouterScope>()?.router;

  @override
  bool updateShouldNotify(HatakeRouterScope oldWidget) =>
      oldWidget.router != router;
}
