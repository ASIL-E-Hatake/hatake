import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

class _Repo implements Repository {
  @override
  Future<PageResult> search(RepositoryQuery query) async => const PageResult(
        items: [
          {'id': 1, 'code': 'C001', 'name': '佐藤商事'},
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
  table: TableDefinition(
    columns: [
      ColumnDefinition(field: 'code', label: 'コード'),          // 幅指定なし
      ColumnDefinition(field: 'name', label: '顧客名', width: 220), // 幅指定あり
    ],
  ),
  form: FormDefinition(),
);

Widget _harness() {
  return MaterialApp(
    home: Scaffold(
      body: HatakeScope(
        repositories: RepositoryRegistry({'repo': _Repo()}),
        renderer: const MaterialRenderer(),
        child: const HatakeCrudView(definition: _definition),
      ),
    ),
  );
}

void main() {
  testWidgets('column.width fixes the header and cell width', (tester) async {
    await tester.pumpWidget(_harness());
    await tester.pumpAndSettle();

    // Header label and the data cell are both constrained to the declared width,
    // so the column cannot collapse (e.g. while a CJK web font is still loading).
    for (final label in ['顧客名', '佐藤商事']) {
      final box = tester.renderObject<RenderBox>(
        find.ancestor(
          of: find.text(label),
          matching: find.byType(SizedBox),
        ).first,
      );
      expect(box.size.width, 220);
    }

    // A column without `width` is left to size itself (no SizedBox wrapper).
    expect(
      find.ancestor(of: find.text('コード'), matching: find.byType(SizedBox)),
      findsNothing,
    );
  });
}
