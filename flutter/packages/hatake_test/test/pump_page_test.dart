import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_test/hatake_test.dart';

/// この道具そのものの試験。
///
/// ここが通らないと、**利用者の試験が嘘をつく**（押していないのに押した気になる・
/// 出ていないのに出ている気になる）。だから道具の側で確かめる:
///
///   ・定義をそのまま渡せる（YAML の文字列でも、解析済みでも）
///   ・規約のキーで本当に押せる・入れられる
///   ・偽の Repository が「聞かれたこと」を覚えている
const _crud = '''
page:
  type: crud
  id: orders
  title: 受注
  repository: orderRepository
  key: id
  search:
    filters:
      - { field: code, label: コード, operator: contains }
  table:
    rowActions: [edit, delete]
    columns:
      - { field: code, label: コード }
      - { field: status, label: 状態 }
  form:
    sections:
      - fields:
          - { field: code, label: コード, required: true }
          - { field: status, label: 状態 }
  actions:
    - { id: approve, type: plugin, plugin: approveOrder, label: 承認 }
''';

const _form = '''
page:
  type: form
  id: order_entry
  title: 受注入力
  repository: orderRepository
  key: id
  form:
    sections:
      - fields:
          - { field: code, label: コード, required: true }
          - field: lines
            label: 明細
            type: subTable
            columns:
              - { field: item, label: 品名 }
              - { field: qty, label: 数量 }
            fields:
              - { field: item, label: 品名, required: true }
              - { field: qty, label: 数量, type: number }
''';

void main() {
  testWidgets('定義（YAML の文字列）をそのまま画面に出せる', (tester) async {
    final page = await pumpPage(tester, _crud, rows: [
      {'id': 1, 'code': 'SO-1', 'status': '下書き'},
    ]);

    expect(page.definition.id, 'orders');
    expect(find.text('SO-1'), findsOneWidget);
    // 一覧を出すには問い合わせが要る＝偽物に聞きに行っている。
    expect(page.repository.calls, contains('search'));
  });

  testWidgets('行を渡さなければ、定義から「それらしい行」を作る', (tester) async {
    // 「一覧が出るか」だけを見たい試験のため。値は嘘なので、値を見る試験では渡す。
    final page = await pumpPage(tester, _crud);
    expect(page.repository.rows, isNotEmpty);
    expect(page.repository.rows.first.containsKey('code'), isTrue);
  });

  testWidgets('規約のキーで押す・入れるができる', (tester) async {
    final page = await pumpPage(tester, _crud, rows: [
      {'id': 1, 'code': 'SO-1', 'status': '下書き'},
    ]);

    await tester.tap(HatakeFind.edit(1));
    await tester.pumpAndSettle();
    await tester.enterText(HatakeFind.field('code'), 'SO-9');
    await tester.tap(HatakeFind.formSave);
    await tester.pumpAndSettle();

    expect(page.repository.calls, contains('update(1)'));
    expect(page.repository.rows.first['code'], 'SO-9');
  });

  testWidgets('画面のボタンは押せて、登録した処理に届く', (tester) async {
    var pressed = 0;
    await pumpPage(
      tester,
      _crud,
      rows: const [],
      actions: {'approveOrder': (context) async => pressed++},
    );

    await tester.tap(HatakeFind.action('approve'));
    await tester.pumpAndSettle();
    expect(pressed, 1);
  });

  testWidgets('絞り込みは偽物に渡る（検索欄が効いていることが見える）', (tester) async {
    final page = await pumpPage(tester, _crud, rows: [
      {'id': 1, 'code': 'SO-1', 'status': '下書き'},
      {'id': 2, 'code': 'XX-2', 'status': '確定'},
    ]);

    await tester.enterText(HatakeFind.filter('code'), 'SO');
    await tester.tap(HatakeFind.search);
    await tester.pumpAndSettle();

    expect(page.repository.queries.last.filters['code'], 'SO');
    expect(find.text('XX-2'), findsNothing);
  });

  testWidgets('必須を空で保存すると、保存に行かない', (tester) async {
    final page = await pumpPage(tester, _form, rows: const []);

    await tester.tap(HatakeFind.formSave);
    await tester.pumpAndSettle();

    expect(find.text('必須項目です'), findsWidgets);
    expect(page.repository.calls, isNot(contains('create')));
  });

  testWidgets('明細の行も規約どおりに押せる', (tester) async {
    await pumpPage(tester, _form, rows: const []);

    await tester.tap(HatakeFind.subTableAdd('lines'));
    await tester.pumpAndSettle();
    await tester.enterText(HatakeFind.field('item'), '鉛筆');
    await tester.tap(HatakeFind.subTableRowSave('lines'));
    await tester.pumpAndSettle();

    expect(find.text('鉛筆'), findsWidgets);
  });

  testWidgets('壊れる Repository も渡せる（画面のエラー表示を試す）', (tester) async {
    await pumpPage(
      tester,
      _crud,
      rows: const [],
      failWith: Exception('つながりません'),
    );
    expect(HatakeFind.error, findsOneWidget);
  });
}
