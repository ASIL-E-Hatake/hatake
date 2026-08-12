part of '../material_renderer.dart';

/// The search area shared by every list-style page (CRUD / master / search).
///
/// Owns the filter input values and hands them to [onSearch] as a filter map.
/// Only filters with a value are included; empty inputs are omitted.
///
/// Keys: each input is `hatake.filter.<field>` — for an `operator: between`
/// filter the two inputs are `hatake.filter.<field>.from` / `.to` and the value
/// is sent as a 2-element `[from, to]` list. The button is `hatake.search`.
///
/// 選択肢の連動（`optionsFrom` / `optionsSource`）は入力フォームと同じ判定を使う。
/// 「いまの値の集まり」がレコードではなく検索欄に入っている値になるだけ。
class _SearchArea extends StatefulWidget {
  final SearchDefinition search;
  final ValueChanged<Map<String, Object?>> onSearch;

  const _SearchArea({required this.search, required this.onSearch});

  @override
  State<_SearchArea> createState() => _SearchAreaState();
}

class _SearchAreaState extends State<_SearchArea> {
  /// Text inputs, keyed by slot (`field`, or `field.from` / `field.to`).
  final Map<String, TextEditingController> _text = {};

  /// Picked values for non-text inputs (select / checkbox / date), by slot.
  final Map<String, Object?> _values = {};

  /// 選択肢の連動。入力フォームと同じものを使う（判定は hatake_core）。
  late final _OptionsFetcher _options = _OptionsFetcher(
    repositories: HatakeScope.of(context).repositories,
    onFetched: () {
      if (mounted) setState(() {});
    },
  );

  static const double _spacing = 12;
  static const double _slotWidth = 220;

  List<FilterDefinition> get _filters => widget.search.filters;

  static bool _isRange(FilterDefinition filter) =>
      filter.operator == FilterOperators.between;

  static List<String> _slotsOf(FilterDefinition filter) => _isRange(filter)
      ? ['${filter.field}.from', '${filter.field}.to']
      : [filter.field];

  /// Types captured with a [TextField]; everything else keeps a picked value.
  static bool _isTextInput(String type) =>
      type != FieldTypes.select &&
      type != FieldTypes.checkbox &&
      type != FieldTypes.date &&
      type != FieldTypes.dateTime;

  @override
  void initState() {
    super.initState();
    for (final filter in _filters) {
      for (final slot in _slotsOf(filter)) {
        if (_isTextInput(filter.type)) {
          _text[slot] = TextEditingController();
        } else {
          _values[slot] = null;
        }
      }
    }
  }

  @override
  void dispose() {
    for (final controller in _text.values) {
      controller.dispose();
    }
    super.dispose();
  }

  /// 他の条件の親に指定されている条件（＝変えたら子を描き直す必要があるもの）。
  Set<String> get _parents => {
        for (final filter in _filters)
          if (filter.optionsFrom != null) filter.optionsFrom!,
      };

  /// いま検索欄に入っている値（キーは条件の名前）。選択肢の連動の判定に使う。
  /// 範囲（`between`）は2つ値を持つので、親にはならない。
  Map<String, Object?> _currentValues() => {
        for (final filter in _filters)
          if (!_isRange(filter)) filter.field: _slotValue(filter, filter.field),
      };

  /// 親が変わって選べなくなった子の値を捨てる（絞った先に無い条件で検索させない）。
  void _clearStaleChildValues(Map<String, Object?> values) {
    for (final filter in _filters) {
      if (filter.optionsFrom == null) continue;
      if (filter.optionsSource != null) continue; // 引いてくる側は空振りが普通
      if (optionValueIsStale(filter, values)) {
        _values[filter.field] = null;
        values[filter.field] = null;
      }
    }
  }

  /// The current value of one input, or null when it carries no condition.
  Object? _slotValue(FilterDefinition filter, String slot) {
    final controller = _text[slot];
    if (controller == null) return _values[slot];
    final text = controller.text.trim();
    if (text.isEmpty) return null;
    if (filter.type == FieldTypes.number) return num.tryParse(text) ?? text;
    return text;
  }

  void _runSearch() {
    final filters = <String, Object?>{};
    for (final filter in _filters) {
      if (_isRange(filter)) {
        final from = _slotValue(filter, '${filter.field}.from');
        final to = _slotValue(filter, '${filter.field}.to');
        if (from == null && to == null) continue;
        filters[filter.field] = [from, to];
      } else {
        final value = _slotValue(filter, filter.field);
        if (value == null) continue;
        filters[filter.field] = value;
      }
    }
    widget.onSearch(filters);
  }

