import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';
import 'package:hatake_yaml/hatake_yaml.dart';

import 'fake_repository.dart';

/// [pumpPage] が出した画面の持ち物（あとで確かめるための取っ手）。
class PumpedPage {
  /// 解析後の定義（`explain` や `ScenarioRunner` にそのまま渡せる）。
  final PageDefinition definition;

  /// 画面が読み書きした偽の Repository（**聞かれたことを覚えている**）。
  final FakeRepository repository;

  const PumpedPage({required this.definition, required this.repository});
}

/// 定義を**そのまま**画面に出す（画面の試験の入口）。
///
/// 試験のたびに `MaterialApp` → `Scaffold` → `HatakeScope` → `HatakePageView` を
/// 積み直すのは、書く人にとって毎回同じ手間で、しかも**積み方を1つ間違えると**
/// 画面が出ない（`HatakeScope.of` が見つからない、で落ちる）。枠組み側が積む。
///
/// ```dart
/// testWidgets('必須を空で保存すると、そう言われる', (tester) async {
///   final page = await pumpPage(tester, definition, rows: [
///     {'id': 1, 'orderNo': 'SO-1'},
///   ]);
///   await tester.tap(HatakeFind.formSave);
///   await tester.pump();
///   expect(find.text('必須項目です'), findsOneWidget);
///   expect(page.repository.calls, isNot(contains('create')));
/// });
/// ```
///
/// [definition] は YAML / JSON の文字列でも、解析済みの [PageDefinition] でもよい
/// （AI が書いた定義をそのまま貼れるように）。**解析は strict**（知らないキーを弾く）
/// ＝試験の中で黙って捨てられたキーがあると、通ったのに効いていない試験になる。
///
/// [rows] を渡さなければ、定義に出てくる項目名から**それらしい行**を作る
/// （[sampleRows]）。「一覧が出るか」だけを見たいときはこれで足りる。**値を確かめる
/// 試験では必ず行を書く**（作った値は嘘なので）。
///
/// 登録（[actions] / [validators] / [computeds] / [converters]）はアプリと同じものを
/// 渡せる＝プラグインを含めて試せる。渡さなければ組み込みだけ。
Future<PumpedPage> pumpPage(
  WidgetTester tester,
  Object definition, {
  List<DataRecord>? rows,
  Map<String, Repository> repositories = const {},
  Map<String, ActionHandler> actions = const {},
  Map<String, ValidatorFn> validators = const {},
  Map<String, Converter> converters = const {},
  Map<String, ComputedFn> computeds = const {},
  Map<String, AggregateFn> aggregates = const {},
  Map<String, MaterialFieldBuilder> fieldBuilders = const {},
  Set<String> roles = const {},
  Set<String> knownRoles = const {},
  ExportSink? exportSink,
  PrintSink? printSink,
  Object? recordKey,
  ThemeData? theme,
  Object? failWith,
}) async {
  final page = definition is PageDefinition
      ? definition
      : parsePageYaml(definition.toString(), strict: true);

  final repository = FakeRepository(
    rows ?? sampleRows(_fieldNames(page)),
    page.recordKeyField ?? 'id',
    failWith,
  );

  await tester.pumpWidget(
    MaterialApp(
      theme: theme,
      home: Scaffold(
        body: HatakeScope(
          // 定義が名指しした Repository は全部この偽物にする（1画面の試験で
          // 名前ごとに偽物を書かせない）。渡されたものはそれより強い。
          repositories: RepositoryRegistry({
            for (final key in _repositoryKeys(page)) key: repository,
            ...repositories,
          }),
          renderer: MaterialRenderer(fieldBuilders: fieldBuilders),
          actions: ActionRegistry(actions),
          validators: ValidatorRegistry(validators),
          converters: ConverterRegistry(converters),
          computeds: ComputedRegistry(computeds),
          aggregates: AggregateRegistry(aggregates),
          exportSink: exportSink,
          printSink: printSink,
          roles: roles,
          knownRoles: knownRoles,
          child: HatakePageView(definition: page, recordKey: recordKey),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return PumpedPage(definition: page, repository: repository);
}

/// 定義に出てくる項目名（行を作るため）。鍵・列・項目・絞り込みを集める。
Set<String> _fieldNames(PageDefinition page) => {
      page.recordKeyField ?? 'id',
      for (final column in page.tableArea?.columns ?? const []) column.field,
      for (final field in _inputFields(page)) field.field,
      for (final filter in page.searchArea?.filters ?? const []) filter.field,
    };

/// 手で入れる項目（ステップ入力は枠を持たないので、ステップから集める）。
List<FieldDefinition> _inputFields(PageDefinition page) => [
      ...?page.formArea?.fields,
      for (final step in page.steps) ...step.fields,
    ];

/// 定義が名指しした Repository のキー（画面・別テーブルに持つ明細・カードの分）。
Set<String> _repositoryKeys(PageDefinition page) => {
      page.repositoryKey,
      for (final field in _inputFields(page))
        if (field.source != null) field.source!.repository,
      for (final card in page.cards) card.repository,
    }.whereType<String>().toSet();
