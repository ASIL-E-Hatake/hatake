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
export 'src/runtime/dashboard_controller.dart';
export 'src/runtime/dashboard_item_state.dart';
export 'src/runtime/detail_controller.dart';
export 'src/runtime/export_sink.dart';
export 'src/runtime/form_controller.dart';
export 'src/runtime/hatake_router.dart';
export 'src/runtime/list_controller.dart';
export 'src/runtime/registry_snapshot.dart';
export 'src/runtime/report_controller.dart';
export 'src/runtime/repository_registry.dart';
export 'src/runtime/sub_table_controller.dart';
export 'src/runtime/wizard_controller.dart';
export 'src/widgets/hatake_app.dart';
export 'src/widgets/hatake_router_scope.dart';
export 'src/widgets/hatake_scope.dart';
export 'src/widgets/hatake_crud_view.dart';
export 'src/widgets/hatake_dashboard_view.dart';
export 'src/widgets/hatake_detail_view.dart';
export 'src/widgets/hatake_form_view.dart';
export 'src/widgets/hatake_report_view.dart';
export 'src/widgets/hatake_search_view.dart';
export 'src/widgets/hatake_wizard_view.dart';
export 'src/widgets/hatake_page_view.dart';
