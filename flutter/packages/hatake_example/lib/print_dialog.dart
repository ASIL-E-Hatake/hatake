import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:hatake_material/hatake_material.dart';
import 'package:hatake_print/hatake_print.dart';

/// Shows what a `type: print` action produced. Demo-only.
///
/// This dialog *is* the boundary the framework draws, in one screen:
///
///   1. the definition asks to print (`type: print`)
///   2. the framework hands over the paper's contents ([PrintRequest]) — no bytes
///   3. an opt-in adapter turns that into a PDF ([reportPdf], `hatake_print`)
///   4. the application gets those bytes somewhere — download, save dialog,
///      printer, mail attachment
///
/// Steps 3 and 4 are this app's code, not the framework's, which is why they
/// live here in the example. A browser cannot open a PDF this demo never wrote
/// to disk, so instead of pretending, it reports what was produced.
class PrintDialog extends StatelessWidget {
  /// What the framework handed over.
  final PrintRequest request;

  /// The PDF the adapter made from it.
  final Uint8List bytes;

  /// Sheets of paper — from the layout, so it is the real count, not an estimate.
  final int sheets;

  const PrintDialog({
    super.key,
    required this.request,
    required this.bytes,
    required this.sheets,
  });

  /// Runs the adapter and shows the result.
  ///
  /// Note what is passed on: the roles (so a column the user may not see stays
  /// off the paper) and the renderer's formatters (so a number reads the same on
  /// paper as on screen). The font comes from the action's `config`, which the
  /// framework passed through without reading — paper and type are the adapter's
  /// vocabulary.
  static Future<void> show(BuildContext context, PrintRequest request) {
    final document = buildReport(request.page.report, request.rows);
    final layout = layoutReport(
      request.page,
      document,
      formatters: request.formatters,
      roles: request.roles,
    );
    final font = request.config['font'] == 'mincho'
        ? PdfFont.mincho
        : PdfFont.gothic;
    return showDialog<void>(
      context: context,
      builder: (_) => PrintDialog(
        request: request,
        bytes: writePdf(layout, font: font),
        sheets: layout.pages.length,
      ),
    );
  }

  String get _paper {
    final paper = request.page.report.paper;
    return '${paper.size}・${paper.isLandscape ? '横' : '縦'}';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final label = theme.textTheme.bodySmall
        ?.copyWith(color: theme.colorScheme.outline);
    return AlertDialog(
      title: Text('印刷 — ${request.filename}'),
      content: SizedBox(
        width: 560,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Framework が渡すのは「紙の中身」までです（帳票の定義・いま画面に出ている'
              '${request.rows.length} 行・見える列を決める役割・見せ方）。'
              'PDF のバイト列にするのは opt-in の hatake_print、'
              'それをダウンロードやプリンタに送るのはこのアプリの担当なので、'
              'デモでは「何ができたか」を出しています。',
              style: label,
            ),
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: theme.colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '$_paper の紙 $sheets 枚',
                    key: const Key('demo.print.sheets'),
                    style: theme.textTheme.titleMedium,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'PDF ${bytes.length} バイト（先頭は '
                    '${String.fromCharCodes(bytes.take(8))}）',
                    key: const Key('demo.print.bytes'),
                    style: const TextStyle(
                      fontFamily: 'monospace',
                      fontFamilyFallback: ['Courier New', 'monospace'],
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Text(
              '刷る前に紙を読むなら `npx hatake paper <定義>`（同じ座標を文字で出します）。',
              style: label,
            ),
          ],
        ),
      ),
      actions: [
        FilledButton(
          key: const Key('demo.print.close'),
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('閉じる'),
        ),
      ],
    );
  }
}
