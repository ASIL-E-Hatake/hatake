import '../definition/validator_definition.dart';
import '../definition/validator_types.dart';
import '../i18n/message_resolver.dart';
import '../logic/aggregate.dart';

/// Validates a single [value] against a [ValidatorDefinition], returning an
/// error message on failure or null when valid.
typedef ValidatorFn = String? Function(
  Object? value,
  ValidatorDefinition definition,
);

/// What a validator needs besides the value it is checking.
///
/// Cross-field validation (`compare`) reads **another field's value**, which a
/// value-only signature cannot express, so the whole record comes along. The
/// labels come too, so the message can be phrased in the words on the screen
/// (「開始日以上にしてください」, not 「startDate 以上にしてください」).
///
/// One object rather than more parameters: adding a parameter would break every
/// plugin's validator each time something new is needed.
class ValidationContext {
  const ValidationContext({this.record, this.labels, this.mode});

  /// The record being validated.
  final Map<String, Object?>? record;

  /// Field name → label.
  final Map<String, String>? labels;

  /// State for `{ mode: create }` style conditions.
  final String? mode;
}

/// A validator that also sees the rest of the record ([ValidationContext]).
///
/// Kept separate from [ValidatorFn] so existing two-argument validators — the
/// ones apps and plugins already registered — keep compiling.
typedef ContextValidatorFn = String? Function(
  Object? value,
  ValidatorDefinition definition,
  ValidationContext context,
);

num? _toNum(Object? value) {
  if (value is num) return value;
  if (value is String) return num.tryParse(value);
  return null;
}

bool _isEmpty(Object? value) =>
    value == null ||
    (value is String && value.trim().isEmpty) ||
    (value is Iterable && value.isEmpty);

/// Built-in validators keyed by [ValidatorTypes]. Messages are resolved via a
/// [MessageResolver] (default locale Japanese) so they can be localized or
/// overridden; per-rule override via `ValidatorDefinition.message` still wins.
///
/// Every built-in takes a [ValidationContext] — most ignore it; `compare` needs
/// it (it reads another field of the same record).
Map<String, ContextValidatorFn> builtinValidators([MessageResolver? messages]) {
  final m = messages ?? MessageResolver();
  return {
    ValidatorTypes.required: (value, def, context) =>
        _isEmpty(value) ? m.resolve('required') : null,
    ValidatorTypes.maxLength: (value, def, context) {
      final max = (def.params['value'] as num?)?.toInt();
      if (max == null || value == null) return null;
      return value.toString().length > max
          ? m.resolve('maxLength', {'value': max})
          : null;
    },
    ValidatorTypes.minLength: (value, def, context) {
      final min = (def.params['value'] as num?)?.toInt();
      if (min == null || _isEmpty(value)) return null;
      return value.toString().length < min
          ? m.resolve('minLength', {'value': min})
          : null;
    },
    ValidatorTypes.min: (value, def, context) {
      final min = def.params['value'] as num?;
      final n = _toNum(value);
      if (min == null || n == null) return null;
      return n < min ? m.resolve('min', {'value': min}) : null;
    },
    ValidatorTypes.max: (value, def, context) {
      final max = def.params['value'] as num?;
      final n = _toNum(value);
      if (max == null || n == null) return null;
      return n > max ? m.resolve('max', {'value': max}) : null;
    },
    ValidatorTypes.pattern: (value, def, context) {
      final source = def.params['pattern'] as String?;
      if (source == null || _isEmpty(value)) return null;
      return RegExp(source).hasMatch(value.toString())
          ? null
          : m.resolve('pattern');
    },
    ValidatorTypes.email: (value, def, context) {
      if (_isEmpty(value)) return null;
      final re = RegExp(r'^[\w.+-]+@[\w-]+\.[\w.-]+$');
      return re.hasMatch(value.toString()) ? null : m.resolve('email');
    },
    ValidatorTypes.postalCode: (value, def, context) {
      if (_isEmpty(value)) return null;
      return RegExp(r'^\d{3}-?\d{4}$').hasMatch(value.toString())
          ? null
          : m.resolve('postalCode');
    },
    ValidatorTypes.compare: (value, def, context) =>
        _compare(value, def, context, m),
  };
}

/// Comparisons `compare` can make (only the ones with an order).
const List<String> compareOperators = [
  'equals',
  'notEquals',
  'gt',
  'gte',
  'lt',
  'lte',
];

