import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:hatake_material/hatake_material.dart';
import 'package:hatake_yaml/hatake_yaml.dart';

import 'customer_repository.dart';
import 'definition_dialog.dart';
import 'definition_source.dart';
import 'export_dialog.dart';
import 'order_line_repository.dart';
import 'order_repository.dart';
import 'product_repository.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final yaml = await rootBundle.loadString('assets/sales_app.yaml');
  // strict: 知らないキーがあれば起動時に落ちる。デモの定義は「そのまま真似される
  // もの」なので、書き間違いを黙って無視されるより早く気づきたい。
  final definition = parseAppYaml(yaml, strict: true);
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

  /// Lets the export sink reach the widget tree. A sink is plain I/O and gets no
  /// [BuildContext] — a real app downloads or saves the file, so it needs none;
  /// this demo shows the document, so it goes through the navigator.
  static final GlobalKey<NavigatorState> navigatorKey =
      GlobalKey<NavigatorState>();

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'hatake example',
      debugShowCheckedModeBanner: false,
      navigatorKey: navigatorKey,
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
        // Where `type: export` actions send their document. The framework builds
        // the CSV; getting it to the user is the application's job.
        exportSink: (request) async {
          final context = navigatorKey.currentContext;
          if (context == null) return;
          await ExportDialog.show(context, request);
        },
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
