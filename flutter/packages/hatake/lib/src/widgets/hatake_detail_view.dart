import 'package:flutter/widgets.dart';
import 'package:hatake_core/hatake_core.dart';

import '../runtime/detail_controller.dart';
import 'hatake_scope.dart';

/// Renders a [DetailPageDefinition] for the record identified by [recordKey]:
/// resolves the repository from the enclosing [HatakeScope], drives a
/// [DetailController], and delegates presentation to the scope's renderer.
class HatakeDetailView extends StatefulWidget {
  final DetailPageDefinition definition;
  final Object? recordKey;

  const HatakeDetailView({
    super.key,
    required this.definition,
    required this.recordKey,
  });

  @override
  State<HatakeDetailView> createState() => _HatakeDetailViewState();
}

class _HatakeDetailViewState extends State<HatakeDetailView> {
  DetailController? _controller;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _controller ??= _createController();
  }

  DetailController _createController() {
    final scope = HatakeScope.of(context);
    final repository = scope.repositories.resolve(widget.definition.repository);
    final controller =
        DetailController(repository: repository, recordKey: widget.recordKey);
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
          renderer.buildDetailPage(context, widget.definition, controller),
    );
  }
}