/// Cross-field validation (「終了日 は 開始日 以上」「合計 は 明細の和と同じ」).
///
/// Compared **as numbers when both read as numbers, as text otherwise**. An ISO
/// date (`2026-01-05`) is zero-padded, so text order is date order — which keeps
/// date parsing (and its per-language differences) out of the comparison. All
/// three editions must answer the same thing; that matters more than types.
///
/// Passes when it cannot judge (never fails silently in the other direction):
/// this field empty (`required`'s job), the other field empty or absent (that
/// field's own rules), or a missing `field` / unusable operator — a writing
/// mistake, which `hatake validate` reports as a warning.
String? _compare(
  Object? value,
  ValidatorDefinition def,
  ValidationContext context,
  MessageResolver messages,
) {
  final target = def.params['field'];
  final operator = def.params['operator'] is String
      ? def.params['operator'] as String
      : 'gte';
  if (target is! String || !compareOperators.contains(operator)) return null;
  if (_isEmpty(value)) return null;

  final other = _compareTo(context.record?[target], def);
  if (other == null || _isEmpty(other)) return null;

  final label = context.labels?[target] ?? target;
  final aggregate = def.params['aggregate'];
  return _holds(value, operator, other)
      ? null
      : messages.resolve('compare.$operator', {
          'target': aggregate is String ? '$label の $aggregate' : label,
        });
}

/// The value to compare against. With `aggregate`, the child rows folded into a
/// number (「合計＝明細の和」) — using the same fold the dashboard uses.
///
/// `where` narrows the rows before folding, exactly as `computed` does — the same rows
/// filtered by the same rule (a subtotal that skips cancelled rows would never match a
/// check that does not).
Object? _compareTo(Object? raw, ValidatorDefinition def) {
  final aggregate = def.params['aggregate'];
  if (aggregate is! String) return raw;
  final rows = <Map<String, Object?>>[
    if (raw is Iterable)
      for (final row in raw)
        if (row is Map) row.cast<String, Object?>(),
  ];
  final of = def.params['of'];
  return AggregateRegistry().aggregate(
    aggregate,
    rowsMatching(rows, def.params['where']),
    field: of is String ? of : null,
  );
}

/// The comparison itself.
bool _holds(Object? value, String operator, Object? other) {
  final left = _toNum(value);
  final right = _toNum(other);
  final Comparable<Object> a =
      left != null && right != null ? left : value.toString();
  final Comparable<Object> b =
      left != null && right != null ? right : other.toString();
  final order = a.compareTo(b);
  switch (operator) {
    case 'equals':
      return order == 0;
    case 'notEquals':
      return order != 0;
    case 'gt':
      return order > 0;
    case 'gte':
      return order >= 0;
    case 'lt':
      return order < 0;
    default:
      return order <= 0;
  }
}

/// Wraps a value-only validator so it can live in the same table as the ones
/// that read the record.
ContextValidatorFn _withoutContext(ValidatorFn fn) =>
    (value, definition, context) => fn(value, definition);

/// Resolves validator types to their implementations. Extensible: register
/// custom validators (plugins) without modifying the framework.
class ValidatorRegistry {
  final Map<String, ContextValidatorFn> _validators;

  /// [custom] adds/overrides validators; [messages] localizes built-in
  /// messages (default locale Japanese).
  ///
  /// [custom] takes the two-argument [ValidatorFn] (what apps and plugins
  /// already write); they are wrapped so everything runs through one signature.
  ValidatorRegistry([
    Map<String, ValidatorFn>? custom,
    MessageResolver? messages,
  ]) : _validators = {
          ...builtinValidators(messages),
          if (custom != null)
            for (final entry in custom.entries)
              entry.key: _withoutContext(entry.value),
        };

  /// Runs the validator for [definition]; returns null when valid, or when no
  /// validator is registered for the type (unknown types are ignored so that
  /// plugin types degrade gracefully).
  String? run(
    Object? value,
    ValidatorDefinition definition, [
    ValidationContext? context,
  ]) =>
      _validators[definition.type]
          ?.call(value, definition, context ?? const ValidationContext());

  /// Registers (or replaces) a validator implementation.
  void register(String type, ValidatorFn fn) =>
      _validators[type] = _withoutContext(fn);

  /// Registers a validator that also sees the rest of the record
  /// ([ValidationContext]) — cross-field rules of your own.
  void registerWithContext(String type, ContextValidatorFn fn) =>
      _validators[type] = fn;

  bool contains(String type) => _validators.containsKey(type);

  /// アプリが足した検証の名前だけ（組み込みは除く）。実行時に「何を登録したか」を
  /// 吐くために使う（`registrySnapshot`）。組み込みは突き合わせ側が知っているので、
  /// ここに混ぜると一覧が無駄に太り、組み込みが増えるたびに古くなる。
  List<String> get customKeys {
    final builtin = builtinValidators().keys.toSet();
    return [
      for (final key in _validators.keys)
        if (!builtin.contains(key)) key,
    ]..sort();
  }
}
