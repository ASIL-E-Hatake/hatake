import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_material/hatake_material.dart';

/// 押す前に**行の状態で出し分ける**（`enabledWhen`）。
///
/// ここで守るのは4つ。**判定する相手は置き場所で決まる**（行アクションはその行、
/// 一括は選んだ行ぜんぶ、レコードを持つ画面はそのレコード）・**入力する画面では
/// いま入力されている値で見る**（保存しないと押せないボタンを作らない。計算した項目も
/// `{ mode: create }` も同じ record から判定する）・**一部だけ動かさない**（1件でも
/// 合わなければ押せない）・**理由の無い灰色を出さない**（何の状態で決まるのかを画面に
/// 出す。文言は書かせない＝定義から出す）。
class _Orders implements Repository {
  final List<DataRecord> rows;

  _Orders(this.rows);

  @override
  Future<PageResult> search(RepositoryQuery query) async =>
      PageResult(items: rows, totalCount: rows.length);
  @override
  Future<DataRecord?> findByKey(Object key) async =>
      rows.firstWhere((r) => r['orderNo'] == key);
  @override
  Future<DataRecord> create(DataRecord data) async => data;
  @override
  Future<DataRecord> update(Object key, DataRecord data) async => data;
  @override
  Future<void> delete(Object key) async {}
}

List<DataRecord> _rows() => [
      {'orderNo': 'SO-1', 'status': '未出荷'},
      {'orderNo': 'SO-2', 'status': '出荷済'},
    ];

const _table = TableDefinition(
  rowActions: ['openEntry'],
  columns: [
    ColumnDefinition(field: 'orderNo', label: '受注番号'),
    ColumnDefinition(field: 'status', label: '状態'),
  ],
);

/// 出荷済でない行だけ開ける行アクション。
const _openEntry = ActionDefinition(
  id: 'openEntry',
  type: ActionTypes.navigate,
  label: '明細編集',
  enabledWhen: {'field': 'status', 'operator': 'notEquals', 'value': '出荷済'},
);

/// 出荷済でない行だけまとめて承認できる一括。
const _approve = ActionDefinition(
  id: 'approve',
  type: ActionTypes.plugin,
  plugin: 'approveOrders',
  label: '一括承認',
  scope: ActionScopes.selection,
  enabledWhen: {'field': 'status', 'operator': 'notEquals', 'value': '出荷済'},
);

const _rowPage = SearchPageDefinition(
  id: 'order_search',
  title: '受注照会',
  repository: 'orderRepository',
  keyField: 'orderNo',
  table: _table,
  actions: [_openEntry],
);

const _bulkPage = SearchPageDefinition(
  id: 'order_search',
  title: '受注照会',
  repository: 'orderRepository',
  keyField: 'orderNo',
  table: TableDefinition(
    columns: [
      ColumnDefinition(field: 'orderNo', label: '受注番号'),
      ColumnDefinition(field: 'status', label: '状態'),
    ],
  ),
  actions: [_approve],
);

/// 画面のボタンに条件を書いた一覧（判定する相手が無い＝出し分けられない）。
const _pageButtonPage = SearchPageDefinition(
  id: 'order_search',
  title: '受注照会',
  repository: 'orderRepository',
  keyField: 'orderNo',
  table: TableDefinition(
    columns: [ColumnDefinition(field: 'orderNo', label: '受注番号')],
  ),
  actions: [
    ActionDefinition(
      id: 'csv',
      type: ActionTypes.export,
      label: 'CSV出力',
      enabledWhen: {'field': 'status', 'operator': 'equals', 'value': '未出荷'},
    ),
  ],
);

/// レコードを持つ画面（入力中の値で出し分ける）。
const _formPage = FormPageDefinition(
  id: 'order_entry',
  title: '受注入力',
  repository: 'orderRepository',
  keyField: 'orderNo',
  form: FormDefinition(
    sections: [
      SectionDefinition(
        fields: [
          FieldDefinition(field: 'orderNo', label: '受注番号'),
          FieldDefinition(field: 'status', label: '状態'),
        ],
      ),
    ],
  ),
  actions: [
    ActionDefinition(
      id: 'send',
      type: ActionTypes.plugin,
      plugin: 'sendOrder',
      label: '送信',
      enabledWhen: {'field': 'status', 'operator': 'equals', 'value': '未出荷'},
    ),
  ],
);

