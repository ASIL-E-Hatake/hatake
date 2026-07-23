import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:hatake_material/hatake_material.dart';
import 'package:hatake_yaml/hatake_yaml.dart';

import 'customer_repository.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final yaml = await rootBundle.loadString('assets/customer_master.yaml');
  final definition = parsePageYaml(yaml) as CrudPageDefinition;
  runApp(
    HatakeExampleApp(
      definition: definition,
      repository: CustomerRepository.seeded(),
    ),
  );
}

/// Wires a [CrudPageDefinition] to the Material renderer and an in-memory
/// repository. The UI is produced entirely from the definition — there is no
/// screen-specific widget code here.
class HatakeExampleApp extends StatelessWidget {
  final CrudPageDefinition definition;
  final Repository repository;

  const HatakeExampleApp({
    super.key,
    required this.definition,
    required this.repository,
  });

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
        repositories: RepositoryRegistry({'customerRepository': repository}),
        renderer: const MaterialRenderer(),
        // Plugin action: the definition's `csvExport` action dispatches here.
        actions: ActionRegistry({
          'csvExport': (ctx) async {
            ScaffoldMessenger.of(ctx.buildContext).showSnackBar(
              const SnackBar(content: Text('CSVを出力しました（デモ）')),
            );
          },
        }),
        child: Scaffold(
          body: SafeArea(child: HatakeCrudView(definition: definition)),
        ),
      ),
    );
  }
}
