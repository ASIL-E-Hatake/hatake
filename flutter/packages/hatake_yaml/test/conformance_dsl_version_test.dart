import 'dart:convert';
import 'dart:io';

import 'package:hatake_core/hatake_core.dart';
import 'package:hatake_yaml/hatake_yaml.dart';
import 'package:test/test.dart';

/// DSL の版の受け取り方を、TypeScript 版・Java 版と同じ契約で回す。
///
/// ここは**公開すると直せなくなる**所なので、印（`kind`）まで固定する。文面は版ごとの
/// 言葉でよいが、「通す／落とす」と理由の印が3版で違ったら、同じ定義が版によって通ったり
/// 落ちたりする。
void main() {
  final fixture = jsonDecode(
    File('../../../spec/conformance/dsl_version.json').readAsStringSync(),
  ) as Map<String, dynamic>;
  final cases = (fixture['cases'] as List).cast<Map<String, dynamic>>();

  String yamlOf(String? version) => [
        if (version != null) 'dsl_version: ${jsonEncode(version)}',
        'type: form',
        'id: p',
        'title: 画面',
        'repository: r',
        'key: id',
        'form:',
        '  fields:',
        '    - { name: id, label: ID, type: text }',
      ].join('\n');

  test('この実装の版が、共有フィクスチャの現在の版と一致する', () {
    expect(kDslVersion, fixture['current']);
  });

  for (final one in cases) {
    final input = one['input'] as String?;
    final verdict = one['verdict'] as String;
    final shown = input == null ? '（書かない）' : '"$input"';

    test('$shown → $verdict / ${one['kind']}', () {
      final got = checkDslVersion(input);
      expect(got.kind.wireName, one['kind']);
      expect(got.fatal, verdict == 'error');
      expect(got.warn, verdict == 'warn');
    });

    test('$shown → 解析も同じ答えになる', () {
      if (verdict == 'error') {
        expect(
          () => parsePageYaml(yamlOf(input)),
          throwsA(isA<DefinitionParseException>()),
        );
        return;
      }
      expect(parsePageYaml(yamlOf(input)).dslVersion, input ?? kDslVersion);
    });
  }
}
