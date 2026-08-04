import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_test/flutter_test.dart';
import 'package:hatake_example/main.dart';
import 'package:hatake_yaml/hatake_yaml.dart';

void main() {
  testWidgets('renders the app shell and navigates between pages',
      (tester) async {
    final yaml = await rootBundle.loadString('assets/sales_app.yaml');
    final definition = parseAppYaml(yaml);

    await tester.pumpWidget(HatakeExampleApp(definition: definition));
    await tester.pumpAndSettle();

    // The shell shows the app title and lands on the home page.
    expect(find.text('販売管理'), findsOneWidget);
    expect(find.text('顧客マスタ'), findsOneWidget);
    // Seeded customer data proves the page is wired to its repository.
    expect(find.text('C001'), findsOneWidget);

    // The menu offers the other pages; only the rail carries this label so far.
    expect(find.text('受注照会'), findsOneWidget);
    await tester.tap(find.text('受注照会'));
    await tester.pumpAndSettle();

    // The order search page is now shown with its seeded rows.
    expect(find.text('受注番号'), findsOneWidget);
    expect(find.text('SO-1001'), findsOneWidget);
  });
}
