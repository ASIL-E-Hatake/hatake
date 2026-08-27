import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// 「削除前に確認」「保存できたら一覧に戻る」を定義で書けること。
/// 毎回 Dart で書かせない、が Action フックの目的。

final _rows = <DataRecord>[
  {'id': 1, 'code': 'C001', 'name': 'Alice'},
];

class _Rows implements Repository {
  final List<DataRecord> rows;
  final List<Object> deleted = [];
  bool fail = false;

  _Rows(this.rows);

  @override
  Future<PageResult> search(RepositoryQuery query) async =>
      PageResult(items: rows, totalCount: rows.length);
  @override
  Future<DataRecord?> findByKey(Object key) async => rows.first;
  @override
  Future<DataRecord> create(DataRecord data) async => data;
  @override
  Future<DataRecord> update(Object key, DataRecord data) async => data;
  @override
  Future<void> delete(Object key) async {
    if (fail) throw StateError('参照されているため削除できません');
    deleted.add(key);
    rows.removeWhere((r) => r['id'] == key);
  }
}

const _table = TableDefinition(
  columns: [
    ColumnDefinition(field: 'code', label: 'コード'),
    ColumnDefinition(field: 'name', label: '氏名'),
  ],
  rowActions: [ActionTypes.edit, ActionTypes.delete],
);

const _form = FormDefinition(
  sections: [
    SectionDefinition(
      fields: [FieldDefinition(field: 'name', label: '氏名')],
    ),
  ],
);

/// 削除に文言つきの確認と、成功後のメッセージを宣言した一覧。
const _withHooks = CrudPageDefinition(
  id: 'customer_master',
  title: '顧客マスタ',
  repository: 'customerRepository',
  table: _table,
  form: _form,
  actions: [
    ActionDefinition(
      id: 'delete',
      type: ActionTypes.delete,
      label: '削除',
      confirm: ConfirmDefinition(
        title: '顧客の削除',
        message: 'この顧客を削除すると受注履歴から辿れなくなります。よろしいですか？',
        okLabel: '削除する',
        cancelLabel: 'やめる',
        danger: true,
      ),
      onSuccess: ActionSuccessDefinition(message: '顧客を削除しました'),
    ),
  ],
);

/// 確認つきのプラグインアクションと、成功後に画面遷移するアクション。
const _pluginPage = SearchPageDefinition(
  id: 'order_search',
  title: '受注照会',
  repository: 'customerRepository',
  table: _table,
  actions: [
    ActionDefinition(
      id: 'close',
      type: ActionTypes.plugin,
      plugin: 'closeMonth',
      label: '月締め',
      confirm: ConfirmDefinition(message: '当月を締めます。あとから戻せません。'),
      onSuccess: ActionSuccessDefinition(
        message: '月締めが終わりました',
        page: 'order_detail',
        params: {'id': r'$row.id'},
      ),
    ),
  ],
);

const _detail = DetailPageDefinition(
  id: 'order_detail',
  title: '受注詳細',
  repository: 'customerRepository',
  form: _form,
);

Widget _host(
  Repository repository,
  PageDefinition page, {
  ActionRegistry? actions,
  bool asApp = false,
}) {
  Widget scope(Widget child) => HatakeScope(
        repositories: RepositoryRegistry({'customerRepository': repository}),
        renderer: const MaterialRenderer(),
        actions: actions,
        child: child,
      );
  return MaterialApp(
    home: Scaffold(
      body: asApp
          ? scope(HatakeApp(
              app: AppDefinition(
                id: 'app',
                title: '販売管理',
                menu: [MenuItem(id: 'p', label: page.title, page: page.id)],
                pages: [page, _detail],
              ),
            ))
          : scope(HatakePageView(definition: page)),
    ),
  );
}

