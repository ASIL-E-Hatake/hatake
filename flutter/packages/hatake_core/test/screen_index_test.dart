import 'package:hatake_core/hatake_core.dart';
import 'package:test/test.dart';

/// The index over pages that are already in memory — the case that matters
/// inside an app (a screen picker, a "jump to screen" box). Reading definitions
/// off disk is hatake_yaml's job and is tested there.
void main() {
  const orderSearch = SearchPageDefinition(
    id: 'order_search',
    title: '受注照会',
    repository: 'orderRepository',
    keyField: 'orderNo',
    search: SearchDefinition(
      filters: [
        FilterDefinition(field: 'orderNo', label: '受注番号'),
        FilterDefinition(
          field: 'customer',
          label: '顧客名',
          operator: FilterOperators.contains,
        ),
      ],
    ),
    table: TableDefinition(
      columns: [
        ColumnDefinition(field: 'orderNo', label: '受注番号', sortable: true),
        ColumnDefinition(field: 'amount', label: '金額', format: 'currency'),
      ],
    ),
    actions: [
      ActionDefinition(id: 'csv', type: ActionTypes.export, label: 'CSV出力'),
    ],
  );

  const customerMaster = MasterPageDefinition(
    id: 'customer_master',
    title: '顧客マスタ',
    repository: 'customerRepository',
    table: TableDefinition(
      columns: [ColumnDefinition(field: 'code', label: 'コード')],
    ),
    form: FormDefinition(
      sections: [
        SectionDefinition(
          fields: [
            FieldDefinition(field: 'code', label: 'コード', required: true),
            FieldDefinition(field: 'name', label: '顧客名'),
          ],
        ),
      ],
    ),
  );

  const wizard = WizardPageDefinition(
    id: 'customer_wizard',
    title: '顧客登録ウィザード',
    repository: 'customerRepository',
    steps: [
      WizardStepDefinition(
        id: 'basic',
        title: '基本情報',
        fields: [FieldDefinition(field: 'code', label: 'コード', required: true)],
      ),
      WizardStepDefinition(
        id: 'address',
        title: '住所',
        fields: [FieldDefinition(field: 'zip', label: '郵便番号')],
      ),
    ],
  );

  final index = ScreenIndex.ofPages([orderSearch, customerMaster, wizard]);

  group('one line per screen', () {
    test('says what the screen is and how big it is', () {
      final brief = briefOf(orderSearch);
      expect(brief.what, '照会（読み取り専用）');
      expect(brief.line, contains('受注照会（order_search）'));
      expect(brief.line, contains('条件 2'));
      expect(brief.line, contains('列 2'));
      expect(brief.line, contains('ボタン 1'));
      expect(brief.line, contains('orderRepository から'));
    });

    test('counts steps for a wizard, not one folded form', () {
      final brief = briefOf(wizard);
      expect(brief.counts['steps'], 2);
      expect(brief.counts['fields'], 2);
      expect(brief.line, contains('ステップ 2（項目 2）'));
    });

    test('required fields are counted, but do not inflate the size', () {
      final brief = briefOf(customerMaster);
      expect(brief.counts['required'], 1);
      // 列 1 + 枠 1 + 項目 2 = 4（必須の 1 は項目に含まれているので数えない）。
      expect(ScreenEntry.of(customerMaster).size, 4);
    });
  });

  group('searching the index', () {
    test('every word must match (and case is ignored)', () {
      expect(
        index.search('顧客 検索').map((one) => one.id),
        // マスタ保守は「検索して一覧に出し…」なので検索でも当たる。
        containsAll(['customer_master']),
      );
      expect(index.search('ORDERREPOSITORY').map((one) => one.id), ['order_search']);
      expect(index.search('顧客 帳票'), isEmpty);
    });

    test('finds a screen by a label on it, and by a field name', () {
      expect(index.search('金額').map((one) => one.id), ['order_search']);
      expect(index.search('orderNo').map((one) => one.id), ['order_search']);
    });

    test('finds a screen by a button label', () {
      expect(index.search('CSV出力').map((one) => one.id), ['order_search']);
    });

    test('finds a wizard by a step title', () {
      expect(index.search('住所').map((one) => one.id), ['customer_wizard']);
    });

    test('no words means every screen', () {
      expect(index.search(null).length, 3);
      expect(index.search('   ').length, 3);
    });
  });

  group('the index itself', () {
    test('is sorted so the same input gives the same index', () {
      expect(index.screens.map((one) => one.id), [
        'customer_master',
        'customer_wizard',
        'order_search',
      ]);
    });

    test('biggest screens first, for finding where the work is', () {
      expect(index.bySize().first.id, 'order_search');
    });

    test('renders as a table with the columns lined up', () {
      final text = renderScreenIndex(index.screens);
      expect(text, startsWith('画面 3 枚:'));
      final lines = text.split('\n').skip(1).toList();
      // 画面名の位置が3行で揃っている（全角を2として詰めている）。
      final at = lines.map((line) => line.indexOf('顧客マスタ')).toList();
      expect(lines.length, 3);
      expect(at.first, greaterThan(0));
    });

    test('says so when nothing matches, instead of printing an empty table', () {
      expect(renderScreenIndex(index.search('存在しない画面')), contains('当てはまる画面はありません'));
    });

    test('an app indexes each of its screens', () {
      const app = AppDefinition(
        id: 'sales',
        title: '販売管理',
        pages: [orderSearch, customerMaster],
      );
      expect(ScreenIndex.ofApp(app, file: 'sales_app.yaml').screens.length, 2);
      expect(
        ScreenIndex.ofApp(app, file: 'sales_app.yaml').screens.first.file,
        'sales_app.yaml',
      );
    });

    test('is machine readable too (a screen picker can read it)', () {
      final json = ScreenEntry.of(orderSearch).toJson();
      expect(json['id'], 'order_search');
      expect(json['kind'], 'search');
      expect(json['what'], '照会（読み取り専用）');
      expect(json['repository'], 'orderRepository');
      expect((json['words']! as List).contains('金額'), isTrue);
    });
  });

  group('reading the parts of a page', () {
    test('a kind without that part answers, rather than throwing', () {
      expect(customerMaster.searchArea, isNull);
      expect(wizard.tableArea, isNull);
      expect(wizard.formArea, isNull, reason: 'ウィザードの項目は steps 側で数える');
      expect(wizard.steps.length, 2);
      expect(orderSearch.formArea, isNull);
      expect(orderSearch.pageActions.length, 1);
    });

    test('every kind reports its own type', () {
      expect(pageKindOf(orderSearch), PageKinds.search);
      expect(pageKindOf(customerMaster), PageKinds.master);
      expect(pageKindOf(wizard), PageKinds.wizard);
    });
  });
}
