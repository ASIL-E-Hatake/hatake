import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// 最後の砦（押してから言う道）を、**本当に通して**確かめる。
///
/// Renderer には「押してから言う」道が6本あって、押す前に言う側との対応は表
/// （`actionFallbacks.ts` の `ACTION_FALLBACKS`）が持っている。けれどその表は
/// **文が在るか**までしか見ていない＝分岐が死んでいても、文だけ残っていれば通る。
/// 文だけ残った砦は「押しても何も言わない画面」になり、押した人の所で初めて分かる。
///
/// だから1本ずつ通す。**通せないものは「通せない」ことを固定する**:
///
/// * `のハンドラが未登録です` … 押す前に灰色にしたので、**もう押せない**
///   （砦のコードは残す＝枠組みの取りこぼしで来たときに黙るのが一番まずい）
/// * `は未実装です` … 知らない型は strict が弾くので、**定義からは作れない**
///   ＝モデルを直に組んだときだけ通る
///
/// 表の6本ぜんぶがこのファイルに出てくることは TypeScript 側の試験が見ている
/// （砦を足したら試験を書くまで通らない・試験を消したら落ちる）。
class _Rows implements Repository {
  const _Rows();

  @override
  Future<PageResult> search(RepositoryQuery query) async => const PageResult(
        items: [
          {'id': 1, 'code': 'C-1'},
          {'id': 2, 'code': 'C-2'},
        ],
        totalCount: 2,
      );
  @override
  Future<DataRecord?> findByKey(Object key) async => {'id': key, 'code': 'C-1'};
  @override
  Future<DataRecord> create(DataRecord data) async => data;
  @override
  Future<DataRecord> update(Object key, DataRecord data) async => data;
  @override
  Future<void> delete(Object key) async {}
}

const _table = TableDefinition(
  columns: [
    ColumnDefinition(field: 'id', label: 'ID'),
    ColumnDefinition(field: 'code', label: 'コード'),
  ],
);

/// 読むだけの画面。ここに置いたボタンは、出す口も刷る口も新規の口も**渡されない**
/// ＝「このページでは〜できません」に素直に着く。
DetailPageDefinition _detail(List<ActionDefinition> actions) =>
    DetailPageDefinition(
      id: 'customer_detail',
      title: '顧客詳細',
      repository: 'repo',
      keyField: 'id',
      form: const FormDefinition(
        sections: [
          SectionDefinition(fields: [FieldDefinition(field: 'code', label: 'コード')]),
        ],
      ),
      actions: actions,
    );

Widget _harness(Widget child, {ActionRegistry? actions}) => MaterialApp(
      home: Scaffold(
        body: HatakeScope(
          repositories: const RepositoryRegistry({'repo': _Rows()}),
          renderer: const MaterialRenderer(),
          actions: actions,
          child: child,
        ),
      ),
    );

/// 画面のボタンを、規約（[HatakeKeys]）から探す＝キーの字を書かない。
Finder _action(String id) => find.byKey(Key(HatakeKeys.action(id)));

/// そのボタンが押せるか（灰色なら false）。
bool _enabled(WidgetTester tester, Finder button) {
  final widget = tester.widget(button);
  if (widget is FilledButton) return widget.onPressed != null;
  if (widget is TextButton) return widget.onPressed != null;
  if (widget is OutlinedButton) return widget.onPressed != null;
  return (widget as ButtonStyleButton).onPressed != null;
}

