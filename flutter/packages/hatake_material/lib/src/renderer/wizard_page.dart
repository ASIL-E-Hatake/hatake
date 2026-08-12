part of '../material_renderer.dart';

/// Stepped-input page renderer: a step indicator, the current step's fields, and
/// 戻る / 次へ / 保存. Only the current step is drawn — the controller owns which
/// step that is and what has been entered so far.
class _MaterialWizardPage extends StatefulWidget {
  final WizardPageDefinition definition;
  final WizardController controller;
  final Map<String, MaterialFieldBuilder> fieldBuilders;
  final FormatterRegistry? formatters;

  const _MaterialWizardPage({
    required this.definition,
    required this.controller,
    required this.fieldBuilders,
    required this.formatters,
  });

  @override
  State<_MaterialWizardPage> createState() => _MaterialWizardPageState();
}

class _MaterialWizardPageState extends State<_MaterialWizardPage> {
  /// One key per step: the fields widget is rebuilt when the step changes, so
  /// each step needs its own handle to collect from.
  final Map<String, GlobalKey<_HatakeFormFieldsState>> _keys = {};

  WizardController get _controller => widget.controller;

  GlobalKey<_HatakeFormFieldsState> _keyFor(WizardStepDefinition step) =>
      _keys.putIfAbsent(step.id, GlobalKey<_HatakeFormFieldsState>.new);

  /// Current inputs, or an empty record while the step is still loading.
  DataRecord _collect(WizardStepDefinition step) =>
      _keys[step.id]?.currentState?.collect() ?? const {};

  void _next() {
    _controller.next(_collect(_controller.step));
  }

  void _back() {
    _controller.back(_collect(_controller.step));
  }

  Future<void> _submit() async {
    final saved = await _controller.submit(_collect(_controller.step));
    if (saved != null && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('保存しました')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final roles = HatakeScope.of(context).roles;
    final step = _controller.step;

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
                _controller,
                record: _controller.draft,
              ),
            ],
          ),
          const SizedBox(height: 12),
          _buildStepIndicator(theme),
          const SizedBox(height: 12),
          Expanded(
            child: _controller.loading
                ? const Center(child: CircularProgressIndicator())
                : SingleChildScrollView(child: _buildStep(theme, step, roles)),
          ),
          if (_controller.error != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                'エラー: ${_controller.error}',
                key: const Key('hatake.wizard.error'),
                style: TextStyle(color: theme.colorScheme.error),
              ),
            ),
          const SizedBox(height: 8),
          _buildNavigation(),
        ],
      ),
    );
  }

  /// Step headings with the current one highlighted — a plain row rather than a
  /// Material `Stepper`, so the fields keep using the shared form renderer.
  Widget _buildStepIndicator(ThemeData theme) {
    final steps = widget.definition.steps;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (var i = 0; i < steps.length; i++) ...[
            if (i > 0)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Icon(
                  Icons.chevron_right,
                  size: 18,
                  color: theme.colorScheme.outline,
                ),
              ),
            _StepChip(
              key: Key('hatake.wizard.step.${steps[i].id}'),
              index: i,
              label: steps[i].title,
              current: i == _controller.stepIndex,
              done: i < _controller.stepIndex,
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildStep(
    ThemeData theme,
    WizardStepDefinition step,
    Set<String> roles,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(step.title, style: theme.textTheme.titleMedium),
        if (step.description != null && step.description!.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              step.description!,
              style: TextStyle(color: theme.colorScheme.outline),
            ),
          ),
        const SizedBox(height: 8),
        _HatakeFormFields(
          // Keyed per step so switching steps rebuilds the inputs.
          key: _keyFor(step),
          form: step.form,
          initial: _controller.draft,
          validation: _controller.validation,
          fieldBuilders: widget.fieldBuilders,
          roles: roles,
          formatters: widget.formatters,
          validators: HatakeScope.of(context).validators,
          subTables: HatakeScope.of(context).subTableController,
          repositories: HatakeScope.of(context).repositories,
          mode: _controller.recordKey == null
              ? ConditionModes.create
              : ConditionModes.edit,
          recordKey: _controller.recordKey,
        ),
      ],
    );
  }

  Widget _buildNavigation() {
    final busy = _controller.loading || _controller.submitting;
    return Row(
      mainAxisAlignment: MainAxisAlignment.end,
      children: [
        if (!_controller.isFirstStep) ...[
          TextButton(
            key: const Key('hatake.wizard.back'),
            onPressed: busy ? null : _back,
            child: const Text('戻る'),
          ),
          const SizedBox(width: 8),
        ],
        if (_controller.isLastStep)
          FilledButton(
            key: const Key('hatake.wizard.save'),
            onPressed: busy ? null : _submit,
            child: _controller.submitting
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('保存'),
          )
        else
          FilledButton(
            key: const Key('hatake.wizard.next'),
            onPressed: busy ? null : _next,
            child: const Text('次へ'),
          ),
      ],
    );
  }
}

/// One entry in the step indicator.
class _StepChip extends StatelessWidget {
  final int index;
  final String label;
  final bool current;
  final bool done;

  const _StepChip({
    super.key,
    required this.index,
    required this.label,
    required this.current,
    required this.done,
  });

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final active = current || done;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        CircleAvatar(
          radius: 12,
          backgroundColor: active ? scheme.primary : scheme.surfaceContainerHighest,
          child: done
              ? Icon(Icons.check, size: 14, color: scheme.onPrimary)
              : Text(
                  '${index + 1}',
                  style: TextStyle(
                    fontSize: 12,
                    color: active ? scheme.onPrimary : scheme.onSurfaceVariant,
                  ),
                ),
        ),
        const SizedBox(width: 6),
        Text(
          label,
          style: TextStyle(
            fontWeight: current ? FontWeight.bold : FontWeight.normal,
            color: current ? scheme.primary : null,
          ),
        ),
      ],
    );
  }
}
