import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show Clipboard, ClipboardData;
import 'package:hatake_encoding/hatake_encoding.dart';
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

  /// 画面に出す用の整形。**中身は変えない**（コピーは本物を渡す）。
  ///
  /// CSV には Excel 向けに BOM と CRLF が入っているが、`Text` はそれを「豆腐」で
  /// 描いてしまうので、表示のときだけ落とす。BOM/CRLF が入っていること自体は
  /// 下の注記で伝える（デモは仕様を見せる場でもあるので）。
  static String _forDisplay(String text) =>
      text.replaceFirst('\u{FEFF}', '').replaceAll('\r\n', '\n');

  /// 末尾の改行を1行と数えない。
  static int _lineCount(String text) {
    final body = _forDisplay(text);
    final trimmed = body.endsWith('\n')
        ? body.substring(0, body.length - 1)
        : body;
    return trimmed.isEmpty ? 0 : trimmed.split('\n').length;
  }

  /// 出力先がやること＝文字列をバイト列にする。定義が言ってきた文字コードで。
  ///
  /// デモは画面に出すだけなので、ここでは「何バイトになるか」を見せる。実際のアプリ
  /// では、このバイト列をダウンロード / 保存 / 送信に渡す。
  static String _describeBytes(ExportRequest request) {
    try {
      final bytes = EncodingRegistry().encode(request.charset, request.text);
      return '${request.charset} で ${bytes.length} バイト';
    } on UnmappableCharacterException catch (error) {
      // 業務データに変換できない文字が混じっていたら、黙って化けさせない。
      return '${request.charset} に変換できません（${error.character}）';
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lines = _lineCount(request.text);
    final hasBom = request.text.startsWith('\u{FEFF}');
    final isUtf8 = EncodingRegistry.utf8Names.contains(
      request.charset.toLowerCase(),
    );
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
              'このデモでは中身を見せています。'
              '${hasBom ? '実際の出力には Excel 向けに BOM と CRLF 改行が入っています'
                  '（画面では読みやすさのため省いて表示。コピーは本物です）。' : ''}'
              '${isUtf8 ? '' : '文字コード変換も出力先の担当です'
                  '（この定義は ${request.charset} を要求しています）。'}',
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: theme.colorScheme.outline),
            ),
            const SizedBox(height: 4),
            Text(
              _describeBytes(request),
              key: const Key('demo.export.bytes'),
              style: theme.textTheme.bodySmall?.copyWith(
                color: isUtf8
                    ? theme.colorScheme.outline
                    : theme.colorScheme.primary,
                fontWeight: isUtf8 ? null : FontWeight.bold,
              ),
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
                    _forDisplay(request.text),
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
