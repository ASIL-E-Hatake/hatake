import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:hatake_material/hatake_material.dart';
import 'package:hatake_yaml/hatake_yaml.dart';

import 'customer_repository.dart';
import 'definition_dialog.dart';
import 'definition_source.dart';
import 'order_line_repository.dart';
import 'order_repository.dart';
import 'product_repository.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final yaml = await rootBundle.loadString('assets/sales_app.yaml');
  final definition = parseAppYaml(yaml);
  runApp(HatakeExampleApp(definition: definition, source: yaml));
}

/// Renders a whole app — menu shell plus every page — from a single
/// [AppDefinition]. The UI is produced entirely from the definition; there is
/// no screen-specific widget code here. In-memory repositories stand in for a
/// real backend.
///
/// [source] is the raw YAML, kept so the "定義を見る" action can show visitors
/// the definition behind the screen they are looking at.
class HatakeExampleApp extends StatelessWidget {
  final AppDefinition definition;
  final String source;

  const HatakeExampleApp({
    super.key,
    required this.definition,
    required this.source,
  });

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'hatake example',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorSchemeSeed: Colors.green,
        useMaterial3: true,
      ),
      home: HatakeScope(
        repositories: RepositoryRegistry({
          'customerRepository': CustomerRepository.seeded(),
          'productRepository': ProductRepository.seeded(),
          'orderRepository': OrderRepository.seeded(),
          // 明細を別テーブルに持つ画面（subTable の source）用。
          'orderLineRepository': OrderLineRepository.seeded(),
        }),
        renderer: const MaterialRenderer(),
        // Plugin action: each page declares
        //   { type: plugin, plugin: showDefinition, config: { page: <id> } }
        // and this handler shows the matching slice of the YAML.
        actions: ActionRegistry({
          'showDefinition': (ctx) async {
            final pageId = ctx.action.config['page']?.toString() ?? '';
            final yaml = extractPageYaml(source, pageId);
            if (yaml == null) return;
            await DefinitionDialog.show(
              ctx.buildContext,
              title: pageId,
              yaml: yaml,
            );
          },
        }),
        child: HatakeApp(app: definition),
      ),
    );
  }
}
