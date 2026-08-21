part of '../material_renderer.dart';

/// Asks the action's `prompt` before it runs, and returns what was typed
/// (null = cancelled, so nothing runs).
///
/// **確認ダイアログを増やさない。** 聞くことがあるなら、その OK が確認そのもの
/// （2枚続けて出すのは、読まずに押す練習をさせるだけ）。なので `confirm` に書いた
/// 文言・ボタン名・危険な見た目は、このダイアログが引き取る。
///
/// 中身は [_HatakeFormFields]。項目の型・`required`・`validators`・`computed`・
/// `normalize` がフォームと同じに効く＝**入力の仕組みを2つ持たない**。
Future<DataRecord?> _askActionPrompt(
  BuildContext context,
  ActionDefinition action,
) {
  final prompt = action.prompt!;
  final scope = HatakeScope.of(context);
  // 独自の項目型と見せ方は Renderer が持っている。ここで受け取り直すと、
  // アクションを走らせる全部の画面に引数が増える（画面はもう持っていない）。
  final renderer = scope.renderer;
  final material = renderer is MaterialRenderer ? renderer : null;
  return showDialog<DataRecord>(
    context: context,
    barrierDismissible: false,
    builder: (_) => _ActionPromptDialog(
      action: action,
      prompt: prompt,
      fieldBuilders: material?.fieldBuilders ?? const {},
      roles: scope.roles,
      formatters: material?.formatters,
      validators: scope.validators,
      converters: scope.converters,
      computeds: scope.computeds,
      repositories: scope.repositories,
    ),
  );
}

class _ActionPromptDialog extends StatefulWidget {
  final ActionDefinition action;
  final ActionPromptDefinition prompt;
  final Map<String, MaterialFieldBuilder> fieldBuilders;
  final Set<String> roles;
  final FormatterRegistry? formatters;
  final ValidatorRegistry validators;
  final ConverterRegistry converters;
  final ComputedRegistry computeds;
  final RepositoryRegistry repositories;

  const _ActionPromptDialog({
    required this.action,
    required this.prompt,
    required this.fieldBuilders,
    required this.roles,
    required this.formatters,
    required this.validators,
    required this.converters,
    required this.computeds,
    required this.repositories,
  });

  @override
  State<_ActionPromptDialog> createState() => _ActionPromptDialogState();
}

class _ActionPromptDialogState extends State<_ActionPromptDialog> {
  final GlobalKey<_HatakeFormFieldsState> _fields = GlobalKey();
  ValidationResult _validation = ValidationResult.valid;

  /// 聞いているのは新しい値なので、条件（`{ mode: create }`）は create 扱い。
  late final FormDefinition _form = FormDefinition(
    sections: [SectionDefinition(fields: widget.prompt.fields)],
  );

  void _submit() {
    final input = _fields.currentState!.collect();
    final result = FormValidator(widget.validators)
        .validate(_form, input, mode: ConditionModes.create);
    // 書いていない・形式が違う、はここで止める（ハンドラに届く前に）。
    if (!result.isValid) {
      setState(() => _validation = result);
      return;
    }
    // 保存と同じ正規化を通す（全角の数字のまま業務に流さない）。
    Navigator.of(context).pop(
      FormNormalizer(widget.converters).normalize(_form, input),
    );
  }

  @override
  Widget build(BuildContext context) {
    final confirm = widget.action.confirm;
    final message = confirm?.message;
    final danger = confirm?.danger ?? false;
    final theme = Theme.of(context);
    return AlertDialog(
      key: Key('hatake.prompt.${widget.action.id}'),
      title: Text(widget.prompt.title ?? confirm?.title ?? widget.action.label),
      content: SizedBox(
        width: 420,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // `confirm` を書いてあれば、その文言はここに出る（ダイアログは1枚）。
              if (message != null) ...[
                Text(message, style: theme.textTheme.bodyMedium),
                const SizedBox(height: 12),
              ],
              _HatakeFormFields(
                key: _fields,
                form: _form,
                initial: const {},
                validation: _validation,
                fieldBuilders: widget.fieldBuilders,
                roles: widget.roles,
                formatters: widget.formatters,
                validators: widget.validators,
                repositories: widget.repositories,
                computeds: widget.computeds,
                mode: ConditionModes.create,
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          key: Key('hatake.prompt.${widget.action.id}.cancel'),
          onPressed: () => Navigator.of(context).pop(),
          child: Text(
            widget.prompt.cancelLabel ?? confirm?.cancelLabel ?? 'キャンセル',
          ),
        ),
        FilledButton(
          key: Key('hatake.prompt.${widget.action.id}.ok'),
          style: danger
              ? FilledButton.styleFrom(
                  backgroundColor: theme.colorScheme.error,
                  foregroundColor: theme.colorScheme.onError,
                )
              : null,
          onPressed: _submit,
          child: Text(
            widget.prompt.okLabel ?? confirm?.okLabel ?? widget.action.label,
          ),
        ),
      ],
    );
  }
}
