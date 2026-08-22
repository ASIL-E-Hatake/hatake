import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// 明細の**縦計**（`computed: { op: sum, field: lines, of: amount }`）。
///
/// 業務で一番よく書く計算なのに、これまでは組み込みで書けなかった（`fields` は同じ行の
/// 項目を指すので、行をまたげない）。ここで守るのは3つ。**行を直したらその場で変わる**・
/// **保存する値にも入る**・**行が無ければ 0**（空欄ではなく 0＝「まだ何も無い」）。
///
/// `where`（畳む前に行を絞る）と `join`（行を並べて1行にする）も同じ道を通る。取消印を
/// 付けた行が**その場で合計から外れる**ことまで見る（Renderer は1行も足していない）。
class _Repo implements Repository {
  DataRecord? saved;

  @override
  Future<PageResult> search(RepositoryQuery query) async => PageResult.empty;

  @override
  Future<DataRecord?> findByKey(Object key) async => {
        'orderNo': key,
        'lines': [
          {'item': '鉛筆', 'qty': 2, 'price': 100, 'amount': 200},
          {'item': 'ノート', 'qty': 3, 'price': 150, 'amount': 450},
        ],
      };

  @override
  Future<DataRecord> create(DataRecord data) async => saved = data;

  @override
  Future<DataRecord> update(Object key, DataRecord data) async => saved = data;

  @override
  Future<void> delete(Object key) async {}
}

const _lines = FieldDefinition(
  field: 'lines',
  label: '明細',
  type: FieldTypes.subTable,
  columns: [
    ColumnDefinition(field: 'item', label: '品名'),
    ColumnDefinition(field: 'qty', label: '数量', type: ColumnTypes.number),
    ColumnDefinition(field: 'amount', label: '金額', type: ColumnTypes.number),
  ],
  rowFields: [
    FieldDefinition(field: 'item', label: '品名', required: true),
    FieldDefinition(field: 'qty', label: '数量', type: FieldTypes.number),
    FieldDefinition(field: 'price', label: '単価', type: FieldTypes.number),
    FieldDefinition(
      field: 'amount',
      label: '金額',
      computed: {
        'op': 'product',
        'fields': ['qty', 'price'],
      },
    ),
    FieldDefinition(
      field: 'cancelled',
      label: '取消',
      type: FieldTypes.checkbox,
    ),
  ],
);

/// 取消印が付いていない行だけ。条件の書き方は visibleWhen と同じもの。
const _live = {
  'field': 'cancelled',
  'operator': 'notEquals',
  'value': true,
};

const _definition = FormPageDefinition(
  id: 'order_entry',
  title: '受注入力',
  repository: 'repo',
  keyField: 'orderNo',
  form: FormDefinition(
    sections: [
      SectionDefinition(fields: [_lines]),
      // 計算は**書いた順に1回**なので、小計は明細より後ろ・合計は小計より後ろ。
      SectionDefinition(
        title: '金額',
        fields: [
          FieldDefinition(
            field: 'subtotal',
            label: '小計',
            computed: {
              'op': 'sum',
              'field': 'lines',
              'of': 'amount',
              'where': _live,
            },
          ),
          FieldDefinition(
            field: 'lineCount',
            label: '明細行数',
            computed: {'op': 'count', 'field': 'lines', 'where': _live},
          ),
          FieldDefinition(
            field: 'itemNames',
            label: '品名',
            computed: {
              'op': 'join',
              'field': 'lines',
              'of': 'item',
              'separator': '、',
              'where': _live,
            },
          ),
          FieldDefinition(
            field: 'largest',
            label: '最大の行',
            computed: {'op': 'max', 'field': 'lines', 'of': 'amount'},
          ),
          FieldDefinition(
            field: 'total',
            label: '合計',
            computed: {
              'op': 'sum',
              'fields': ['subtotal'],
            },
          ),
        ],
      ),
    ],
  ),
);

Widget _harness(_Repo repo, {Object? recordKey}) {
  return MaterialApp(
    home: Scaffold(
      body: HatakeScope(
        repositories: RepositoryRegistry({'repo': repo}),
        renderer: const MaterialRenderer(),
        child: HatakeFormView(definition: _definition, recordKey: recordKey),
      ),
    ),
  );
}

Finder _shown(String field) => find.byKey(Key('hatake.form.$field'));

