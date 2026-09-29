import 'dart:convert';
import 'dart:io';

import 'package:hatake_core/hatake_core.dart';
import 'package:hatake_yaml/hatake_yaml.dart';
import 'package:test/test.dart';

/// 共有のフィクスチャ（spec/conformance/action_parse.json）を回す。
///
/// 見ているのは**遷移のボタンの読み方**。`page` / `params` は `config:` の中では
/// なく**上に**書くので、parser が `config` へ持ち上げる（読む側は `config` から
/// 引く＝`ActionDefinition` の形を増やさない）。
///
/// これが在るのは、0.9.19 まで **TypeScript 版だけが持ち上げていなかった**から。
/// 同じ定義なのに Flutter では遷移して、ブラウザでは「遷移先が解決できません」と
/// 出た。片方だけ直したら、ここが落ちる。
///
/// Java 版はアクションを持たない（描かない版なので、押すものが無い）ので回らない。
void main() {
  final cases = jsonDecode(
    File('../../../spec/conformance/action_parse.json').readAsStringSync(),
  ) as List;

  group('conformance: action parse', () {
    for (final raw in cases) {
      final c = (raw as Map).cast<String, Object?>();
      test(c['why'] as String, () {
        final page = parsePageYaml(c['yaml'] as String) as SearchPageDefinition;
        final action = page.actions.single;
        final expected = (c['expected'] as Map).cast<String, Object?>();

        expect(action.id, expected['id']);
        expect(action.type, expected['type']);
        expect(action.scope, expected['scope']);
        expect(action.open, expected['open']);
        expect(action.config['page'], expected['configPage']);
        expect(action.config['params'], expected['configParams']);
        if (expected['configIcon'] != null) {
          expect(action.config['icon'], expected['configIcon']);
        }
      });
    }
  });
}
