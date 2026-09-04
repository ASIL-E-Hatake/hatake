import '../definition/action_definition.dart';
import '../definition/action_scopes.dart';
import '../definition/field_definition.dart';
import '../definition/field_types.dart';
import '../definition/form_definition.dart';
import '../definition/page_definition.dart';
import '../definition/section_definition.dart';
import '../format/converter_registry.dart';
import '../format/form_normalizer.dart';
import '../logic/computed_registry.dart';
import '../logic/condition_evaluator.dart';
import '../repository/repository.dart';
import '../validation/form_validator.dart';
import '../validation/validation_result.dart';
import '../validation/validators.dart';
import 'page_kinds.dart';
import 'page_parts.dart';


/// レコードを持つ画面（そこに1件在るので、状態で出し分けられる）。
const _pageKindsWithRecord = [
  PageKinds.form,
  PageKinds.detail,
  PageKinds.wizard,
];

/// 確かめたいこと。**書いた欄だけ**見る（全部書かなくていい）。
class ScenarioExpectation {
  /// 出る検証エラー。書いたら**順不同で完全一致**（空リストは「エラー無し」）。
  final List<ValidationError>? errors;

  /// 計算項目の値。**書いたキーだけ**見る。
  final Map<String, Object?>? computed;

  /// 押せるかどうか。**書いたキーだけ**見る。
  final Map<String, bool>? enabled;

  /// 隠れている項目。書いたものが**隠れていること**を見る（含む）。
  final List<String>? hidden;

  /// いま必須の項目。書いたものが**必須であること**を見る（含む）。
  final List<String>? required;

  const ScenarioExpectation({
    this.errors,
    this.computed,
    this.enabled,
    this.hidden,
    this.required,
  });

  /// シナリオのファイル（JSON）から読む。
  factory ScenarioExpectation.fromMap(Map<String, Object?> map) =>
      ScenarioExpectation(
        errors: map['errors'] == null
            ? null
            : [
                for (final raw in map['errors']! as List)
                  ValidationError(
                    field: (raw as Map)['field'] as String,
                    message: raw['message'] as String,
                  ),
              ],
        computed: (map['computed'] as Map?)?.cast<String, Object?>(),
        enabled: (map['enabled'] as Map?)?.cast<String, bool>(),
        hidden: (map['hidden'] as List?)?.map((one) => '$one').toList(),
        required: (map['required'] as List?)?.map((one) => '$one').toList(),
      );
}

/// シナリオ1件（「この値を入れたら、こうなる」）。
class ScenarioCase {
  final String name;

  /// 画面に入っている値。明細は行の配列。
  final DataRecord record;

  /// `{ mode: create }` の判定用（省略＝どちらでもない）。
  final String? mode;

  final ScenarioExpectation? expect;

  const ScenarioCase({
    required this.name,
    required this.record,
    this.mode,
    this.expect,
  });

  factory ScenarioCase.fromMap(Map<String, Object?> map) => ScenarioCase(
        name: map['name'] as String,
        record: (map['record'] as Map? ?? const {}).cast<String, Object?>(),
        mode: map['mode'] as String?,
        expect: map['expect'] == null
            ? null
            : ScenarioExpectation.fromMap(
                (map['expect']! as Map).cast<String, Object?>(),
              ),
      );
}

/// 1件を動かした答え。
class ScenarioAnswer {
  /// 計算を当てたあとのレコード（画面が保存に渡す形）。
  final DataRecord record;
  final Map<String, Object?> computed;
  final List<ValidationError> errors;
  final Map<String, bool> enabled;
  final List<String> hidden;
  final List<String> required;

  /// **この登録では答えられないこと**（登録が無い計算・検証など）。
  final List<String> cannot;

  const ScenarioAnswer({
    required this.record,
    required this.computed,
    required this.errors,
    required this.enabled,
    required this.hidden,
    required this.required,
    required this.cannot,
  });
}

/// 期待と答えの食い違い1つ。
class ScenarioMismatch {
  /// どの欄か（`computed.subtotal` / `errors` / `enabled.reject` …）。
  final String at;
  final Object? expected;
  final Object? actual;

  const ScenarioMismatch(this.at, this.expected, this.actual);

  @override
  String toString() => '$at: 期待 $expected / 実際 $actual';
}

/// 1件の結果（[mismatches] が空なら通った）。
class ScenarioResult {
  final String name;
  final ScenarioAnswer answer;
  final List<ScenarioMismatch> mismatches;

  const ScenarioResult(this.name, this.answer, this.mismatches);

  bool get passed => mismatches.isEmpty;
}

