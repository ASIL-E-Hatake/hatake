import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// 押したあと、実行の前に聞く（`prompt`）。
///
/// 業務では「却下の理由を書いてから却下」がそのまま来る。これが無いと**アプリに
/// 手書きのダイアログ**が要る＝このフレームワークが無くしたい物が戻ってくる。
///
/// ここで守るのは3つ。**聞いたものがハンドラに届く**・**書いていなければ実行しない**
/// （検証はフォームと同じ）・**ダイアログは1枚**（`confirm` を増やさず置き換える）。
class _Orders implements Repository {
  @override
  Future<PageResult> search(RepositoryQuery query) async => const PageResult(
        items: [
          {'orderNo': 'SO-1', 'status': '未出荷'},
          {'orderNo': 'SO-2', 'status': '未出荷'},
        ],
        totalCount: 2,
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

const _table = TableDefinition(
  columns: [
    ColumnDefinition(field: 'orderNo', label: '受注番号'),
    ColumnDefinition(field: 'status', label: '状態'),
  ],
);

SearchPageDefinition _page({
  required ActionPromptDefinition prompt,
  ConfirmDefinition? confirm,
  String scope = ActionScopes.page,
}) {
  return SearchPageDefinition(
    id: 'order_search',
    title: '受注照会',
    repository: 'orderRepository',
    keyField: 'orderNo',
    table: _table,
    actions: [
      ActionDefinition(
        id: 'reject',
        type: ActionTypes.plugin,
        plugin: 'rejectOrders',
        label: '却下',
        scope: scope,
        prompt: prompt,
        confirm: confirm,
        onSuccess: const ActionSuccessDefinition(message: '却下しました'),
      ),
    ],
  );
}

const _reason = ActionPromptDefinition(
  title: '却下の理由',
  okLabel: '却下する',
  fields: [
    FieldDefinition(
      field: 'reason',
      label: '理由',
      type: FieldTypes.textarea,
      required: true,
    ),
    FieldDefinition(field: 'rejectedOn', label: '却下日', type: FieldTypes.date),
  ],
);

Widget _harness(SearchPageDefinition definition, ActionHandler handler) {
  return MaterialApp(
    home: Scaffold(
      body: HatakeScope(
        repositories: RepositoryRegistry({'orderRepository': _Orders()}),
        renderer: const MaterialRenderer(),
        actions: ActionRegistry({'rejectOrders': handler}),
        child: HatakePageView(definition: definition),
      ),
    ),
  );
}

Future<void> _press(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('hatake.action.reject')));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('聞いたものがハンドラに届く', (tester) async {
    DataRecord? got;
    await tester.pumpWidget(_harness(
      _page(prompt: _reason),
      (ctx) async => got = ctx.input,
    ));
    await tester.pumpAndSettle();
    await _press(tester);

    // 見出しとボタンの文字は定義のもの。
    expect(find.text('却下の理由'), findsOneWidget);
    expect(find.text('却下する'), findsOneWidget);

    await tester.enterText(
      find.byKey(const Key('hatake.form.reason')),
      '在庫が確保できないため',
    );
    await tester.tap(find.byKey(const Key('hatake.prompt.reject.ok')));
    await tester.pumpAndSettle();

    expect(got?['reason'], '在庫が確保できないため');
    // 聞いていない項目は空で届く（キーは在る＝ハンドラが分岐を書かなくてよい）。
    expect(got?.containsKey('rejectedOn'), isTrue);
    expect(find.text('却下しました'), findsOneWidget);
  });

  testWidgets('必須を書かなければ実行しない（検証はフォームと同じ）', (tester) async {
    var ran = false;
    await tester.pumpWidget(_harness(
      _page(prompt: _reason),
      (_) async => ran = true,
    ));
    await tester.pumpAndSettle();
    await _press(tester);

    await tester.tap(find.byKey(const Key('hatake.prompt.reject.ok')));
    await tester.pumpAndSettle();

    expect(ran, isFalse);
    // ダイアログは開いたまま（閉じてしまうと、書き直す場所が無くなる）。
    expect(find.byKey(const Key('hatake.prompt.reject')), findsOneWidget);
    expect(find.textContaining('必須'), findsOneWidget);
  });

  testWidgets('やめたら何も起きない（onSuccess も動かない）', (tester) async {
    var ran = false;
    await tester.pumpWidget(_harness(
      _page(prompt: _reason),
      (_) async => ran = true,
    ));
    await tester.pumpAndSettle();
    await _press(tester);

    await tester.tap(find.byKey(const Key('hatake.prompt.reject.cancel')));
    await tester.pumpAndSettle();

    expect(ran, isFalse);
    expect(find.text('却下しました'), findsNothing);
  });

  testWidgets('confirm を書いてあってもダイアログは1枚（文言は引き取る）',
      (tester) async {
    DataRecord? got;
    await tester.pumpWidget(_harness(
      _page(
        prompt: const ActionPromptDefinition(
          fields: [
            FieldDefinition(field: 'reason', label: '理由', required: true),
          ],
        ),
        confirm: const ConfirmDefinition(
          message: '却下すると元に戻せません。',
          okLabel: '却下する',
          danger: true,
        ),
      ),
      (ctx) async => got = ctx.input,
    ));
    await tester.pumpAndSettle();
    await _press(tester);

    // confirm の文言はこのダイアログの中に出て、ボタン名も引き継ぐ。
    expect(find.text('却下すると元に戻せません。'), findsOneWidget);
    expect(find.text('却下する'), findsOneWidget);
    // 確認ダイアログ（hatake.confirm）は出ない＝2枚続けて出さない。
    expect(find.byKey(const Key('hatake.confirm')), findsNothing);

    await tester.enterText(find.byKey(const Key('hatake.form.reason')), '理由');
    await tester.tap(find.byKey(const Key('hatake.prompt.reject.ok')));
    await tester.pumpAndSettle();
    expect(got?['reason'], '理由');
  });

  testWidgets('一括でも聞くのは1回（選んだ行に同じ理由を付ける）', (tester) async {
    DataRecord? got;
    var rows = 0;
    await tester.pumpWidget(_harness(
      _page(prompt: _reason, scope: ActionScopes.selection),
      (ctx) async {
        got = ctx.input;
        rows = ctx.records.length;
      },
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(Checkbox).at(0)); // 全選択
    await tester.pumpAndSettle();
    await _press(tester);

    await tester.enterText(
      find.byKey(const Key('hatake.form.reason')),
      '与信超過',
    );
    await tester.tap(find.byKey(const Key('hatake.prompt.reject.ok')));
    await tester.pumpAndSettle();

    expect(rows, 2);
    expect(got?['reason'], '与信超過');
  });

  testWidgets('入力は保存と同じ正規化を通る（全角のまま業務に流さない）',
      (tester) async {
    DataRecord? got;
    await tester.pumpWidget(_harness(
      _page(
        prompt: const ActionPromptDefinition(
          fields: [
            FieldDefinition(
              field: 'quantity',
              label: '数量',
              normalize: ['toHankaku'],
            ),
          ],
        ),
      ),
      (ctx) async => got = ctx.input,
    ));
    await tester.pumpAndSettle();
    await _press(tester);

    await tester.enterText(find.byKey(const Key('hatake.form.quantity')), '１２');
    await tester.tap(find.byKey(const Key('hatake.prompt.reject.ok')));
    await tester.pumpAndSettle();

    expect(got?['quantity'], '12');
  });
}
