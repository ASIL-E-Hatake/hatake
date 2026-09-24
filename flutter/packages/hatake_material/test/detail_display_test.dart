import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// 詳細画面の**見せ方**。どちらも納品用のスクリーンショットを見て見つけた。
///
///   ・明細が `[{orderNo: SO2026070001, lineNo: 1, …}]` と1行で出ていた
///   ・状態が「出荷済」ではなく `shipped` で出ていた
///
/// 一覧では正しく出ていたので、**同じ定義が画面によって別の顔をしていた**。
/// 原因は「値を文字にする」処理が6か所に写し取られていて、直したのが3か所だけ
/// だったこと。1本にまとめたので、詳細でも同じ字になることをここで縛る。
class _Repo implements Repository {
  @override
  Future<PageResult> search(RepositoryQuery query) async =>
      const PageResult(items: [], totalCount: 0);

  @override
  Future<DataRecord?> findByKey(Object key) async => {
        'orderNo': key,
        'status': 'shipped',
        'lines': [
          {'lineNo': 1, 'itemCode': 'ITEM-001', 'unit': 'box'},
          {'lineNo': 2, 'itemCode': 'ITEM-002', 'unit': 'pcs'},
        ],
      };

  @override
  Future<DataRecord> create(DataRecord data) async => data;

  @override
  Future<DataRecord> update(Object key, DataRecord data) async => data;

  @override
  Future<void> delete(Object key) async {}
}

const _page = DetailPageDefinition(
  id: 'order_detail',
  title: '受注詳細',
  repository: 'repo',
  keyField: 'orderNo',
  form: FormDefinition(
    sections: [
      SectionDefinition(
        fields: [
          FieldDefinition(
            field: 'status',
            label: '受注状態',
            options: [
              OptionItem(value: 'draft', label: '作成中'),
              OptionItem(value: 'shipped', label: '出荷済'),
            ],
          ),
          FieldDefinition(
            field: 'lines',
            label: '明細',
            type: FieldTypes.subTable,
            columns: [
              ColumnDefinition(field: 'lineNo', label: '行'),
              ColumnDefinition(field: 'itemCode', label: '品目'),
              ColumnDefinition(field: 'unit', label: '単位'),
            ],
            rowFields: [
              FieldDefinition(
                field: 'unit',
                label: '単位',
                options: [
                  OptionItem(value: 'box', label: '箱'),
                  OptionItem(value: 'pcs', label: '個'),
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  ),
);

Widget _harness() => MaterialApp(
      home: HatakeScope(
        repositories: RepositoryRegistry({'repo': _Repo()}),
        renderer: const MaterialRenderer(),
        child: const HatakePageView(definition: _page, recordKey: 'SO-1'),
      ),
    );

void main() {
  testWidgets('状態はコードではなく名前で出る（一覧と同じ字）', (tester) async {
    await tester.pumpWidget(_harness());
    await tester.pumpAndSettle();

    expect(find.text('出荷済'), findsOneWidget);
    expect(find.text('shipped'), findsNothing);
  });

  testWidgets('明細は表として出る（入れ子をそのまま文字にしない）', (tester) async {
    await tester.pumpWidget(_harness());
    await tester.pumpAndSettle();

    // 見出しと中身が升に分かれて出ている。
    expect(find.byType(DataTable), findsOneWidget);
    expect(find.text('品目'), findsOneWidget);
    expect(find.text('ITEM-001'), findsOneWidget);
    expect(find.text('ITEM-002'), findsOneWidget);

    // **生の入れ子が1行で出ていない**（これが出ていたのが元の不具合）。
    expect(find.textContaining('{lineNo:'), findsNothing);
    expect(find.textContaining('['), findsNothing);
  });

  testWidgets('明細の中の選択肢は、明細の中で引く', (tester) async {
    await tester.pumpWidget(_harness());
    await tester.pumpAndSettle();

    expect(find.text('箱'), findsOneWidget);
    expect(find.text('個'), findsOneWidget);
    expect(find.text('box'), findsNothing);
  });
}
