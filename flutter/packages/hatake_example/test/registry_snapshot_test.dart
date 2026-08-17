import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_example/main.dart';
import 'package:hatake_example/playground_data.dart';
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
