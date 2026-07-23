import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

class _NoopRepository implements Repository {
  @override
  Future<PageResult> search(RepositoryQuery query) async => PageResult.empty;
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
  id: 'plugins',
  title: 'プラグインデモ',
  repository: 'repo',
  keyField: 'id',
  table: TableDefinition(
    columns: [ColumnDefinition(field: 'id', label: 'ID')],
  ),
  form: FormDefinition(
    sections: [
      SectionDefinition(
        fields: [
          FieldDefinition(
            field: 'qty',
            label: '数量',
            type: 'number',
            validators: [ValidatorDefinition(type: 'even')],
          ),
          FieldDefinition(field: 'color', label: '色', type: 'color'),
        ],
      ),
    ],
  ),
  actions: [
    ActionDefinition(id: 'create', type: 'create', label: '新規登録'),
    ActionDefinition(id: 'export', type: 'plugin', plugin: 'csvExport', label: 'CSV出力'),
  ],
);

// Custom validator: value must be an even number.
ValidatorRegistry _evenValidator() => ValidatorRegistry({
      'even': (value, def) {
        final n = value is num ? value : num.tryParse('${value ?? ''}');
        if (n == null) return null;
        return n % 2 == 0 ? null : '偶数を入力してください';
      },
    });

// Custom field type 'color'.
final Map<String, MaterialFieldBuilder> _colorField = {
  'color': (ctx) => TextButton(
        key: const Key('custom.color'),
        onPressed: () => ctx.onChanged('red'),
        child: Text('色: ${ctx.value ?? '-'}'),
      ),
};

Widget _harness({
  ValidatorRegistry? validators,
  ActionRegistry? actions,
  Map<String, MaterialFieldBuilder>? fieldBuilders,
}) {
  return MaterialApp(
    home: Scaffold(
      body: HatakeScope(
        repositories: RepositoryRegistry({'repo': _NoopRepository()}),
        renderer: MaterialRenderer(fieldBuilders: fieldBuilders ?? const {}),
        validators: validators,
        actions: actions,
        child: const HatakeCrudView(definition: _definition),
      ),
    ),
  );
}

void main() {
  testWidgets('custom field type renders via fieldBuilders', (tester) async {
    await tester.pumpWidget(_harness(fieldBuilders: _colorField));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('hatake.action.create')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('custom.color')), findsOneWidget);
  });

  testWidgets('custom validator (plugin) blocks submit', (tester) async {
    await tester.pumpWidget(
      _harness(validators: _evenValidator(), fieldBuilders: _colorField),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('hatake.action.create')));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('hatake.form.qty')), '3');
    await tester.tap(find.byKey(const Key('hatake.form.save')));
    await tester.pumpAndSettle();

    expect(find.text('偶数を入力してください'), findsWidgets);
    expect(find.byKey(const Key('hatake.form.save')), findsOneWidget); // still open
  });

  testWidgets('custom action (plugin) handler is invoked', (tester) async {
    final log = <String>[];
    final actions = ActionRegistry({
      'csvExport': (ctx) async => log.add(ctx.action.id),
    });

    await tester.pumpWidget(
      _harness(actions: actions, fieldBuilders: _colorField),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('hatake.action.export')));
    await tester.pumpAndSettle();

    expect(log, equals(['export']));
  });
}
