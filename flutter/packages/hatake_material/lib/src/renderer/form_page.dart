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
              ..._pageActionButtons(
                context,
                widget.definition.actions,
                controller,
                record: controller.draft,
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
