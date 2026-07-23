import 'package:hatake_core/hatake_core.dart';
import 'package:test/test.dart';

void main() {
  group('CrudPageDefinition', () {
    CrudPageDefinition buildCustomerPage() {
      return const CrudPageDefinition(
        id: 'customer_master',
        title: '顧客マスタ',
        repository: 'customerRepository',
        keyField: 'id',
        search: SearchDefinition(
          filters: [
            FilterDefinition(
              field: 'name',
              label: '顧客名',
              operator: FilterOperators.contains,
            ),
          ],
        ),
        table: TableDefinition(
          columns: [
            ColumnDefinition(field: 'code', label: 'コード', sortable: true),
            ColumnDefinition(field: 'name', label: '顧客名', sortable: true),
          ],
          rowActions: ['edit', 'delete'],
        ),
        form: FormDefinition(
          sections: [
            SectionDefinition(
              title: '基本情報',
              fields: [
                FieldDefinition(
                  field: 'code',
                  label: 'コード',
                  required: true,
                  validators: [
                    ValidatorDefinition(
                      type: ValidatorTypes.maxLength,
                      params: {'value': 20},
                    ),
                  ],
                ),
                FieldDefinition(field: 'name', label: '顧客名', required: true),
              ],
            ),
          ],
        ),
      );
    }

    test('defaults are applied', () {
      const page = CrudPageDefinition(
        id: 'p',
        title: 't',
        repository: 'r',
        table: TableDefinition(),
        form: FormDefinition(),
      );
      expect(page.keyField, 'id');
      expect(page.dslVersion, kDslVersion);
      expect(page.search, isNull);
      expect(page.actions, isEmpty);
    });

    test('is a PageDefinition', () {
      expect(buildCustomerPage(), isA<PageDefinition>());
    });

    test('value equality holds for identical definitions', () {
      expect(buildCustomerPage(), equals(buildCustomerPage()));
      expect(
        buildCustomerPage().hashCode,
        equals(buildCustomerPage().hashCode),
      );
    });

    test('differing field makes definitions unequal', () {
      final a = buildCustomerPage();
      const b = CrudPageDefinition(
        id: 'other',
        title: '顧客マスタ',
        repository: 'customerRepository',
        table: TableDefinition(),
        form: FormDefinition(),
      );
      expect(a, isNot(equals(b)));
    });

    test('FormDefinition.fields flattens all sections in order', () {
      final page = buildCustomerPage();
      expect(
        page.form.fields.map((f) => f.field),
        equals(['code', 'name']),
      );
    });
  });
}