/// 定義を**動かして**答えを見る（シナリオ）。アプリが登録したものをそのまま渡せる。
///
/// `hatake run` と同じもの。CLI は Node で動くので**組み込みの計算・検証しか持てない**
/// が、こちらは**アプリの登録をそのまま渡せる**＝プラグインの計算・検証も含めて、
/// 同じシナリオを画面の試験で回せる。
///
/// 答えの作り方は画面と同じ順（ここがズレると、道具の答えが嘘になる）:
///
///   1. `normalize` を当てる（保存前に整える）
///   2. `computed` を**宣言順に1回**当てる（明細の行の中が先、次に親の項目）
///   3. 状態を見る（隠れている項目・いま必須の項目・押せるボタン）
///   4. 検証する（隠れている項目は検証しない＝画面と同じ規則）
///
/// TypeScript 版と同じ答えになることは
/// [`spec/conformance/scenario.json`](../../../../../spec/conformance/scenario.json)
/// で固定している。
class ScenarioRunner {
  final ValidatorRegistry validators;
  final ComputedRegistry computeds;
  final ConverterRegistry converters;

  ScenarioRunner({
    ValidatorRegistry? validators,
    ComputedRegistry? computeds,
    ConverterRegistry? converters,
  })  : validators = validators ?? ValidatorRegistry(),
        computeds = computeds ?? ComputedRegistry(),
        converters = converters ?? ConverterRegistry();

  /// その画面のフォーム（`wizard` は**保存が満たすべき1枚**に畳む）。
  FormDefinition? formOf(PageDefinition page) {
    final steps = page.steps;
    if (steps.isNotEmpty) {
      return FormDefinition(
        sections: [
          for (final step in steps)
            SectionDefinition(title: step.title, fields: step.fields),
        ],
      );
    }
    return page.formArea;
  }

  /// 1件を動かして答えを作る。
  ScenarioAnswer runCase(PageDefinition page, ScenarioCase one) {
    final cannot = <String>[];
    final form = formOf(page);
    if (form == null) {
      return ScenarioAnswer(
        record: {...one.record},
        computed: const {},
        errors: const [],
        enabled: _enabled(page, one.record, one.mode, cannot),
        hidden: const [],
        required: const [],
        cannot: [
          '${pageKindOf(page)} の画面には入力の枠（form）がないので、'
              '入れる値がありません。',
          ...cannot,
        ],
      );
    }

    final normalized =
        FormNormalizer(converters).normalize(form, one.record);
    final computedPass = _applyComputed(form, normalized, cannot);
    final record = computedPass.record;
    final hidden = _hidden(form, record, one.mode);
    final required = _required(form, record, one.mode, hidden);
    final enabled = _enabled(page, record, one.mode, cannot);

    for (final field in form.fields) {
      for (final rule in field.validators) {
        if (validators.contains(rule.type)) continue;
        cannot.add(
          '「${field.label}」の検証（type: ${rule.type}）は登録がありません。'
          'その規則は回していません。',
        );
      }
    }

    final errors =
        FormValidator(validators).validate(form, record, mode: one.mode).errors;
    return ScenarioAnswer(
      record: record,
      computed: computedPass.computed,
      errors: errors,
      enabled: enabled,
      hidden: hidden.toList(),
      required: required,
      cannot: cannot,
    );
  }

  /// シナリオを全件動かす。
  List<ScenarioResult> run(PageDefinition page, List<ScenarioCase> cases) => [
        for (final one in cases)
          () {
            final answer = runCase(page, one);
            return ScenarioResult(
                one.name, answer, compareAnswer(one.expect, answer));
          }(),
      ];

  /// 計算を**宣言順に1回**当てた写し。明細の行の中を先に当てる（親が行を畳むので）。
  ///
  /// 登録が無い `op` は**当てない**＝値を作らない（作ると「計算した結果が空」と
  /// 読めてしまう）。
  _ComputedPass _applyComputed(
    FormDefinition form,
    DataRecord record,
    List<String> cannot,
  ) {
    final out = {...record};
    final computed = <String, Object?>{};

    bool known(FieldDefinition field) {
      final op = field.computed?['op'];
      if (op is! String) return false;
      if (computeds.has(op)) return true;
      cannot.add(
        '「${field.label}」の計算（op: $op）は登録がありません。値は出しません。',
      );
      return false;
    }

    for (final field in form.fields) {
      if (field.type != FieldTypes.subTable || field.source != null) continue;
      final rows = out[field.field];
      if (rows is! List) continue;
      out[field.field] = [
        for (final raw in rows)
          if (raw is Map)
            () {
              final row = raw.cast<String, Object?>();
              final next = {...row};
              for (final rowField in field.rowFields) {
                if (rowField.computed == null || !known(rowField)) continue;
                next[rowField.field] =
                    computeds.compute(rowField.computed, next);
              }
              return next;
            }()
          else
            raw,
      ];
    }

    for (final field in form.fields) {
      if (field.computed == null) continue;
      if (field.type == FieldTypes.subTable && field.source != null) {
        cannot.add(
          '「${field.label}」は別のテーブルに持つ明細（source つき）なので、'
          '行はここにありません（畳めません）。',
        );
        continue;
      }
      if (!known(field)) continue;
      final value = computeds.compute(field.computed, out);
      out[field.field] = value;
      computed[field.field] = value;
    }
    return _ComputedPass(out, computed);
  }

