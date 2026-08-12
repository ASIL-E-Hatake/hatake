import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:hatake_material/hatake_material.dart';
import 'package:hatake_yaml/hatake_yaml.dart';

import 'export_dialog.dart';
import 'playground_data.dart';

/// Paste a definition, see the screen. Nothing to install.
///
/// The point of the whole framework is "the screen comes from the definition", so
/// the fastest way to show it is to let someone edit the definition and watch the
/// screen change. Everything here is demo code: the editor, the sample data, and
/// the sharing link — a real application only ships definitions.
class Playground extends StatefulWidget {
  /// 最初に入れておく定義。
  final String initialSource;

  /// 「例を入れる」で選べる定義（名前 → YAML）。
  final Map<String, String> samples;

  const Playground({
    super.key,
    required this.initialSource,
    this.samples = const {},
  });

  /// URL から復元する（`?yaml=<base64>`）。壊れていたら null。
  static String? sourceFromUrl(Uri url) {
    final encoded = url.queryParameters['yaml'];
    if (encoded == null || encoded.isEmpty) return null;
    try {
      return utf8.decode(base64Url.decode(base64Url.normalize(encoded)));
    } catch (_) {
      return null; // 共有リンクが途中で切れた等。黙って既定に戻す。
    }
  }

  /// 共有リンクにする（`?yaml=<base64>`）。
  static Uri shareUrl(Uri base, String source) => base.replace(
        queryParameters: {
          ...base.queryParameters,
          'playground': '1',
          'yaml': base64Url.encode(utf8.encode(source)),
        },
      );

  @override
  State<Playground> createState() => _PlaygroundState();
}

class _PlaygroundState extends State<Playground> {
  late final TextEditingController _controller =
      TextEditingController(text: widget.initialSource);

  /// 表示している定義。編集しても、読めるようになるまで前のものを出しておく。
  Widget? _preview;

  /// 読めなかった理由（1行1件）。空なら成功。
  List<String> _problems = const [];

  /// プレビューを作り直すための鍵。定義が変わったら状態を捨てる。
  int _generation = 0;

  @override
  void initState() {
    super.initState();
    _render();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  /// 定義を読んで、プレビューを組み直す。
  ///
  /// strict で読むので、知らないキーは「黙って無視」ではなく理由が出る。ここが
  /// プレイグラウンドの半分の価値（書き間違いにその場で気づける）。
  void _render() {
    final source = _controller.text;
    final problems = <String>[];
    Widget? preview;

    try {
      final document = decodeDefinitionYaml(source);
      // 未知キーは解析の成否と関係なく出す。必須キーの綴り間違い（`lable`）は解析が
      // 先に落ちるので、そこで止めると「何が無いか」しか出ず、直し方が出ない。
      for (final unknown in findUnknownKeys(document)) {
        problems.add(
          '${unknown.path.isEmpty ? '(直下)' : unknown.path}: '
          '知らないキー "${unknown.key}"'
          '${unknown.suggestion == null ? '' : '（${unknown.suggestion} の間違い？）'}',
        );
      }
      final Object definition = document.containsKey('app')
          ? parseAppYaml(source)
          : parsePageYaml(source);
      preview = HatakeScope(
        repositories: sampleRepositories(document),
        renderer: const MaterialRenderer(),
        exportSink: (request) async {
          if (!mounted) return;
          await ExportDialog.show(context, request);
        },
        child: definition is AppDefinition
            ? HatakeApp(app: definition)
            : HatakePageView(definition: definition as PageDefinition),
      );
    } on DefinitionParseException catch (error) {
      problems.add(error.path == null
          ? error.message
          : '${error.path}: ${error.message}');
    } catch (error) {
      problems.add(error.toString());
    }

    setState(() {
      _problems = problems;
      if (preview != null) {
        _preview = preview;
        _generation++;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final wide = MediaQuery.sizeOf(context).width >= 900;
    final editor = _buildEditor(theme);
    final preview = _buildPreview(theme);

    return Scaffold(
      appBar: AppBar(
        title: const Text('プレイグラウンド'),
        actions: [
          if (widget.samples.isNotEmpty)
            PopupMenuButton<String>(
              key: const Key('playground.samples'),
              tooltip: '例を入れる',
              icon: const Icon(Icons.folder_open_outlined),
              onSelected: (name) {
                _controller.text = widget.samples[name] ?? '';
                _render();
              },
              itemBuilder: (context) => [
                for (final name in widget.samples.keys)
                  PopupMenuItem(value: name, child: Text(name)),
              ],
            ),
          IconButton(
            key: const Key('playground.render'),
            tooltip: '描画する',
            icon: const Icon(Icons.play_arrow),
            onPressed: _render,
          ),
        ],
      ),
      body: wide
          ? Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(child: editor),
                const VerticalDivider(width: 1),
                Expanded(child: preview),
              ],
            )
          : Column(
              children: [
                Expanded(child: editor),
                const Divider(height: 1),
                Expanded(child: preview),
              ],
            ),
    );
  }

  Widget _buildEditor(ThemeData theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Expanded(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: TextField(
              key: const Key('playground.source'),
              controller: _controller,
              maxLines: null,
              expands: true,
              textAlignVertical: TextAlignVertical.top,
              onChanged: (_) => _render(),
              style: const TextStyle(
                fontFamily: 'monospace',
                fontFamilyFallback: ['Courier New', 'monospace'],
                fontSize: 13,
                height: 1.4,
              ),
              decoration: const InputDecoration(
                border: OutlineInputBorder(),
                isDense: true,
                hintText: 'ここに定義（YAML）を貼る',
              ),
            ),
          ),
        ),
        if (_problems.isNotEmpty)
          Container(
            key: const Key('playground.problems'),
            width: double.infinity,
            color: theme.colorScheme.errorContainer,
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final problem in _problems)
                  Text(
                    problem,
                    style: theme.textTheme.bodySmall
                        ?.copyWith(color: theme.colorScheme.onErrorContainer),
                  ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _buildPreview(ThemeData theme) {
    if (_preview == null) {
      return Center(
        child: Text('定義が読めたらここに画面が出ます',
            key: const Key('playground.empty'),
            style: theme.textTheme.bodyMedium),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          color: theme.colorScheme.surfaceContainerHighest,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  _problems.isEmpty
                      ? 'この画面は左の定義だけから出ています（データはサンプル）'
                      : '前に読めた定義を表示しています',
                  style: theme.textTheme.bodySmall,
                ),
              ),
            ],
          ),
        ),
        Expanded(
          // 定義が変わったら状態を捨てる（前の画面のコントローラを引き継がない）。
          child: KeyedSubtree(key: ValueKey(_generation), child: _preview!),
        ),
      ],
    );
  }
}
