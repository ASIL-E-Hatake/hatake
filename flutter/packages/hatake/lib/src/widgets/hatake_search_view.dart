import 'package:flutter/widgets.dart';
import 'package:hatake_core/hatake_core.dart';

import '../runtime/list_controller.dart';
import 'hatake_scope.dart';

/// Renders a [SearchPageDefinition]: resolves its repository from the enclosing
/// [HatakeScope], drives a [ListController], and delegates presentation to the
/// scope's renderer.
class HatakeSearchView extends StatefulWidget {
  final SearchPageDefinition definition;

  const HatakeSearchView({super.key, required this.definition});

  @override
  State<HatakeSearchView> createState() => _HatakeSearchViewState();
}

class _HatakeSearchViewState extends State<HatakeSearchView> {
  ListController? _controller;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _controller ??= _createController();
  }

  ListController _createController() {
    final scope = HatakeScope.of(context);
    final repository = scope.repositories.resolve(widget.definition.repository);
    final controller = ListController(
      repository: repository,
      pageSize: widget.definition.table.pagination.pageSize,
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
          renderer.buildSearchPage(context, widget.definition, controller),
    );
  }
}
