// hatake wire が定義から作った配線の下書き。**手で直す前提**のもの。
//
// 定義から機械的に決まるのは「何を登録すればいいか」まで。**中身は決められない**
// ので、TODO の所は空けてある（何をするかは業務、どう繋ぐかは環境）。埋めるまでは
// UnimplementedError で落ちる＝黙って何もしない、にはしていない。
//
// 生成元: sales_app.yaml
// 再生成すると手で書いた分は消える。通ったら自分のコードに取り込むこと。

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:hatake_material/hatake_material.dart';
import 'package:hatake_yaml/hatake_yaml.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // strict: 知らないキーがあれば起動時に落ちる（黙って無視されない）。
  final definition = parseAppYaml(
    await rootBundle.loadString('assets/sales_app.yaml'),
    strict: true,
  );
  runApp(SalesAdminApp(definition: definition));
}

/// 定義1つを描くところ。画面のコードはここには無い（定義から出る）。
class SalesAdminApp extends StatelessWidget {
  final AppDefinition definition;

  const SalesAdminApp({super.key, required this.definition});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '販売管理',
      home: HatakeScope(
        // 定義が名前を挙げた Repository。中身はアプリが書く（5メソッド）。
        repositories: const RepositoryRegistry({
          'customerRepository': _UnwiredRepository('customerRepository'),
          'orderLineRepository': _UnwiredRepository('orderLineRepository'),
          'orderRepository': _UnwiredRepository('orderRepository'),
          'productRepository': _UnwiredRepository('productRepository'),
        }),
        // `type: plugin` のボタンの中身＝業務。定義には書けない所。
        actions: ActionRegistry({
          'approveOrders': (ctx) async =>
              throw UnimplementedError('approveOrders: 何をするか'),
          'openPlayground': (ctx) async =>
              throw UnimplementedError('openPlayground: 何をするか'),
          'showDefinition': (ctx) async =>
              throw UnimplementedError('showDefinition: 何をするか'),
        }),
        renderer: const MaterialRenderer(),
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

/// まだ繋いでいない Repository。**5つのメソッドだけ**が Framework との契約。
///
/// REST なら `hatake wire --base /api` で hatake_http を使う形が出る。
class _UnwiredRepository implements Repository {
  final String name;

  const _UnwiredRepository(this.name);

  Never get _todo => throw UnimplementedError('$name を繋ぐ');

  @override
  Future<PageResult> search(RepositoryQuery query) async => _todo;
  @override
  Future<DataRecord?> findByKey(Object key) async => _todo;
  @override
  Future<DataRecord> create(DataRecord data) async => _todo;
  @override
  Future<DataRecord> update(Object key, DataRecord data) async => _todo;
  @override
  Future<void> delete(Object key) async => _todo;
}