  static String _formatDate(DateTime date) {
    String two(int value) => value.toString().padLeft(2, '0');
    return '${date.year}-${two(date.month)}-${two(date.day)}';
  }

  Future<void> _pickDate(String slot) async {
    final current = DateTime.tryParse('${_values[slot] ?? ''}');
    final picked = await showDatePicker(
      context: context,
      initialDate: current ?? DateTime.now(),
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked != null) {
      setState(() => _values[slot] = _formatDate(picked));
    }
  }

  @override
  Widget build(BuildContext context) {
    // いまの値（選択肢の連動の判定に使う）。選べなくなった子の値は先に捨てる。
    final values = _currentValues();
    _clearStaleChildValues(values);
    final columns = widget.search.layout.columns;
    if (columns <= 1) {
      return _wrap([
        for (final filter in _filters)
          SizedBox(
            width: _isRange(filter) ? _slotWidth * 2 + _spacing : _slotWidth,
            child: _filterInput(filter, values),
          ),
      ]);
    }
    // Multi-column: split the available width, collapsing when it gets narrow.
    return LayoutBuilder(
      builder: (context, constraints) {
        final available = constraints.maxWidth.isFinite
            ? constraints.maxWidth
            : _slotWidth * columns + _spacing * (columns - 1);
        final perRow = available < _slotWidth * 2 ? 1 : columns;
        final width =
            ((available - _spacing * (perRow - 1)) / perRow).floorToDouble();
        return _wrap([
          for (final filter in _filters)
            SizedBox(width: width, child: _filterInput(filter, values)),
        ]);
      },
    );
  }

  Widget _wrap(List<Widget> inputs) {
    return Wrap(
      spacing: _spacing,
      runSpacing: _spacing,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        ...inputs,
        FilledButton.icon(
          key: const Key('hatake.search'),
          onPressed: _runSearch,
          icon: const Icon(Icons.search),
          label: const Text('検索'),
        ),
      ],
    );
  }

  Widget _filterInput(
    FilterDefinition filter,
    Map<String, Object?> values,
  ) {
    if (!_isRange(filter)) {
      return _slotInput(filter, filter.field, filter.label, values);
    }
    return Row(
      children: [
        Expanded(
          child: _slotInput(
              filter, '${filter.field}.from', '${filter.label}（開始）', values),
        ),
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 6),
          child: Text('〜'),
        ),
        Expanded(
          child: _slotInput(
              filter, '${filter.field}.to', '${filter.label}（終了）', values),
        ),
      ],
    );
  }

  InputDecoration _decoration(String label) => InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
        isDense: true,
      );

  Widget _slotInput(
    FilterDefinition filter,
    String slot,
    String label,
    Map<String, Object?> values,
  ) {
    final key = Key('hatake.filter.$slot');
    switch (filter.type) {
      case FieldTypes.select:
        return DropdownButtonFormField<Object?>(
          key: key,
          initialValue: _values[slot],
          decoration: _decoration(label),
          items: [
            const DropdownMenuItem<Object?>(value: null, child: Text('—')),
            for (final option in _options.optionsFor(filter, values))
              DropdownMenuItem<Object?>(
                value: option.value,
                child: Text(option.label),
              ),
          ],
          onChanged: (value) => setState(() => _values[slot] = value),
        );
      // Tri-state: no condition / true / false.
      case FieldTypes.checkbox:
        return DropdownButtonFormField<bool?>(
          key: key,
          initialValue: _values[slot] as bool?,
          decoration: _decoration(label),
          items: const [
            DropdownMenuItem<bool?>(value: null, child: Text('指定なし')),
            DropdownMenuItem<bool?>(value: true, child: Text('はい')),
            DropdownMenuItem<bool?>(value: false, child: Text('いいえ')),
          ],
          onChanged: (value) => setState(() => _values[slot] = value),
        );
      case FieldTypes.date:
      case FieldTypes.dateTime:
        return InkWell(
          key: key,
          onTap: () => _pickDate(slot),
          child: InputDecorator(
            decoration: _decoration(label).copyWith(
              suffixIcon: const Icon(Icons.calendar_today, size: 18),
            ),
            child: Text('${_values[slot] ?? ''}'),
          ),
        );
      default:
        return TextField(
          key: key,
          controller: _text[slot],
          keyboardType:
              filter.type == FieldTypes.number ? TextInputType.number : null,
          decoration: _decoration(label),
          // 親になっている条件だけは、打つたびに子の選択肢を描き直す。
          onChanged:
              _parents.contains(filter.field) ? (_) => setState(() {}) : null,
          onSubmitted: (_) => _runSearch(),
        );
    }
  }
}