void main() {
  group('行の操作の宣言', () {
    testWidgets('画面のボタンとしては出ない（押しても何も起きないボタンを作らない）',
        (tester) async {
      await tester.pumpWidget(_host(_Rows([..._rows]), _withHooks));
      await tester.pumpAndSettle();

      // `type: delete` を actions に書くのは、行の削除の言い方を業務の言葉にする
      // **宣言**（下の confirm の試験がそれを確かめている）。画面のボタンとして
      // 並べると、押しても「未実装です」と言うだけのボタンになる。
      expect(find.byKey(const Key('hatake.action.delete')), findsNothing);
      expect(find.widgetWithText(FilledButton, '削除'), findsNothing);
      // 行の削除は出ている（宣言はそちらに効く）。
      expect(find.byKey(const Key('hatake.delete.1')), findsOneWidget);
    });
  });

  group('confirm', () {
    testWidgets('宣言した文言とラベルがそのまま出る', (tester) async {
      await tester.pumpWidget(_host(_Rows([..._rows]), _withHooks));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('hatake.delete.1')));
      await tester.pumpAndSettle();

      expect(find.text('顧客の削除'), findsOneWidget);
      expect(find.textContaining('受注履歴から辿れなくなります'), findsOneWidget);
      expect(find.text('削除する'), findsOneWidget);
      expect(find.text('やめる'), findsOneWidget);
    });

    testWidgets('OK で実行、キャンセルで何もしない', (tester) async {
      final repository = _Rows([..._rows]);
      await tester.pumpWidget(_host(repository, _withHooks));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('hatake.delete.1')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('hatake.confirm.cancel')));
      await tester.pumpAndSettle();
      expect(repository.deleted, isEmpty);

      await tester.tap(find.byKey(const Key('hatake.delete.1')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('hatake.confirm.ok')));
      await tester.pumpAndSettle();
      expect(repository.deleted, [1]);
    });

    testWidgets('プラグインアクションでも確認が先に入る', (tester) async {
      var ran = 0;
      final registry = ActionRegistry({'closeMonth': (_) async => ran++});
      await tester.pumpWidget(
          _host(_Rows([..._rows]), _pluginPage, actions: registry));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('hatake.action.close')));
      await tester.pumpAndSettle();
      expect(find.textContaining('あとから戻せません'), findsOneWidget);
      // 見出しもラベルも省略できる（既定文言が出る）。
      expect(find.text('OK'), findsOneWidget);
      expect(find.text('キャンセル'), findsOneWidget);
      expect(ran, 0);

      await tester.tap(find.byKey(const Key('hatake.confirm.ok')));
      await tester.pumpAndSettle();
      expect(ran, 1);
    });
  });

  group('onSuccess', () {
    testWidgets('成功したときだけメッセージを出す', (tester) async {
      final repository = _Rows([..._rows]);
      await tester.pumpWidget(_host(repository, _withHooks));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('hatake.delete.1')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('hatake.confirm.ok')));
      await tester.pumpAndSettle();

      expect(find.text('顧客を削除しました'), findsOneWidget);
    });

    testWidgets('失敗したときは出さない（嘘をつかない）', (tester) async {
      final repository = _Rows([..._rows])..fail = true;
      await tester.pumpWidget(_host(repository, _withHooks));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('hatake.delete.1')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('hatake.confirm.ok')));
      await tester.pumpAndSettle();

      expect(find.text('顧客を削除しました'), findsNothing);
      // 失敗そのものは一覧のエラー表示に出る。
      expect(find.byKey(const Key('hatake.error')), findsOneWidget);
    });

    testWidgets('成功後に別のページへ移れる', (tester) async {
      final registry = ActionRegistry({'closeMonth': (_) async {}});
      await tester.pumpWidget(_host(
        _Rows([..._rows]),
        _pluginPage,
        actions: registry,
        asApp: true,
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('hatake.action.close')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('hatake.confirm.ok')));
      await tester.pumpAndSettle();

      expect(find.text('月締めが終わりました'), findsOneWidget);
      expect(find.text('受注詳細'), findsWidgets);
    });

    testWidgets('ハンドラ未登録なら実行もされず、成功も名乗らない', (tester) async {
      await tester.pumpWidget(_host(_Rows([..._rows]), _pluginPage));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('hatake.action.close')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('hatake.confirm.ok')));
      await tester.pumpAndSettle();

      expect(find.textContaining('ハンドラが未登録'), findsOneWidget);
      expect(find.text('月締めが終わりました'), findsNothing);
    });
  });
}
