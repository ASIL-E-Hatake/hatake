import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:hatake_material/hatake_material.dart';
import 'package:hatake_yaml/hatake_yaml.dart';

import 'bulk_dialog.dart';
import 'customer_repository.dart';
import 'definition_dialog.dart';
import 'definition_source.dart';
import 'export_dialog.dart';
import 'order_line_repository.dart';
import 'order_repository.dart';
import 'playground.dart';
import 'print_dialog.dart';
import 'product_repository.dart';
import 'role_switcher.dart';

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
class HatakeExampleApp extends StatefulWidget {
  final AppDefinition definition;
  final String source;

  /// プレイグラウンドの「例を入れる」に出す定義（名前 → YAML）。
  final Map<String, String> samples;

  /// 起動時にプレイグラウンドを開くか（`?playground=1`）。
  final bool openPlayground;

  /// 共有リンク（`?yaml=`）で渡された定義。
  final String? sharedSource;

  /// 最初に配る役割（**アプリが配るもの**＝ログイン状態）。
  ///
  /// 既定は担当（`staff`）。誰でもない状態で始めると、デモを開いた人が見るものが
  /// 減ってしまう（持ち出しのボタンが出ない）ので、**普通の利用者**から始める。
  /// 右下の札で切り替えられる。
  final Set<String> roles;

  const HatakeExampleApp({
    super.key,
    required this.definition,
    required this.source,
    this.samples = const {},
    this.openPlayground = false,
    this.sharedSource,
    this.roles = const {'staff'},
  });

  @override
  State<HatakeExampleApp> createState() => _HatakeExampleAppState();
}

class _HatakeExampleAppState extends State<HatakeExampleApp> {
  /// Lets the export sink reach the widget tree. A sink is plain I/O and gets no
  /// [BuildContext] — a real app downloads or saves the file, so it needs none;
  /// this demo shows the document, so it goes through the navigator.
  ///
  /// **アプリ1つに1本**（static にしない）。static にすると、同じ鍵を2つの木が
  /// 名乗ることになり、試験の中でアプリを2回出したときに壊れる（実際に踏んだ:
  /// 2つ目の `pumpAndSettle` が返ってこなくなる）。グローバルな状態を持たない、
  /// という枠組み側の決めごとと同じ理由。
  final GlobalKey<NavigatorState> _navigatorKey = GlobalKey<NavigatorState>();
  /// いま配っている役割。切り替えると `HatakeScope(roles:)` が変わり、
  /// 隠れる列・出ないボタン・消えるメニューがその場で変わる（画面は作り直さない
  /// ので、開いているタブと検索結果はそのまま残る）。
  late Set<String> _roles = widget.roles;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'hatake example',
      debugShowCheckedModeBanner: false,
      navigatorKey: _navigatorKey,
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
        // このアプリが配りうる役割の全部（語彙）。いま見ている人の役割（roles:）とは
        // 別で、こちらは**名前の一覧**。宣言しておくと `hatake validate --registry` が
        // 「定義にしか無い役割」＝誰にも見えない列やボタンを言える（定義側は
        // sales_app.yaml の maxRows.byRole が manager を見ている）。
        knownRoles: const {'staff', 'manager'},
        // Where `type: export` actions send their document. The framework builds
        // the CSV; getting it to the user is the application's job.
        exportSink: (request) async {
          final context = _navigatorKey.currentContext;
          if (context == null) return;
          await ExportDialog.show(context, request);
        },
        // Where `type: print` actions send their report. The framework hands
        // over the paper's contents; making the PDF is the opt-in adapter
        // (hatake_print), and getting it to a printer or a file is this app's.
        printSink: (request) async {
          final context = _navigatorKey.currentContext;
          if (context == null) return;
          await PrintDialog.show(context, request);
        },
        // Plugin action: each page declares
        //   { type: plugin, plugin: showDefinition, config: { page: <id> } }
        // and this handler shows the matching slice of the YAML.
        actions: ActionRegistry({
          // 選んだ行に対して実行する（定義側は scope: selection）。Framework は
          // 選ばれた行を渡すところまでで、まとめて何をするかは業務。
          'approveOrders': BulkDialog.show,
          // 却下は「理由を聞いてから」。聞くのは定義（prompt）の担当で、
          // ここに届くのは検証と正規化を通った値だけ。
          'rejectOrders': BulkDialog.show,
          'showDefinition': (ctx) async {
            final pageId = ctx.action.config['page']?.toString() ?? '';
            final yaml = extractPageYaml(widget.source, pageId);
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
                  initial:
                      extractPageYaml(widget.source, pageId) ?? widget.source,
                ),
              ),
            );
          },
        }),
        // いま見ている人。定義に書いた `roles` はここと突き合わされる。
        roles: _roles,
        child: widget.openPlayground
            ? _playground(
                initial: widget.sharedSource ?? widget.samples.values.firstOrNull,
              )
            // 役割の札はアプリの作り（デモ自身）なので、画面の上に重ねる。
            // 定義の側に「切り替え」を書く場所は無い＝役割はアプリが配るもの。
            : Stack(
                children: [
                  HatakeApp(app: widget.definition),
                  Positioned(
                    right: 16,
                    bottom: 16,
                    child: SafeArea(
                      child: RoleSwitcher(
                        roles: _roles,
                        onChanged: (roles) => setState(() => _roles = roles),
                      ),
                    ),
                  ),
                ],
              ),
      ),
    );
  }

  /// プレイグラウンドは定義を書く場なので、デモの Repository ではなく
  /// 「貼られた定義に合わせて作るサンプルデータ」で動く（Playground の中で組む）。
  Widget _playground({String? initial}) => Playground(
        initialSource: initial ?? widget.source,
        samples: widget.samples,
      );
}
