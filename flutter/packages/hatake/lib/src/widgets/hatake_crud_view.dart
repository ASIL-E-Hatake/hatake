import 'package:flutter/widgets.dart';
import 'package:hatake_core/hatake_core.dart';

import '../runtime/crud_controller.dart';
import 'hatake_scope.dart';

/// Renders a [CrudLike] page (crud, master): resolves its repository from the
/// enclosing [HatakeScope], drives a [CrudController], and delegates all
/// presentation to the scope's [Renderer].
class HatakeCrudView extends StatefulWidget {
  final CrudLike definition;

  const HatakeCrudView({super.key, required this.definition});

  @override
  State<HatakeCrudView> createState() => _HatakeCrudViewState();
}

class _HatakeCrudViewState extends State<HatakeCrudView> {
  CrudController? _controller;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _controller ??= _createController();
  }

  CrudController _createController() {
    final scope = HatakeScope.of(context);
    final repository = scope.repositories.resolve(widget.definition.repository);
    final controller = CrudController(
      definition: widget.definition,
      repository: repository,
      formValidator: FormValidator(scope.validators),
      formNormalizer: FormNormalizer(scope.converters),
    );
    // Kick off the initial load after the first frame.
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
          renderer.buildCrudPage(context, widget.definition, controller),
    );
  }
}
