import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_example/main.dart';
import 'package:hatake_material/hatake_material.dart';
import 'package:hatake_yaml/hatake_yaml.dart';

/// 同梱の `assets/hatake-registry.json` が、**本当にこのアプリの登録と同じか**。
///
/// この一覧の作り方は2つある。どちらも同じ答えになるはずで、片方が嘘をついていたら
/// ここで落ちる。
///   ・静的: `hatake registry lib/main.dart`（ソースを読む。CI が再生成して diff）
///   ・実行時: `registrySnapshot(scope)`（動いているアプリに聞く。この試験）
void main() {
  testWidgets('同梱の一覧は、動いているアプリの登録と一致する', (tester) async {
    final yaml = await rootBundle.loadString('assets/sales_app.yaml');
    await tester.pumpWidget(
      HatakeExampleApp(definition: parseAppYaml(yaml), source: yaml),
    );
    await tester.pumpAndSettle();

    final scope = tester.widget<HatakeScope>(find.byType(HatakeScope));
    final committed = jsonDecode(
      File('assets/hatake-registry.json').readAsStringSync(),
    ) as Map<String, dynamic>;
    committed.remove(r'$comment');

    expect(registrySnapshot(scope), committed);

    // **申告の紙も、ここで書き出す。**
    //
    // 手で書いた一覧では「登録していない」と「書き忘れた」が区別できません。
    // 動いているアプリが自分で名乗った紙（`$source: registrySnapshot`）だけが、
    // 「その種類は1つも登録していない」と道具に断定させられます。
    //
    // 静的走査（`hatake registry lib/main.dart`）で作った `hatake-registry.json` は
    // 走査なので、印を付けたら嘘になります。だから**別の紙**として書き出します。
    // 書き出した紙は CI が `hatake gaps` に渡します（`tool/` は生成物を置く所）。
    //
    // 別の試験に分けずにここへ置いているのは、**アプリの起動が高くつく**ため
    // （2本目で起動すると、この画面は落ち着かずに時間切れになります）。
    final declared = File('tool/hatake-registry.declared.json');
    final made = '${registrySnapshotJson(scope)}\n';

    // **コミットしてあるものと一致すること。** 生成物なので、古いままなら落とす
    // （登録を増やしたのに、紙を更新し忘れる、が起きる）。
    if (declared.existsSync()) {
      expect(
        declared.readAsStringSync().replaceAll('\r\n', '\n'),
        made,
        reason: 'tool/hatake-registry.declared.json が古いままです。'
            'この試験が書き直したので、そのままコミットに入れてください。',
      );
    }
    declared.writeAsStringSync(made);
  });

  test('プレイグラウンドの動的な登録は、走査では読めないが実行時には申告できる', () {
    // 貼られた定義が名指しした Repository をその場で作る形。ソースに名前が書かれて
    // いないので `hatake registry` は「読めない」と言う（それが正しい）。動いていれば
    // こうして聞ける、というのがこの口の存在理由。
    final scope = HatakeScope(
      repositories: sampleRepositories({
        'page': {
          'type': 'search',
          'repository': 'orderRepository',
          'table': {
            'columns': [
              {'field': 'id', 'label': 'ID'},
            ],
          },
        },
      }),
      renderer: const MaterialRenderer(),
      child: const SizedBox.shrink(),
    );

    expect(registrySnapshot(scope)['repositories'], contains('orderRepository'));
  });
}