/// 計算した項目で出し分ける（合計が 0 より大きいときだけ送れる）。
const _computedPage = FormPageDefinition(
  id: 'order_entry',
  title: '受注入力',
  repository: 'orderRepository',
  keyField: 'orderNo',
  form: FormDefinition(
    sections: [
      SectionDefinition(
        fields: [
          FieldDefinition(field: 'orderNo', label: '受注番号'),
          FieldDefinition(field: 'qty', label: '数量', type: FieldTypes.number),
          FieldDefinition(field: 'extra', label: '追加', type: FieldTypes.number),
          FieldDefinition(
            field: 'total',
            label: '合計',
            type: FieldTypes.number,
            computed: {'op': 'sum', 'fields': ['qty', 'extra']},
          ),
        ],
      ),
    ],
  ),
  actions: [
    ActionDefinition(
      id: 'send',
      type: ActionTypes.plugin,
      plugin: 'sendOrder',
      label: '送信',
      enabledWhen: {'field': 'total', 'operator': 'gt', 'value': 0},
    ),
  ],
);

/// 新規入力のときだけ押せるボタン（`{ mode: create }`）。
const _modePage = FormPageDefinition(
  id: 'order_entry',
  title: '受注入力',
  repository: 'orderRepository',
  keyField: 'orderNo',
  form: FormDefinition(
    sections: [
      SectionDefinition(
        fields: [FieldDefinition(field: 'orderNo', label: '受注番号')],
      ),
    ],
  ),
  actions: [
    ActionDefinition(
      id: 'send',
      type: ActionTypes.plugin,
      plugin: 'sendOrder',
      label: '下書き保存',
      enabledWhen: {'mode': 'create'},
    ),
  ],
);

/// 詳細画面（読むだけの画面。判定するのは開いているレコード）。
const _detailPage = DetailPageDefinition(
  id: 'order_detail',
  title: '受注詳細',
  repository: 'orderRepository',
  keyField: 'orderNo',
  form: FormDefinition(
    sections: [
      SectionDefinition(
        fields: [
          FieldDefinition(field: 'orderNo', label: '受注番号'),
          FieldDefinition(field: 'status', label: '状態'),
        ],
      ),
    ],
  ),
  actions: [
    ActionDefinition(
      id: 'send',
      type: ActionTypes.plugin,
      plugin: 'sendOrder',
      label: '送信',
      enabledWhen: {'field': 'status', 'operator': 'equals', 'value': '未出荷'},
    ),
  ],
);

/// ステップに分けて入れる画面（1つ目のステップで入れた値で出し分ける）。
const _wizardPage = WizardPageDefinition(
  id: 'order_wizard',
  title: '受注登録',
  repository: 'orderRepository',
  keyField: 'orderNo',
  steps: [
    WizardStepDefinition(
      id: 'basic',
      title: '基本',
      fields: [
        FieldDefinition(field: 'orderNo', label: '受注番号'),
        FieldDefinition(field: 'status', label: '状態'),
      ],
    ),
    WizardStepDefinition(
      id: 'detail',
      title: '明細',
      fields: [FieldDefinition(field: 'note', label: '備考')],
    ),
  ],
  actions: [
    ActionDefinition(
      id: 'send',
      type: ActionTypes.plugin,
      plugin: 'sendOrder',
      label: '送信',
      enabledWhen: {'field': 'status', 'operator': 'equals', 'value': '未出荷'},
    ),
  ],
);

Widget _harness(PageDefinition page, {Object? recordKey}) => MaterialApp(
      home: Scaffold(
        body: HatakeScope(
          repositories: RepositoryRegistry({'orderRepository': _Orders(_rows())}),
          renderer: const MaterialRenderer(),
          actions: ActionRegistry({
            'approveOrders': (ctx) async {},
            'sendOrder': (ctx) async {},
          }),
          child: HatakePageView(definition: page, recordKey: recordKey),
        ),
      ),
    );

