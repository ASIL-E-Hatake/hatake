import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show Clipboard, ClipboardData;
import 'package:hatake_material/hatake_material.dart';

/// Shows what an `export` action produced, with a copy button. Demo-only.
///
/// The framework builds the CSV text and hands it to the registered
/// [ExportSink]; writing a file is platform I/O, so a real app would download it
/// (web), open a save dialog (desktop) or share it (mobile). This demo shows the
/// document instead, which is also the most useful thing in a browser.
class ExportDialog extends StatelessWidget {
  final ExportRequest request;

  const ExportDialog({super.key, required this.request});

  static Future<void> show(BuildContext context, ExportRequest request) {
    return showDialog<void>(
      context: context,
      builder: (_) => ExportDialog(request: request),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lines = request.text.split('\n').length;
    return AlertDialog(
      title: Text('出力 — ${request.filename}'),
      content: SizedBox(
        width: 640,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Framework が作るのはこの文字列までです（$lines 行 / ${request.mimeType}）。'
              'ダウンロードや保存はアプリ側で登録した出力先の担当なので、'
              'このデモでは中身を見せています。',
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
                    request.text,
                    key: const Key('demo.export.text'),
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
          key: const Key('demo.export.copy'),
          onPressed: () async {
            await Clipboard.setData(ClipboardData(text: request.text));
            if (context.mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('CSV をコピーしました')),
              );
            }
          },
          icon: const Icon(Icons.copy_all_outlined),
          label: const Text('コピー'),
        ),
        FilledButton(
          key: const Key('demo.export.close'),
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('閉じる'),
        ),
      ],
    );
  }
}
