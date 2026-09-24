import 'package:hatake_core/hatake_core.dart';
import 'package:hatake_yaml/hatake_yaml.dart';
import 'package:test/test.dart';

/// `app.vocabularies` に書いた語彙が、**使う所へ実体で入る**こと。
///
/// 見本2本で、同じコード表を 3回・2回・3回 書いていた。片方だけ直すと画面ごとに
/// 違う字が出て、しかも直すまで誰も気づかない。だから1か所に書いて名前で指す。
///
/// 展開は**読み込み時**なので、この先（Renderer・CSV・紙）は語彙を知らない。
/// ここで実体が入っていることを確かめれば、下流は今までどおりで正しく出る。
const _yaml = '''
dsl_version: "1.0"
app:
  id: orders
  title: 受注
  home: orders
  vocabularies:
    - name: orderStatus
      options:
        - { value: draft, label: 作成中 }
        - { value: shipped, label: 出荷済 }
  menu:
    - { id: orders, label: 受注一覧, page: orders }
  pages:
    - type: crud
      id: orders
      title: 受注一覧
      repository: orderRepository
      key: orderNo
      search:
        filters:
          - { field: status, label: 受注状態, optionsOf: orderStatus }
      table:
        columns:
          - { field: orderNo, label: 受注番号 }
          - { field: status, label: 受注状態, optionsOf: orderStatus }
      form:
        sections:
          - fields:
              - { field: orderNo, label: 受注番号, type: text, required: true }
              - { field: status, label: 受注状態, type: select, optionsOf: orderStatus }
''';

void main() {
  test('列・検索条件・入力項目のどれにも、実体の選択肢が入る', () {
    final app = parseAppYaml(_yaml);
    final page = app.pages.first as CrudPageDefinition;

    final column = page.table.columns.firstWhere((c) => c.field == 'status');
    expect(column.options.map((o) => o.label), ['作成中', '出荷済']);

    final filter = page.search!.filters.first;
    expect(filter.options.map((o) => o.label), ['作成中', '出荷済']);

    final field = page.form.sections.first.fields
        .firstWhere((f) => f.field == 'status');
    expect(field.options.map((o) => o.label), ['作成中', '出荷済']);
  });

  test('列が名指しした語彙で、そのまま字になる', () {
    final app = parseAppYaml(_yaml);
    final page = app.pages.first as CrudPageDefinition;
    final column = page.table.columns.firstWhere((c) => c.field == 'status');

    // 借りる仕掛けを通さなくても、自分の持ち物で出る。
    expect(cellText(FormatterRegistry(), const [], column, 'shipped'), '出荷済');
  });

  test('その場に書いた options が勝つ', () {
    final app = parseAppYaml(_yaml.replaceFirst(
      '- { field: status, label: 受注状態, optionsOf: orderStatus }\n      form:',
      '- { field: status, label: 受注状態, optionsOf: orderStatus, '
          'options: [{ value: shipped, label: 発送済 }] }\n      form:',
    ));
    final page = app.pages.first as CrudPageDefinition;
    final column = page.table.columns.firstWhere((c) => c.field == 'status');
    expect(column.options.single.label, '発送済');
  });

  test('引けない名前のときは、空の並びを置かない', () {
    // 空を置くと「書いたのに効かない」が検証にも出なくなる。
    final app = parseAppYaml(_yaml.replaceAll('optionsOf: orderStatus', 'optionsOf: nope'));
    final page = app.pages.first as CrudPageDefinition;
    expect(page.table.columns.firstWhere((c) => c.field == 'status').options, isEmpty);
  });

  test('語彙を1つも書いていない定義は、今までどおり読める', () {
    final app = parseAppYaml(_yaml
        .replaceAll(RegExp(r'  vocabularies:[\s\S]*?  menu:'), '  menu:')
        .replaceAll(', optionsOf: orderStatus', ''));
    expect(app.pages, hasLength(1));
  });
}
