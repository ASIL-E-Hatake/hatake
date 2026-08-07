import 'package:flutter/widgets.dart';
import 'package:hatake_core/hatake_core.dart';

import '../runtime/report_controller.dart';
import 'hatake_scope.dart';

/// Renders a [ReportPageDefinition]: resolves its repository from the enclosing
/// [HatakeScope], drives a [ReportController], and delegates presentation to the
/// scope's renderer.
class HatakeReportView extends StatefulWidget {
  final ReportPageDefinition definition;

  const HatakeReportView({super.key, required this.definition});

  @override
  State<HatakeReportView> createState() => _HatakeReportViewState();
}

class _HatakeReportViewState extends State<HatakeReportView> {
  ReportController? _controller;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _controller ??= _createController();
  }

  ReportController _createController() {
    final scope = HatakeScope.of(context);
    final controller = ReportController(
      definition: widget.definition,
      repository: scope.repositories.resolve(widget.definition.repository),
    );
    controller.load();
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
          renderer.buildReportPage(context, widget.definition, controller),
    );
  }
}