  /// 隠れている項目（項目の `visibleWhen`／その枠の `visibleWhen`）。
  Set<String> _hidden(FormDefinition form, DataRecord record, String? mode) {
    final hidden = <String>{};
    for (final section in form.sections) {
      final sectionShown = section.visibleWhen == null ||
          evaluateCondition(section.visibleWhen, record, mode: mode);
      for (final field in section.fields) {
        final shown = field.visibleWhen == null ||
            evaluateCondition(field.visibleWhen, record, mode: mode);
        if (!sectionShown || !shown) hidden.add(field.field);
      }
    }
    return hidden;
  }

  /// いま必須の項目（**隠れている項目は数えない**＝検証と同じ規則）。
  List<String> _required(
    FormDefinition form,
    DataRecord record,
    String? mode,
    Set<String> hidden,
  ) =>
      [
        for (final field in form.fields)
          if (!hidden.contains(field.field) &&
              (field.required ||
                  (field.requiredWhen != null &&
                      evaluateCondition(field.requiredWhen, record,
                          mode: mode))))
            field.field,
      ];

  /// 押せるボタン（`enabledWhen`）。判定できるのは**レコードを持つ画面**だけ。
  Map<String, bool> _enabled(
    PageDefinition page,
    DataRecord record,
    String? mode,
    List<String> cannot,
  ) {
    final enabled = <String, bool>{};
    final hasRecord = _pageKindsWithRecord.contains(pageKindOf(page));
    for (final ActionDefinition action in page.pageActions) {
      final condition = action.enabledWhen;
      if (condition == null || condition.isEmpty) {
        enabled[action.id] = true;
        continue;
      }
      if (action.scope == ActionScopes.selection) {
        cannot.add(
          '「${action.label}」は選んだ行で判定するボタンなので、押せるかどうかは'
          'シナリオでは決まりません（行の選択は画面の状態です）。',
        );
        continue;
      }
      if (!hasRecord) {
        cannot.add(
          '「${action.label}」の enabledWhen は判定する相手がありません'
          '（${pageKindOf(page)} の画面には開いているレコードがない）。',
        );
        continue;
      }
      enabled[action.id] = evaluateCondition(condition, record, mode: mode);
    }
    return enabled;
  }
}

class _ComputedPass {
  final DataRecord record;
  final Map<String, Object?> computed;

  const _ComputedPass(this.record, this.computed);
}

/// 期待と答えを比べる。**書いた欄だけ**見る。
///
/// 欄ごとに見方が違うのは、欄の形が違うから:
///
/// * `errors` … 順不同で**完全一致**（「これだけ出る」が意味を持つ）
/// * `computed` / `enabled` … 書いた**キーだけ**
/// * `hidden` / `required` … 書いたものが**入っていること**（含む）
List<ScenarioMismatch> compareAnswer(
  ScenarioExpectation? expect,
  ScenarioAnswer answer,
) {
  final found = <ScenarioMismatch>[];
  if (expect == null) return found;

  final wantedErrors = expect.errors;
  if (wantedErrors != null) {
    String key(ValidationError e) => '${e.field}=${e.message}';
    final wanted = wantedErrors.map(key).toList()..sort();
    final actual = answer.errors.map(key).toList()..sort();
    if (wanted.join(' ') != actual.join(' ')) {
      found.add(ScenarioMismatch(
        'errors',
        wantedErrors.map(key).toList(),
        answer.errors.map(key).toList(),
      ));
    }
  }
  expect.computed?.forEach((name, value) {
    if (!_same(value, answer.computed[name])) {
      found.add(ScenarioMismatch(
          'computed.$name', value, answer.computed[name]));
    }
  });
  expect.enabled?.forEach((name, value) {
    if (answer.enabled[name] != value) {
      found.add(ScenarioMismatch('enabled.$name', value, answer.enabled[name]));
    }
  });
  for (final name in expect.hidden ?? const <String>[]) {
    if (!answer.hidden.contains(name)) {
      found.add(ScenarioMismatch('hidden.$name', true, false));
    }
  }
  for (final name in expect.required ?? const <String>[]) {
    if (!answer.required.contains(name)) {
      found.add(ScenarioMismatch('required.$name', true, false));
    }
  }
  return found;
}

/// 同じ値か（入れ子も見る）。数は int / double の違いを見ない
/// （JSON から読んだ 1700 と計算した 1700.0 を別物にしない）。
bool _same(Object? a, Object? b) {
  if (a is num && b is num) return a == b;
  if (a is List && b is List) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (!_same(a[i], b[i])) return false;
    }
    return true;
  }
  if (a is Map && b is Map) {
    final keys = {...a.keys, ...b.keys};
    for (final key in keys) {
      if (!_same(a[key], b[key])) return false;
    }
    return true;
  }
  return a == b;
}
