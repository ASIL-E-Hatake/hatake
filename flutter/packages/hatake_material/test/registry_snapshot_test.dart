import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// 動いているアプリに「何を登録したか」を聞く口（`registrySnapshot`）。
///
/// 静的な走査（`hatake registry`）は、その場に書いてある文字列しか読めない。動的に
/// 組み立てている登録は原理的に読めないので、こちらが要る。形は
/// `spec/conformance/registry_snapshot.json` で TypeScript 版と揃えている。

class _Repo implements Repository {
  @override
  Future<PageResult> search(RepositoryQuery query) async =>
      const PageResult(items: [], totalCount: 0);
  @override
  Future<DataRecord?> findByKey(Object key) async => null;
  @override
  Future<DataRecord> create(DataRecord data) async => data;
  @override
  Future<DataRecord> update(Object key, DataRecord data) async => data;
  @override
  Future<void> delete(Object key) async {}
}

HatakeScope _scope({
  Map<String, Repository> repositories = const {},
  Map<String, ActionHandler> actions = const {},
  Map<String, ValidatorFn> validators = const {},
  Map<String, Converter> converters = const {},
  Map<String, MaterialFieldBuilder> fieldBuilders = const {},
  Map<String, MaterialDashboardItemBuilder> dashboardItemBuilders = const {},
  FormatterRegistry? formatters,
}) =>
    HatakeScope(
      repositories: RepositoryRegistry(repositories),
      actions: ActionRegistry(actions),
      validators: ValidatorRegistry(validators),
      converters: ConverterRegistry(converters),
      renderer: MaterialRenderer(
        fieldBuilders: fieldBuilders,
        dashboardItemBuilders: dashboardItemBuilders,
        formatters: formatters,
      ),
      child: const SizedBox.shrink(),
    );

void main() {
  group('conformance: registry snapshot', () {
    final fixture = jsonDecode(
      File('../../../spec/conformance/registry_snapshot.json').readAsStringSync(),
    ) as Map<String, dynamic>;
    final sample = fixture['sample'] as Map<String, dynamic>;
    final registered = (sample['registered'] as Map).cast<String, dynamic>();

    List<String> names(String kind) =>
        [for (final n in (registered[kind] as List? ?? [])) n as String];

    test('アプリが登録したものだけを、名前順で申告する', () {
      final scope = _scope(
        repositories: {
          for (final name in names('repositories')) name: _Repo(),
        },
        actions: {
          for (final name in names('plugins')) name: (ctx) async {},
        },
        validators: {
          for (final name in names('validators')) name: (value, def) => null,
        },
        converters: {
          for (final name in names('converters'))
            name: (value, options) => value,
        },
        fieldBuilders: {
          for (final name in names('fieldTypes'))
            name: (ctx) => const SizedBox.shrink(),
        },
        dashboardItemBuilders: {
          for (final name in names('dashboardItemTypes'))
            name: (ctx) => const SizedBox.shrink(),
        },
      );

      expect(registrySnapshot(scope), sample['expected']);
    });

    test('種類の名前は spec と一致する（TypeScript 版と同じ語彙）', () {
      final kinds = {for (final k in fixture['runtimeKinds'] as List) k as String};
      const declared = {
        RegistryKinds.repositories,
        RegistryKinds.plugins,
        RegistryKinds.validators,
        RegistryKinds.formatters,
        RegistryKinds.converters,
        RegistryKinds.computedOps,
        RegistryKinds.aggregates,
        RegistryKinds.fieldTypes,
        RegistryKinds.dashboardItemTypes,
      };
      expect(declared, kinds);
    });
  });

  group('registrySnapshot', () {
    test('何も足していないアプリは、何も言わない', () {
      // 「その種類は空」ではなく「言うことが無い」。空を主張すると、突き合わせ側が
      // 「独自のものは無い」と読んで嘘の警告を出す。
      expect(registrySnapshot(_scope()), <String, List<String>>{});
    });

    test('組み込みと同じ名前で上書きしても、一覧には出さない', () {
      final scope = _scope(converters: {'trim': (value, options) => value});
      expect(registrySnapshot(scope), <String, List<String>>{});
    });

    test('Renderer が持っているフォーマッタも拾う', () {
      final scope = _scope(
        formatters: FormatterRegistry({'yen': (value, options) => '¥$value'}),
      );
      expect(registrySnapshot(scope), {
        'formatters': ['yen'],
      });
    });

    test('**動的に作った登録**も、動いていれば申告できる（走査では読めない類）', () {
      // プレイグラウンドのように「定義が名指しした Repository を実行時に作る」形。
      // ソースには名前が書かれていないので `hatake registry` には読めないが、
      // 動いているアプリには聞ける。
      final named = ['orderRepository', 'lineRepository'];
      final scope = _scope(
        repositories: {for (final key in named) key: _Repo()},
      );
      expect(registrySnapshot(scope)['repositories'], [
        'lineRepository',
        'orderRepository',
      ]);
    });

    test('そのまま hatake-registry.json として書ける形にできる', () {
      final scope = _scope(repositories: {'orderRepository': _Repo()});
      final json = jsonDecode(registrySnapshotJson(scope)) as Map<String, dynamic>;
      expect(json[r'$comment'], isA<String>());
      expect(json['repositories'], ['orderRepository']);
    });
  });
}
