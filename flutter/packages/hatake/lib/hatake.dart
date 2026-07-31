/// hatake — the Flutter renderer runtime.
///
/// Re-exports hatake_core, and provides the [Renderer] contract, the
/// renderer-independent [CrudController] runtime, a [RepositoryRegistry], and
/// the [HatakeScope] / [HatakeCrudView] widgets that wire them together.
library;

export 'package:hatake_core/hatake_core.dart';

export 'src/renderer/renderer.dart';
export 'src/runtime/action_registry.dart';
export 'src/runtime/crud_controller.dart';
export 'src/runtime/detail_controller.dart';
export 'src/runtime/form_controller.dart';
export 'src/runtime/list_controller.dart';
export 'src/runtime/repository_registry.dart';
export 'src/widgets/hatake_scope.dart';
export 'src/widgets/hatake_crud_view.dart';
export 'src/widgets/hatake_detail_view.dart';
export 'src/widgets/hatake_form_view.dart';
export 'src/widgets/hatake_search_view.dart';
export 'src/widgets/hatake_page_view.dart';
