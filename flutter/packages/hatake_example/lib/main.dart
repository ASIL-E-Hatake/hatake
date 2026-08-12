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
import 'playground.dart';
import 'product_repository.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final yaml = await rootBundle.loadString('assets/sales_app.yaml');
  // strict: 知らないキーがあれば起動時に落ちる。デモの定義は「そのまま真似される
  // もの」なので、書き間違いを黙って無視されるより早く気づきたい。
  final definition = parseAppYaml(yaml, strict: true);
  final samples = {
    '販売管理アプリ（app）': yaml,
    '顧客マスタ（crud）': await rootBundle.loadString('assets/customer_master.yaml'),
  };
  runApp(HatakeExampleApp(
    definition: definition,
    source: yaml,
    samples: samples,
    // `?playground=1` で直接プレイグラウンドを開く（紹介記事から直リンクするため）。
    // `?yaml=<base64>` が付いていれば、その定義を最初から入れておく。
    openPlayground: Uri.base.queryParameters.containsKey('playground'),
    sharedSource: Playground.sourceFromUrl(Uri.base),
  ));
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

  /// プレイグラウンドの「例を入れる」に出す定義（名前 → YAML）。
  final Map<String, String> samples;

  /// 起動時にプレイグラウンドを開くか（`?playground=1`）。
  final bool openPlayground;

  /// 共有リンク（`?yaml=`）で渡された定義。
  final String? sharedSource;

  const HatakeExampleApp({
    super.key,
    required this.definition,
    required this.source,
    this.samples = const {},
    this.openPlayground = false,
    this.sharedSource,
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
          // その画面の定義を持ってプレイグラウンドを開く（触って壊せる場へ）。
          'openPlayground': (ctx) async {
            final pageId = ctx.action.config['page']?.toString() ?? '';
            await Navigator.of(ctx.buildContext).push(
              MaterialPageRoute<void>(
                builder: (_) => _playground(
                  initial: extractPageYaml(source, pageId) ?? source,
                ),
              ),
            );
          },
        }),
        child: openPlayground
            ? _playground(initial: sharedSource ?? samples.values.firstOrNull)
            : HatakeApp(app: definition),
      ),
    );
  }

  /// プレイグラウンドは定義を書く場なので、デモの Repository ではなく
  /// 「貼られた定義に合わせて作るサンプルデータ」で動く（Playground の中で組む）。
  Widget _playground({String? initial}) => Playground(
        initialSource: initial ?? source,
        samples: samples,
      );
}
