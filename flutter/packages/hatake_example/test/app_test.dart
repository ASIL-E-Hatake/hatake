import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_example/customer_repository.dart';
import 'package:hatake_example/main.dart';
import 'package:hatake_material/hatake_material.dart';
import 'package:hatake_yaml/hatake_yaml.dart';

void main() {
  testWidgets('renders the customer master defined in YAML', (tester) async {
    final yaml = await rootBundle.loadString('assets/customer_master.yaml');
    final definition = parsePageYaml(yaml) as CrudPageDefinition;

    await tester.pumpWidget(
      HatakeExampleApp(
        definition: definition,
        repository: CustomerRepository.seeded(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('顧客マスタ'), findsOneWidget);
    expect(find.byType(DataTable), findsOneWidget);
    expect(find.text('全 23 件'), findsOneWidget);
    // The definition drives the columns and the seeded data.
    expect(find.text('C001'), findsOneWidget);
  });
}
