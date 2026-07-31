import 'package:flutter/widgets.dart';
import 'package:hatake_core/hatake_core.dart';

import '../runtime/form_controller.dart';
import 'hatake_scope.dart';

/// Renders a [FormPageDefinition]: resolves the repository from the enclosing
/// [HatakeScope], drives a [FormController] (create when [recordKey] is null,
/// edit otherwise), and delegates presentation to the scope's renderer.
class HatakeFormView extends StatefulWidget {
  final FormPageDefinition definition;
  final Object? recordKey;

  const HatakeFormView({
    super.key,
    required this.definition,
    this.recordKey,
  });

  @override
  State<HatakeFormView> createState() => _HatakeFormViewState();
}

class _HatakeFormViewState extends State<HatakeFormView> {
  FormController? _controller;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _controller ??= _createController();
  }

  FormController _createController() {
    final scope = HatakeScope.of(context);
    final repository = scope.repositories.resolve(widget.definition.repository);
    final controller = FormController(
      definition: widget.definition,
      repository: repository,
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
          renderer.buildFormPage(context, widget.definition, controller),
    );
  }
}
