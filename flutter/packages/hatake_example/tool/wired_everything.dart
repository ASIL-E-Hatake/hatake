// hatake wire が定義から作った配線の下書き。**手で直す前提**のもの。
//
// 定義から機械的に決まるのは「何を登録すればいいか」まで。**中身は決められない**
// ので、TODO の所は空けてある（何をするかは業務、どう繋ぐかは環境）。埋めるまでは
// UnimplementedError で落ちる＝黙って何もしない、にはしていない。
//
// 生成元: wire_everything.yaml
// 再生成すると手で書いた分は消える。通ったら自分のコードに取り込むこと。
//
// Repository は hatake_http（`hatake openapi` が宣言する API と1対1）で組んで
// ある。collection の名前は**複数形を推測して**埋めてあるので、API に合わせて
// 直すこと。

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:hatake_http/hatake_http.dart';
import 'package:hatake_material/hatake_material.dart';
import 'package:hatake_yaml/hatake_yaml.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // strict: 知らないキーがあれば起動時に落ちる（黙って無視されない）。
  final definition = parseAppYaml(
    await rootBundle.loadString('tool/wire_everything.yaml'),
    strict: true,
  );
  runApp(EverythingApp(definition: definition));
}

/// 定義1つを描くところ。画面のコードはここには無い（定義から出る）。
class EverythingApp extends StatelessWidget {
  final AppDefinition definition;

  const EverythingApp({super.key, required this.definition});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '全部入り',
      home: HatakeScope(
        // 定義が名前を挙げた Repository。REST の口は hatake_http が持つ。
        repositories: RepositoryRegistry(restRepositories(
          baseUrl: '/api',
          send: _send,
          // TODO: ログインしているなら、ここでトークンを渡す（毎回呼ばれる）。
          collections: {
            'orderRepository': 'orders',
          },
        )),
        // `type: plugin` のボタンの中身＝業務。定義には書けない所。
        actions: ActionRegistry({
          'approveOrder': (ctx) async =>
              throw UnimplementedError('approveOrder: 何をするか'),
        }),
        // 組み込みに無い検証。null を返せば OK、文字列を返せばそれがエラー。
        validators: ValidatorRegistry({
          'orderNoFormat': (value, definition) =>
              throw UnimplementedError('orderNoFormat: 検証の中身'),
        }),
        // 組み込みに無い正規化（保存の前に値を直す）。
        converters: ConverterRegistry({
          'toUpperSnake': (value, options) =>
              throw UnimplementedError('toUpperSnake: 正規化の中身'),
        }),
        // 組み込みに無い集約（ダッシュボードと帳票の合計欄）。
        aggregates: AggregateRegistry({
          'median': (rows, field) => throw UnimplementedError('median: 集約の中身'),
        }),
        // 組み込みに無い計算（入力から自動で埋める項目）。
        computeds: ComputedRegistry({
          'discount': (computed, record) =>
              throw UnimplementedError('discount: 計算の中身'),
        }),
        renderer: MaterialRenderer(
          formatters: FormatterRegistry({
            'jpyCompact': (value, options) =>
                throw UnimplementedError('jpyCompact: 見せ方'),
          }),
          fieldBuilders: {
            'colorPicker': (ctx) =>
                throw UnimplementedError('colorPicker: 入力の見た目'),
          },
          dashboardItemBuilders: {
            'heatmap': (ctx) => throw UnimplementedError('heatmap: カードの中身'),
          },
        ),
        // CSV は Framework が文字列まで作る。書くのはアプリ（web なら
        // ダウンロード、デスクトップなら保存ダイアログ）。
        exportSink: (request) async =>
            throw UnimplementedError('${request.filename} を書き出す'),
        // 紙の中身までが Framework。PDF にするのは opt-in の hatake_print、
        // 送るのはアプリ。
        printSink: (request) async =>
            throw UnimplementedError('${request.filename} を刷る'),
        // ログインした人の役割。**画面の出し分けだけ**で、遮断は API 側の仕事。
        // 空のままだと `roles` を書いた列・項目・ボタンは出てこない。
        roles: const {}, // TODO: ログインから取る
        child: HatakeApp(app: definition),
      ),
    );
  }
}

/// 実際に通信する所。**このパッケージが依存を持たない**ための穴で、
/// package:http でも dio でも社内のインターセプタでも差せる。
Future<HttpResponse> _send(HttpRequest request) async {
  throw UnimplementedError('HTTP クライアントを繋ぐ: ${request.method} '
      '${request.url}');
}

// 登録する口がまだ無いもの:
//   グラフの種類 radar（Renderer が知っている種類だけが描ける）