bool _pressable(WidgetTester tester, Finder finder) {
  final widget = tester.widget(finder);
  if (widget is TextButton) return widget.onPressed != null;
  if (widget is FilledButton) return widget.onPressed != null;
  if (widget is IconButton) return widget.onPressed != null;
  throw StateError('ボタンではありません: $widget');
}

void main() {
  testWidgets('行アクションは、その行の状態で押せるかが決まる', (tester) async {
    await tester.pumpWidget(_harness(_rowPage));
    await tester.pumpAndSettle();

    final open = find.byKey(const Key('hatake.rowaction.openEntry.SO-1'));
    final closed = find.byKey(const Key('hatake.rowaction.openEntry.SO-2'));
    expect(_pressable(tester, open), isTrue);
    // 出荷済の行は押せない（ボタンは出たまま＝その操作が在ることは分かる）。
    expect(closed, findsOneWidget);
    expect(_pressable(tester, closed), isFalse);
  });

  testWidgets('押せない理由を、定義から出す（文言は書かせない）', (tester) async {
    await tester.pumpWidget(_harness(_rowPage));
    await tester.pumpAndSettle();

    // 何の状態で決まるのかまで言う（項目の業務名で）。
    final tooltip = tester.widget<Tooltip>(
      find.ancestor(
        of: find.byKey(const Key('hatake.rowaction.openEntry.SO-2')),
        matching: find.byType(Tooltip),
      ).first,
    );
    expect(tooltip.message, 'いまは押せません（状態 によります）');
    // 押せる行には理由を付けない。
    expect(
      find.ancestor(
        of: find.byKey(const Key('hatake.rowaction.openEntry.SO-1')),
        matching: find.byType(Tooltip),
      ),
      findsNothing,
    );
  });

  testWidgets('一括は、選んだ行が全部満たすときだけ押せる', (tester) async {
    await tester.pumpWidget(_harness(_bulkPage));
    await tester.pumpAndSettle();

    final button = find.byKey(const Key('hatake.action.approve'));
    // 満たす行だけ（SO-1）。
    await tester.tap(find.byType(Checkbox).at(1));
    await tester.pumpAndSettle();
    expect(_pressable(tester, button), isTrue);
    expect(find.text('一括承認（1 件）'), findsOneWidget);

    // 出荷済（SO-2）も混ぜると押せない。**何件が合わないか**をラベルに出す
    // ＝選び直せば押せることが、押す前に読める。
    await tester.tap(find.byType(Checkbox).at(2));
    await tester.pumpAndSettle();
    expect(_pressable(tester, button), isFalse);
    expect(find.text('一括承認（2 件：1 件は条件に合いません）'), findsOneWidget);
  });

  testWidgets('レコードを持つ画面は、開いているレコードで出し分ける（押せる側）',
      (tester) async {
    // 未出荷の受注を開いた＝送信できる。
    await tester.pumpWidget(_harness(_formPage, recordKey: 'SO-1'));
    await tester.pumpAndSettle();
    expect(
      _pressable(tester, find.byKey(const Key('hatake.action.send'))),
      isTrue,
    );
  });

  testWidgets('レコードを持つ画面は、開いているレコードで出し分ける（押せない側）',
      (tester) async {
    // 出荷済の受注を開いた＝送信できない。
    await tester.pumpWidget(_harness(_formPage, recordKey: 'SO-2'));
    await tester.pumpAndSettle();
    expect(
      _pressable(tester, find.byKey(const Key('hatake.action.send'))),
      isFalse,
    );
  });

  testWidgets('入力する画面は、いま入力されている値で出し分ける（保存しなくても効く）',
      (tester) async {
    // 出荷済の受注を開いた＝送信できない。
    await tester.pumpWidget(_harness(_formPage, recordKey: 'SO-2'));
    await tester.pumpAndSettle();
    final send = find.byKey(const Key('hatake.action.send'));
    expect(_pressable(tester, send), isFalse);

    // 画面で直したら、その場で押せるようになる（保存を挟まない）。項目の側
    // （visibleWhen / computed）が入力に追従しているのと同じ record を見る。
    await tester.enterText(find.byKey(const Key('hatake.form.status')), '未出荷');
    await tester.pumpAndSettle();
    expect(_pressable(tester, send), isTrue);

    // 戻せば、また押せなくなる（片道ではない）。
    await tester.enterText(find.byKey(const Key('hatake.form.status')), '出荷済');
    await tester.pumpAndSettle();
    expect(_pressable(tester, send), isFalse);
  });

  testWidgets('計算した項目でも出し分けられる（入力から出る値も同じ record に入る）',
      (tester) async {
    await tester.pumpWidget(_harness(_computedPage));
    await tester.pumpAndSettle();
    final send = find.byKey(const Key('hatake.action.send'));
    // 何も入れていない＝合計 0 なので押せない。
    expect(_pressable(tester, send), isFalse);

    await tester.enterText(find.byKey(const Key('hatake.form.qty')), '2');
    await tester.pumpAndSettle();
    expect(_pressable(tester, send), isTrue);
  });

  testWidgets('新規入力なら押せる（{ mode: create }）', (tester) async {
    await tester.pumpWidget(_harness(_modePage));
    await tester.pumpAndSettle();
    expect(
      _pressable(tester, find.byKey(const Key('hatake.action.send'))),
      isTrue,
    );
  });

  testWidgets('既存を開いたら押せない（{ mode: create }）', (tester) async {
    await tester.pumpWidget(_harness(_modePage, recordKey: 'SO-1'));
    await tester.pumpAndSettle();
    expect(
      _pressable(tester, find.byKey(const Key('hatake.action.send'))),
      isFalse,
    );
  });

  testWidgets('押せない理由は、フォームの見出しで言う（項目名ではない）',
      (tester) async {
    await tester.pumpWidget(_harness(_formPage, recordKey: 'SO-2'));
    await tester.pumpAndSettle();

    final tooltip = tester.widget<Tooltip>(
      find.ancestor(
        of: find.byKey(const Key('hatake.action.send')),
        matching: find.byType(Tooltip),
      ).first,
    );
    expect(tooltip.message, 'いまは押せません（状態 によります）');
  });

  testWidgets('ステップに分けて入れる画面も、入力した値で出し分ける', (tester) async {
    await tester.pumpWidget(_harness(_wizardPage));
    await tester.pumpAndSettle();
    final send = find.byKey(const Key('hatake.action.send'));
    expect(_pressable(tester, send), isFalse);

    await tester.enterText(find.byKey(const Key('hatake.form.status')), '未出荷');
    await tester.pumpAndSettle();
    expect(_pressable(tester, send), isTrue);
  });

  testWidgets('読むだけの画面（detail）も出し分ける（押せる側）', (tester) async {
    await tester.pumpWidget(_harness(_detailPage, recordKey: 'SO-1'));
    await tester.pumpAndSettle();
    expect(
      _pressable(tester, find.byKey(const Key('hatake.action.send'))),
      isTrue,
    );
  });

  testWidgets('読むだけの画面（detail）も出し分ける（押せない側）', (tester) async {
    // ここは今まで**書いても効いていなかった**（詳細画面だけボタンを手で描いていた）。
    // 仕様書と `validate` は「レコードを持つ画面は出し分ける」と言っていたので、
    // 画面がそれに合っていなかった側。
    await tester.pumpWidget(_harness(_detailPage, recordKey: 'SO-2'));
    await tester.pumpAndSettle();
    expect(
      _pressable(tester, find.byKey(const Key('hatake.action.send'))),
      isFalse,
    );
  });

  testWidgets('判定する相手が無い画面のボタンは、押せるまま', (tester) async {
    // 出し分けられないので出し分けない（書いても効かないことは validate が言う）。
    await tester.pumpWidget(_harness(_pageButtonPage));
    await tester.pumpAndSettle();

    expect(
      _pressable(tester, find.byKey(const Key('hatake.action.csv'))),
      isTrue,
    );
  });
}
