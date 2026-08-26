import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// 文言の差し込みは、一覧（`spec/placeholders.json`）に載っているものが**全部埋まる**。
///
/// 一覧は3か所で使われる: 埋める側（ここ）・埋まらない書き方を言う側（TypeScript の
/// warnings）・人と AI が引く側（`hatake reference --placeholders`）。載っているのに
/// 埋まらない差し込みがあると、定義は通り画面も出るのに**押すまで気づけない**ので、
/// 一覧を読んで1つずつ確かめる（差し込みが増えたら、ここが落ちる）。
class _Orders implements Repository {
  @override
  Future<PageResult> search(RepositoryQuery query) async => const PageResult(
        items: [
          {'orderNo': 'SO-1', 'status': '未出荷'},
          {'orderNo': 'SO-2', 'status': '出荷済'},
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

/// 一覧の中の「ボタンの文言」に書ける差し込み。
List<String> _actionPlaceholders() {
  final json = File('../../../spec/placeholders.json').readAsStringSync();
  final doc = jsonDecode(json) as Map<String, Object?>;
  final contexts = (doc['contexts'] as List<Object?>).cast<Map<String, Object?>>();
  final action = contexts.firstWhere((one) => one['id'] == 'action-message');
  return [
    for (final one in (action['placeholders'] as List<Object?>))
      (one as Map<String, Object?>)['name'] as String,
  ];
}

SearchPageDefinition _page(String message) => SearchPageDefinition(
      id: 'order_search',
      title: '受注照会',
      repository: 'orderRepository',
      keyField: 'orderNo',
      table: const TableDefinition(
        columns: [ColumnDefinition(field: 'orderNo', label: '受注番号')],
      ),
      actions: [
        ActionDefinition(
          id: 'approve',
          type: ActionTypes.plugin,
          plugin: 'approveOrders',
          label: '承認',
          scope: ActionScopes.selection,
          onError: ActionErrorDefinition(message: message),
        ),
      ],
    );

Widget _harness(SearchPageDefinition definition, ActionHandler handler) =>
    MaterialApp(
      home: Scaffold(
        body: HatakeScope(
          repositories: RepositoryRegistry({'orderRepository': _Orders()}),
          renderer: const MaterialRenderer(),
          actions: ActionRegistry({'approveOrders': handler}),
          child: HatakePageView(definition: definition),
        ),
      ),
    );

/// 2行選んで押す。
Future<void> _press(WidgetTester tester) async {
  for (var i = 1; i <= 2; i++) {
    await tester.tap(find.byType(Checkbox).at(i));
    await tester.pumpAndSettle();
  }
  await tester.tap(find.byKey(const Key('hatake.action.approve')));
  await tester.pumpAndSettle();
}

/// 失敗の文言に [message] を入れて押し、画面に出た文を返す。
Future<String> _shown(
  WidgetTester tester,
  String message, {
  required bool throws,
}) async {
  await tester.pumpWidget(_harness(
    _page(message),
    (ctx) async {
      if (throws) throw StateError('締め済み');
      ctx.report(ActionOutcome.rejected(
        succeeded: 1,
        rows: const [FailedRow('SO-2', reason: '出荷済')],
      ));
    },
  ));
  await tester.pumpAndSettle();
  await _press(tester);
  final snack = tester.widget<Text>(
    find.descendant(of: find.byType(SnackBar), matching: find.byType(Text)).first,
  );
  return snack.data ?? '';
}

void main() {
  testWidgets('一覧に載っている差し込みは、どれも埋まる', (tester) async {
    final names = _actionPlaceholders();
    // 一覧が空（読めていない）のに通ってしまわないように。
    expect(names.length, greaterThan(3));
    expect(names, contains('{failedKeys}'));

    for (final name in names) {
      // 報告つき（件数・失敗した行）と、例外（理由）の2筋。どちらかで埋まれば
      // 「埋める口がある」＝一覧の嘘ではない。
      final reported = await _shown(tester, '[$name]', throws: false);
      final thrown = await _shown(tester, '[$name]', throws: true);
      expect(
        reported.contains(name) && thrown.contains(name),
        isFalse,
        reason: '$name を埋める口が無い（報告: $reported / 例外: $thrown）',
      );
    }
  });

  testWidgets('埋まらない筋では、文字のまま残る（0 や空で埋めない）', (tester) async {
    // 例外で終わったときに件数は無い。0 件と書くのは嘘なので、そのまま出す。
    final thrown = await _shown(tester, '[{count}]', throws: true);
    expect(thrown, '[{count}]');
  });
}
