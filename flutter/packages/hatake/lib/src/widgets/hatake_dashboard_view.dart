import 'package:flutter/widgets.dart';
import 'package:hatake_core/hatake_core.dart';

import '../runtime/dashboard_controller.dart';
import 'hatake_scope.dart';

/// Renders a [DashboardPageDefinition]: drives a [DashboardController] over the
/// repositories in the enclosing [HatakeScope] and delegates presentation to the
/// scope's renderer.
class HatakeDashboardView extends StatefulWidget {
  final DashboardPageDefinition definition;

  const HatakeDashboardView({super.key, required this.definition});

  @override
  State<HatakeDashboardView> createState() => _HatakeDashboardViewState();
}

class _HatakeDashboardViewState extends State<HatakeDashboardView> {
  DashboardController? _controller;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _controller ??= _createController();
  }

  DashboardController _createController() {
    final scope = HatakeScope.of(context);
    // Cards resolve their own repositories, so the whole registry is passed.
    final controller = DashboardController(
      definition: widget.definition,
      repositories: scope.repositories,
    );
    controller.init();
    return controller;
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller!;
    final renderer = HatakeScope.of(context).renderer;
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) =>
          renderer.buildDashboardPage(context, widget.definition, controller),
    );
  }
}
