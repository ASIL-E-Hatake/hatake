part of '../material_renderer.dart';

/// Standalone create/edit form page renderer (inline form, no dialog).
class _MaterialFormPage extends StatefulWidget {
  final FormPageDefinition definition;
  final FormController controller;
  final Map<String, MaterialFieldBuilder> fieldBuilders;
  final FormatterRegistry? formatters;

  const _MaterialFormPage({
    required this.definition,
    required this.controller,
    required this.fieldBuilders,
    required this.formatters,
  });

  @override
  State<_MaterialFormPage> createState() => _MaterialFormPageState();
}

class _MaterialFormPageState extends State<_MaterialFormPage> {
  final GlobalKey<_HatakeFormFieldsState> _fields = GlobalKey();

  /// 画面のボタンは**いま入力されている値**で出し分ける（`enabledWhen`）。ボタンは
  /// フォームの外に居るので、値が変わったことをここで受け取る。
  late final _LiveRecord _live = _LiveRecord(widget.controller.draft);

  /// 押せない理由を業務の言葉で言うための、項目名 → 見出し。
  Map<String, String> get _labels => {
        for (final field in widget.definition.form.fields)
          field.field: field.label,
      };

  @override
  void dispose() {
    _live.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final values = _fields.currentState!.collect();
    final saved = await widget.controller.submit(values);
    if (saved != null && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('保存しました')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  widget.definition.title,
                  style: theme.textTheme.headlineSmall,
                ),
              ),
              // 入力されている値が変わったら、ここだけ描き直す。
              AnimatedBuilder(
                animation: _live,
                builder: (context, _) => Row(
                  mainAxisSize: MainAxisSize.min,
                  children: _pageActionButtons(
                    context,
                    widget.definition.actions,
                    controller,
                    record: _live.record,
                    labels: _labels,
                    mode: controller.formMode,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Expanded(
            child: controller.loading
                ? const Center(child: CircularProgressIndicator())
                : SingleChildScrollView(
                    child: _HatakeFormFields(
                      key: _fields,
                      form: widget.definition.form,
                      initial: controller.draft,
                      live: _live,
                      validation: controller.validation,
                      fieldBuilders: widget.fieldBuilders,
                      roles: HatakeScope.of(context).roles,
                      formatters: widget.formatters,
                      validators: HatakeScope.of(context).validators,
                      computeds: HatakeScope.of(context).computeds,
                      subTables: HatakeScope.of(context).subTableController,
                      repositories: HatakeScope.of(context).repositories,
                      // 検証と同じものを使う（出どころはコントローラ1つ）。
                      mode: controller.formMode,
                      // Not `recordKey`: after a create the record exists, and
                      // repository-backed child rows need that new key.
                      recordKey: controller.effectiveKey,
                    ),
                  ),
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              FilledButton(
                key: const Key('hatake.form.save'),
                onPressed:
                    controller.loading || controller.submitting ? null : _submit,
                child: controller.submitting
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('保存'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
