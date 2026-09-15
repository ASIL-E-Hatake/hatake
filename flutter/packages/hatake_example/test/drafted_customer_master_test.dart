import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_test/hatake_test.dart';

/// 顧客マスタ（customer_master）の画面の試験 — **hatake run --widget-draft が起こした
/// 下書き**。
///
/// 期待に書いてあるのは**枠組みが必ずそうする所**だけ（問い合わせに行った・保存に
/// 行かなかった・登録した処理が呼ばれた）。**業務として正しいか**は人が足す。
///
/// 見ていないもの: プラグインの中身・遷移した先の画面・Repository の実装。
void main() {
  final definition = File('assets/customer_master.yaml').readAsStringSync();

  // table.columns から。
  testWidgets('一覧が出て、Repository に問い合わせている', (tester) async {
    final page = await pumpPage(tester, definition, rows: [{'id': 1, 'code': 'テスト', 'name': 'テスト', 'status': 'active', 'updatedAt': 'X'}]);

    // 一覧を出すには問い合わせが要る＝偽物に聞きに行っている。
    expect(page.repository.calls, contains('search'));
    expect(page.definition.id, 'customer_master');
  });

  // table.rowActions（edit）＋ form から。
  testWidgets('行から編集を開いて保存できる', (tester) async {
    final page = await pumpPage(tester, definition, rows: [{'id': 1, 'code': 'テスト', 'name': 'テスト', 'status': 'active', 'updatedAt': 'X'}]);

    await tester.tap(HatakeFind.edit(1));
    await tester.pumpAndSettle();
    await tester.enterText(HatakeFind.field('code'), 'テスト');
    await tester.tap(HatakeFind.formSave);
    await tester.pumpAndSettle();

    // 保存に行ったこと（何をどう保存するかは Repository の担当）。
    expect(page.repository.calls, contains('update(1)'));
  });

  // form の必須（コード / 顧客名 / ステータス） から。
  testWidgets('必須を空で保存すると、保存に行かない', (tester) async {
    final page = await pumpPage(tester, definition, rows: const []);
    await tester.tap(HatakeFind.action('create'));
    await tester.pumpAndSettle();
    await tester.tap(HatakeFind.formSave);
    await tester.pumpAndSettle();
    // 文言は組み込み（業務の言い方にするなら定義の側で変える）。
    expect(find.text('必須項目です'), findsWidgets);
    expect(page.repository.calls, isNot(contains('create')));
  });

  // search.filters（顧客名） から。
  testWidgets('絞り込みが Repository に渡る', (tester) async {
    final page = await pumpPage(tester, definition, rows: [{'id': 1, 'code': 'テスト', 'name': 'テスト', 'status': 'active', 'updatedAt': 'X'}]);

    await tester.enterText(HatakeFind.filter('name'), 'X');
    await tester.tap(HatakeFind.search);
    await tester.pumpAndSettle();

    expect(page.repository.queries.last.filters['name'], 'X');
  });

  // 枠組みが必ずそうする所（定義に依らない） から。
  testWidgets('Repository が落ちたら、画面がそう言う', (tester) async {
    await pumpPage(
      tester,
      definition,
      rows: const [],
      failWith: Exception('つながりません'),
    );

    expect(HatakeFind.error, findsOneWidget);
  });
}
