import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show Clipboard, ClipboardData;

/// Shows the YAML that produced the current screen, so a visitor can see
/// exactly what to write. Demo-only widget.
class DefinitionDialog extends StatelessWidget {
  final String title;
  final String yaml;

  const DefinitionDialog({super.key, required this.title, required this.yaml});

  static Future<void> show(
    BuildContext context, {
    required String title,
    required String yaml,
  }) {
    return showDialog<void>(
      context: context,
      builder: (_) => DefinitionDialog(title: title, yaml: yaml),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AlertDialog(
      title: Text('この画面の定義 — $title'),
      content: SizedBox(
        width: 640,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'この画面は下の定義だけで出来ています（画面固有のコードはありません）。'
              'そのまま自分のプロジェクトの `page:` の下に貼れます。',
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: theme.colorScheme.outline),
            ),
            const SizedBox(height: 12),
            ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 380),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: theme.colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: SingleChildScrollView(
                  child: Text(
                    yaml,
                    key: const Key('demo.definition.yaml'),
                    style: const TextStyle(
                      fontFamily: 'monospace',
                      fontFamilyFallback: ['Courier New', 'monospace'],
                      fontSize: 12,
                      height: 1.4,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton.icon(
          key: const Key('demo.definition.copy'),
          onPressed: () async {
            await Clipboard.setData(ClipboardData(text: yaml));
            if (context.mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('定義をコピーしました')),
              );
            }
          },
          icon: const Icon(Icons.copy_all_outlined),
          label: const Text('コピー'),
        ),
        FilledButton(
          key: const Key('demo.definition.close'),
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('閉じる'),
        ),
      ],
    );
  }
}
