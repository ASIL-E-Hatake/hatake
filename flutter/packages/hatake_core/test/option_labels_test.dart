import 'package:hatake_core/hatake_core.dart';
import 'package:test/test.dart';

/// 一覧のコードを、**同じ画面に書いてある選択肢**の名前で出す。
///
/// 業務のマスタはコードで持って名前で見せる。入力欄では `options` のラベルが出るのに
/// 一覧ではコードのまま出ていたので、同じ画面の選択肢から引くようにした。
/// 列に `options` を書けるようにしなかったのは、**同じことを2か所に書かせない**ため。
void main() {
  final page = CrudPageDefinition(
    id: 'supplier_master',
    title: '取引先マスタ',
    repository: 'supplierRepository',
    keyField: 'supplierCode',
    table: const TableDefinition(columns: [
      ColumnDefinition(field: 'supplierType', label: '区分', type: ColumnTypes.badge),
      ColumnDefinition(field: 'tradeStatus', label: '取引状態', type: ColumnTypes.badge),
      ColumnDefinition(field: 'supplierName', label: '取引先名'),
    ]),
    search: const SearchDefinition(filters: [
      FilterDefinition(
        field: 'tradeStatus',
        label: '取引状態',
        options: [
          OptionItem(value: 'active', label: '取引中'),
          OptionItem(value: 'closed', label: '終了'),
        ],
      ),
    ]),
    form: const FormDefinition(sections: [
      SectionDefinition(title: '基本', fields: [
        FieldDefinition(
          field: 'supplierType',
          label: '区分',
          options: [
            OptionItem(value: 'corp', label: '法人'),
            OptionItem(value: 'individual', label: '個人'),
          ],
        ),
        FieldDefinition(field: 'supplierName', label: '取引先名'),
        FieldDefinition(
          field: 'closingDay',
          label: '締め日',
          options: [OptionItem(value: 10, label: '10日')],
        ),
      ]),
    ]),
  );

  test('入力欄の選択肢から引く', () {
    expect(optionLabelOf(page, 'supplierType', 'corp'), '法人');
    expect(optionLabelOf(page, 'supplierType', 'individual'), '個人');
  });

  test('検索条件の選択肢からも引く（入力欄に無い項目）', () {
    expect(optionLabelOf(page, 'tradeStatus', 'active'), '取引中');
  });

  test('選択肢に無い値は null（勝手に作らない）', () {
    expect(optionLabelOf(page, 'supplierType', 'unknown'), isNull);
  });

  test('選択肢を持たない項目は null', () {
    expect(optionLabelOf(page, 'supplierName', '山田商事'), isNull);
  });

  test('値が null なら null', () {
    expect(optionLabelOf(page, 'supplierType', null), isNull);
  });

  test('型をまたいで比べる（YAML の 10 と REST の "10"）', () {
    expect(optionLabelOf(page, 'closingDay', 10), '10日');
    expect(optionLabelOf(page, 'closingDay', '10'), '10日');
  });

  test('crud / master は CrudLike として渡せる（Renderer が使う道）', () {
    expect(optionLabelIn(optionOwnersOfCrud(page), 'supplierType', 'corp'), '法人');
  });
}