void main() {
  testWidgets('選んだ行に対しては実行できない型（scope: selection ＋ delete）', (tester) async {
    // `scope: selection` に置けるのは plugin だけ。押す前に言う側は
    // `validate` の selection-unsupported-type。
    await tester.pumpWidget(_harness(
      const HatakePageView(
        definition: SearchPageDefinition(
          id: 'order_search',
          title: '受注照会',
          repository: 'repo',
          keyField: 'id',
          table: _table,
          actions: [
            ActionDefinition(
              id: 'bulkDelete',
              type: ActionTypes.delete,
              label: '一括削除',
              scope: ActionScopes.selection,
            ),
          ],
        ),
      ),
    ));
    await tester.pumpAndSettle();

    // 行を選ぶまで押せない（選んでいない理由は別の試験が見ている）。
    await tester.tap(find.byType(Checkbox).at(1));
    await tester.pumpAndSettle();
    await tester.tap(_action('bulkDelete'));
    await tester.pumpAndSettle();

    expect(find.textContaining('選んだ行に対しては'), findsOneWidget);
  });

  testWidgets('新規の口が無い画面の type: create', (tester) async {
    await tester.pumpWidget(_harness(HatakePageView(
      definition: _detail(const [
        ActionDefinition(id: 'add', type: ActionTypes.create, label: '新規'),
      ]),
      recordKey: 1,
    )));
    await tester.pumpAndSettle();

    await tester.tap(_action('add'));
    await tester.pumpAndSettle();

    expect(find.textContaining('はこのページでは使えません'), findsOneWidget);
  });

  testWidgets('出す口が無い画面の type: export', (tester) async {
    await tester.pumpWidget(_harness(HatakePageView(
      definition: _detail(const [
        ActionDefinition(id: 'csv', type: ActionTypes.export, label: 'CSV出力'),
      ]),
      recordKey: 1,
    )));
    await tester.pumpAndSettle();

    await tester.tap(_action('csv'));
    await tester.pumpAndSettle();

    expect(find.textContaining('はこのページでは出力できません'), findsOneWidget);
  });

  testWidgets('帳票でない画面の type: print', (tester) async {
    await tester.pumpWidget(_harness(HatakePageView(
      definition: _detail(const [
        ActionDefinition(id: 'paper', type: ActionTypes.print, label: '印刷'),
      ]),
      recordKey: 1,
    )));
    await tester.pumpAndSettle();

    await tester.tap(_action('paper'));
    await tester.pumpAndSettle();

    expect(find.textContaining('はこのページでは刷れません'), findsOneWidget);
  });

  testWidgets('のハンドラが未登録です ― この道はもう通れない（押す前に灰色）', (tester) async {
    await tester.pumpWidget(_harness(HatakePageView(
      definition: _detail(const [
        ActionDefinition(
          id: 'approve',
          type: ActionTypes.plugin,
          plugin: 'approveOrders',
          label: '承認',
        ),
      ]),
      recordKey: 1,
    )));
    await tester.pumpAndSettle();

    // **押せない**（登録は実行時に引けるので、押す前に言っている）。
    expect(_enabled(tester, _action('approve')), isFalse);
    // 理由は**ボタンに添えてある**（Tooltip は指を乗せるまで描かれないので、
    // 文字を探すのではなく添えたものを見る）。
    final reason = tester.widget<Tooltip>(
      find.ancestor(of: _action('approve'), matching: find.byType(Tooltip)),
    );
    expect(
      reason.message,
      contains('まだ繋がっていません（プラグイン "approveOrders" が登録されていません）'),
    );

    // 登録すれば押せる＝灰色にしているのは「登録が無い」ときだけ。
    await tester.pumpWidget(_harness(
      HatakePageView(
        definition: _detail(const [
          ActionDefinition(
            id: 'approve',
            type: ActionTypes.plugin,
            plugin: 'approveOrders',
            label: '承認',
          ),
        ]),
        recordKey: 1,
      ),
      actions: ActionRegistry({'approveOrders': (ctx) async {}}),
    ));
    await tester.pumpAndSettle();
    expect(_enabled(tester, _action('approve')), isTrue);
  });

  testWidgets('は未実装です ― 定義からは作れない（枠組みの取りこぼし）', (tester) async {
    // strict が弾く型なので、モデルを直に組んだときだけここに来る。分岐を足し忘れた
    // ときに**黙らない**ことを固定しておく。
    await tester.pumpWidget(_harness(HatakePageView(
      definition: _detail(const [
        ActionDefinition(id: 'mystery', type: 'teleport', label: '謎'),
      ]),
      recordKey: 1,
    )));
    await tester.pumpAndSettle();

    await tester.tap(_action('mystery'));
    await tester.pumpAndSettle();

    expect(find.textContaining('は未実装です'), findsOneWidget);
  });
}
