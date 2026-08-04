import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:hatake_material/hatake_material.dart';
import 'package:hatake_yaml/hatake_yaml.dart';

import 'customer_repository.dart';
import 'order_repository.dart';
import 'product_repository.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final yaml = await rootBundle.loadString('assets/sales_app.yaml');
  final definition = parseAppYaml(yaml);
  runApp(HatakeExampleApp(definition: definition));
}

/// Renders a whole app — menu shell plus every page — from a single
/// [AppDefinition]. The UI is produced entirely from the definition; there is
/// no screen-specific widget code here. In-memory repositories stand in for a
/// real backend.
class HatakeExampleApp extends StatelessWidget {
  final AppDefinition definition;

  const HatakeExampleApp({super.key, required this.definition});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'hatake example',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorSchemeSeed: Colors.green,
        useMaterial3: true,
      ),
      home: HatakeScope(
        repositories: RepositoryRegistry({
          'customerRepository': CustomerRepository.seeded(),
          'productRepository': ProductRepository.seeded(),
          'orderRepository': OrderRepository.seeded(),
        }),
        renderer: const MaterialRenderer(),
        child: HatakeApp(app: definition),
      ),
    );
  }
}
