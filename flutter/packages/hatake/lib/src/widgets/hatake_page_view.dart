import 'package:flutter/widgets.dart';
import 'package:hatake_core/hatake_core.dart';

import 'hatake_crud_view.dart';
import 'hatake_search_view.dart';

/// Renders any [PageDefinition] by dispatching to the view for its kind.
///
/// This is the recommended entry point; it stays exhaustive as new page kinds
/// are added (`PageDefinition` is sealed).
class HatakePageView extends StatelessWidget {
  final PageDefinition definition;

  const HatakePageView({super.key, required this.definition});

  @override
  Widget build(BuildContext context) {
    return switch (definition) {
      final CrudPageDefinition d => HatakeCrudView(definition: d),
      final SearchPageDefinition d => HatakeSearchView(definition: d),
    };
  }
}
