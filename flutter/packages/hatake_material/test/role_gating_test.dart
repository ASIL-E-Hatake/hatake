import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

class _Repo implements Repository {
  @override
  Future<PageResult> search(RepositoryQuery query) async => const PageResult(
        items: [
          {'id': 1, 'code': 'C001', 'secret': 'xxx'},
        ],
        totalCount: 1,
      );

  @override
  Future<DataRecord?> findByKey(Object key) async => null;

  @override
  Future<DataRecord> create(DataRecord data) async => data;

  @override
  Future<DataRecord> update(Object key, DataRecord data) async => data;

  @override
  Future<void> delete(Object key) async {}
}

const _definition = CrudPageDefinition(
  id: 'p',
  title: 'T',
  repository: 'repo',
  keyFields: ['id'],
  table: TableDefinition(
    columns: [
      ColumnDefinition(field: 'code', label: 'コード'),
      ColumnDefinition(field: 'secret', label: '極秘', roles: ['admin']),
    ],
  ),
  form: FormDefinition(
    sections: [
      SectionDefinition(fields: [FieldDefinition(field: 'code', label: 'コード')]),
    ],
  ),
  actions: [
    ActionDefinition(id: 'create', type: 'create', label: '新規登録'),
    ActionDefinition(
      id: 'export',
      type: 'plugin',
      label: 'エクスポート',
      plugin: 'export',
      roles: ['admin'],
    ),
  ],
);

Widget _harness(Set<String> roles) {
  return MaterialApp(
    home: Scaffold(
      body: HatakeScope(
        repositories: RepositoryRegistry({'repo': _Repo()}),
        renderer: const MaterialRenderer(),
        roles: roles,
        child: const HatakeCrudView(definition: _definition),
      ),
    ),
  );
}

void main() {
  testWidgets('hides role-gated column and action when the role is missing',
      (tester) async {
    await tester.pumpWidget(_harness(const {}));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('hatake.action.create')), findsOneWidget);
    expect(find.byKey(const Key('hatake.action.export')), findsNothing);
    expect(find.text('極秘'), findsNothing);
    expect(find.text('コード'), findsOneWidget);
  });

  testWidgets('shows them for a user that has the role', (tester) async {
    await tester.pumpWidget(_harness(const {'admin'}));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('hatake.action.export')), findsOneWidget);
    expect(find.text('極秘'), findsOneWidget);
  });

  /// 役割の**語彙**（`knownRoles`）は、いま配られている役割（`roles`）とは別のもの。
  ///
  /// 語彙を宣言しておくと2つ効く。道具の側は「定義にしか無い役割」＝誰にも見えない
  /// 列やボタンを言えるようになり（`registrySnapshot` → `validate --registry`）、
  /// 画面の側は**アプリ側の綴り違い**を開発中に言える（`manager` を `manger` で
  /// 配っていても、画面を見ても分からない＝見えないのが正しい機能なので）。
  testWidgets('宣言した語彙に無い役割を配ったら、開発中に気づける', (tester) async {
    expect(
      () => HatakeScope(
        repositories: RepositoryRegistry({'repo': _Repo()}),
        renderer: const MaterialRenderer(),
        knownRoles: const {'admin', 'staff'},
        roles: const {'admn'},
        child: const SizedBox.shrink(),
      ),
      throwsA(isA<AssertionError>()),
    );
  });

  testWidgets('語彙を宣言していなければ、何も言わない（宣言は任意）', (tester) async {
    expect(
      () => HatakeScope(
        repositories: RepositoryRegistry({'repo': _Repo()}),
        renderer: const MaterialRenderer(),
        roles: const {'admn'},
        child: const SizedBox.shrink(),
      ),
      returnsNormally,
    );
  });


  group('組み込みの編集・削除も、宣言の roles に従う', () {
    // 0.9.21 まで Flutter は宣言の roles を見ておらず、`roles: [admin]` と書いても
    // 誰にでも出ていた（Web は見ていた）。宣言は id ではなく type で引く。
    const gated = CrudPageDefinition(
      id: 'p',
      title: 'T',
      repository: 'repo',
      keyFields: ['id'],
      table: TableDefinition(
        columns: [ColumnDefinition(field: 'code', label: 'コード')],
        rowActions: ['edit', 'delete'],
      ),
      form: FormDefinition(
        sections: [
          SectionDefinition(
              fields: [FieldDefinition(field: 'code', label: 'コード')]),
        ],
      ),
      actions: [
        ActionDefinition(
            id: 'edit', type: 'edit', label: '編集', roles: ['admin', 'hr']),
        ActionDefinition(
            id: 'remove', type: 'delete', label: '削除', roles: ['admin']),
      ],
    );

    Future<void> show(WidgetTester tester, Set<String> roles) async {
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: HatakeScope(
            repositories: RepositoryRegistry({'repo': _Repo()}),
            renderer: const MaterialRenderer(),
            roles: roles,
            child: const HatakeCrudView(definition: gated),
          ),
        ),
      ));
      await tester.pumpAndSettle();
    }

    testWidgets('閲覧者には出ない', (tester) async {
      await show(tester, const {'viewer'});
      expect(find.byKey(const Key('hatake.edit.1')), findsNothing);
      expect(find.byKey(const Key('hatake.delete.1')), findsNothing);
    });

    testWidgets('hr は編集だけ', (tester) async {
      await show(tester, const {'hr'});
      expect(find.byKey(const Key('hatake.edit.1')), findsOneWidget);
      expect(find.byKey(const Key('hatake.delete.1')), findsNothing);
    });

    testWidgets('admin は両方（id が delete でなくても type で引く）', (tester) async {
      await show(tester, const {'admin'});
      expect(find.byKey(const Key('hatake.edit.1')), findsOneWidget);
      expect(find.byKey(const Key('hatake.delete.1')), findsOneWidget);
    });
  });
}
