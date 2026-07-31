import 'package:flutter/widgets.dart';
import 'package:hatake_core/hatake_core.dart';

import 'hatake_crud_view.dart';
import 'hatake_detail_view.dart';
import 'hatake_form_view.dart';
import 'hatake_search_view.dart';

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
    return switch (definition) {
      final CrudPageDefinition d => HatakeCrudView(definition: d),
      final MasterPageDefinition d => HatakeCrudView(definition: d),
      final SearchPageDefinition d => HatakeSearchView(definition: d),
      final DetailPageDefinition d =>
        HatakeDetailView(definition: d, recordKey: recordKey),
      final FormPageDefinition d =>
        HatakeFormView(definition: d, recordKey: recordKey),
    };
  }
}
