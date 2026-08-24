import 'dart:convert';
import 'dart:io';

import 'package:hatake_core/hatake_core.dart';
import 'package:hatake_yaml/hatake_yaml.dart';
import 'package:test/test.dart';

/// 1回で動かせる行数の上限の共有フィクスチャを、TypeScript 版・Java 版と同じ契約で回す。
///
/// こちらは**見せる側**（画面は上限を超えて選んでいる間ボタンを押させない）。守る側
/// （TypeScript / Java）と同じ数を出さなければ、画面で押せた操作が API で弾かれる、
/// あるいはその逆が起きる。だから3版で機械的に縛る。
void main() {
  final fixture = jsonDecode(
    File('../../../spec/conformance/bulk_limits.json').readAsStringSync(),
  ) as Map<String, dynamic>;

  final document = (fixture['document'] as Map).cast<String, Object?>();
  final page = parsePageMap(
    (document['page'] as Map).cast<String, Object?>(),
  ) as SearchPageDefinition;

  ActionDefinition? actionOf(String id) {
    for (final action in page.actions) {
      if (action.id == id) return action;
    }
    return null;
  }

  for (final raw in fixture['cases'] as List) {
    final one = (raw as Map).cast<String, Object?>();
    test(one['name'] as String, () {
      final roles = <String>{
        for (final role in (one['roles'] as List? ?? const [])) '$role',
      };
      final action = actionOf(one['actionId'] as String);
      expect(action?.maxRows?.forRoles(roles), one['limit']);
    });
  }
}
