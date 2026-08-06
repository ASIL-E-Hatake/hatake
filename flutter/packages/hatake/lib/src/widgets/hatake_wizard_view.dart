import 'package:flutter/widgets.dart';
import 'package:hatake_core/hatake_core.dart';

import '../runtime/wizard_controller.dart';
import 'hatake_scope.dart';

/// Renders a [WizardPageDefinition]: resolves the repository from the enclosing
/// [HatakeScope], drives a [WizardController] (create when [recordKey] is null,
/// edit otherwise), and delegates presentation to the scope's renderer.
class HatakeWizardView extends StatefulWidget {
  final WizardPageDefinition definition;
  final Object? recordKey;

  const HatakeWizardView({
    super.key,
    required this.definition,
    this.recordKey,
  });

  @override
  State<HatakeWizardView> createState() => _HatakeWizardViewState();
}

class _HatakeWizardViewState extends State<HatakeWizardView> {
  WizardController? _controller;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _controller ??= _createController();
  }

  WizardController _createController() {
    final scope = HatakeScope.of(context);
    final controller = WizardController(
      definition: widget.definition,
      repository: scope.repositories.resolve(widget.definition.repository),
      recordKey: widget.recordKey,
      validator: FormValidator(scope.validators),
      normalizer: FormNormalizer(scope.converters),
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
          renderer.buildWizardPage(context, widget.definition, controller),
    );
  }
}