void main() {
  testWidgets('既にある行を畳んで見せる（小計・件数・最大）', (tester) async {
    await tester.pumpWidget(_harness(_Repo(), recordKey: 'SO-1'));
    await tester.pumpAndSettle();

    expect(tester.widget<Text>(_shown('subtotal')).data, '650');
    expect(tester.widget<Text>(_shown('lineCount')).data, '2');
    expect(tester.widget<Text>(_shown('largest')).data, '450');
    // 同じレコードの項目を畳む形（従来）も、その結果を受けて計算できる。
    expect(tester.widget<Text>(_shown('total')).data, '650');
  });

  testWidgets('行を足すと、その場で変わる', (tester) async {
    await tester.pumpWidget(_harness(_Repo(), recordKey: 'SO-1'));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('hatake.subtable.lines.add')));
    await tester.pumpAndSettle();
    await tester.enterText(_shown('item'), '消しゴム');
    await tester.enterText(_shown('qty'), '4');
    await tester.enterText(_shown('price'), '50');
    await tester.tap(find.byKey(const Key('hatake.subtable.lines.row.save')));
    await tester.pumpAndSettle();

    expect(tester.widget<Text>(_shown('subtotal')).data, '850');
    expect(tester.widget<Text>(_shown('lineCount')).data, '3');
  });

  testWidgets('行を消すと、その場で減る', (tester) async {
    await tester.pumpWidget(_harness(_Repo(), recordKey: 'SO-1'));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('hatake.subtable.lines.delete.1')));
    await tester.pumpAndSettle();

    expect(tester.widget<Text>(_shown('subtotal')).data, '200');
    expect(tester.widget<Text>(_shown('lineCount')).data, '1');
  });

  testWidgets('畳んだ値は保存する内容にも入る', (tester) async {
    final repo = _Repo();
    await tester.pumpWidget(_harness(repo, recordKey: 'SO-1'));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('hatake.form.save')));
    await tester.pumpAndSettle();

    expect(repo.saved?['subtotal'], 650);
    expect(repo.saved?['lineCount'], 2);
    // 明細そのものも一緒に保存される（親と一緒に持つ明細なので）。
    expect((repo.saved?['lines'] as List).length, 2);
  });

  testWidgets('並べて1行にする（join）', (tester) async {
    await tester.pumpWidget(_harness(_Repo(), recordKey: 'SO-1'));
    await tester.pumpAndSettle();

    expect(tester.widget<Text>(_shown('itemNames')).data, '鉛筆、ノート');
  });

  testWidgets('取消した行は、その場で合計と品名から外れる（where）', (tester) async {
    final repo = _Repo();
    await tester.pumpWidget(_harness(repo, recordKey: 'SO-1'));
    await tester.pumpAndSettle();

    // 2行目（ノート・450円）に取消印を付ける。行は消さない（何を取消したか残る）。
    await tester.tap(find.byKey(const Key('hatake.subtable.lines.edit.1')));
    await tester.pumpAndSettle();
    await tester.tap(_shown('cancelled'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('hatake.subtable.lines.row.save')));
    await tester.pumpAndSettle();

    expect(tester.widget<Text>(_shown('subtotal')).data, '200');
    expect(tester.widget<Text>(_shown('lineCount')).data, '1');
    expect(tester.widget<Text>(_shown('itemNames')).data, '鉛筆');
    // 明細そのものは2行のまま（取消は行の状態で、行を消すことではない）。
    await tester.tap(find.byKey(const Key('hatake.form.save')));
    await tester.pumpAndSettle();
    expect((repo.saved?['lines'] as List).length, 2);
    expect(repo.saved?['subtotal'], 200);
  });

  testWidgets('行が無ければ 0（空欄にしない＝「まだ無い」と読める）', (tester) async {
    await tester.pumpWidget(_harness(_Repo()));
    await tester.pumpAndSettle();

    expect(tester.widget<Text>(_shown('subtotal')).data, '0');
    expect(tester.widget<Text>(_shown('lineCount')).data, '0');
    // max は行が無ければ値が定まらない＝空欄（0 だと「最大 0 円」に見える）。
    expect(tester.widget<Text>(_shown('largest')).data, '');
    // join は文字を作る op なので、行が無ければ空文字（0 ではない）。
    expect(tester.widget<Text>(_shown('itemNames')).data, '');
  });
}
