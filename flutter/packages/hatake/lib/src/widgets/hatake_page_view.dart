import 'package:flutter/widgets.dart';
import 'package:hatake_core/hatake_core.dart';

import 'hatake_crud_view.dart';
import 'hatake_dashboard_view.dart';
import 'hatake_detail_view.dart';
import 'hatake_form_view.dart';
import 'hatake_report_view.dart';
import 'hatake_scope.dart';
import 'hatake_search_view.dart';
import 'hatake_wizard_view.dart';

/// Renders any [PageDefinition] by dispatching to the view for its kind.
///
/// This is the recommended entry point; it stays exhaustive as new page kinds
/// are added (`PageDefinition` is sealed). [recordKey] supplies the record for
/// single-record pages (e.g. detail); list pages ignore it.
class HatakePageView extends StatelessWidget {
  final PageDefinition definition;
  final Object? recordKey;

  const HatakePageView({super.key, required this.definition, this.recordKey});

  @override
  Widget build(BuildContext context) {
    // 画面自身の `roles`（0.9.22）。持たない人には**中身を出さない**＝メニューで隠しても、
    // URL やタブの復元で直に来られる。読み込み（Repository）も始めない。
    if (!canOpenPage(definition, HatakeScope.of(context).roles)) {
      return const _Forbidden();
    }
    return switch (definition) {
      final CrudPageDefinition d => HatakeCrudView(definition: d),
      final MasterPageDefinition d => HatakeCrudView(definition: d),
      final SearchPageDefinition d => HatakeSearchView(definition: d),
      final DetailPageDefinition d =>
        HatakeDetailView(definition: d, recordKey: recordKey),
      final FormPageDefinition d =>
        HatakeFormView(definition: d, recordKey: recordKey),
      final WizardPageDefinition d =>
        HatakeWizardView(definition: d, recordKey: recordKey),
      final DashboardPageDefinition d => HatakeDashboardView(definition: d),
      final ReportPageDefinition d => HatakeReportView(definition: d),
    };
  }
}

/// 開く権限の無い画面。Renderer に依らない（どの見た目でも同じ字・同じキー）。
class _Forbidden extends StatelessWidget {
  const _Forbidden();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(24),
        child: Text(
          'この画面を開く権限がありません',
          key: Key('hatake.page.forbidden'),
        ),
      ),
    );
  }
}
