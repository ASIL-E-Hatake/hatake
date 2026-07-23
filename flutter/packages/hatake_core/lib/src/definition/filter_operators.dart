/// Built-in search filter operators. Open strings — extensible via plugins.
abstract final class FilterOperators {
  const FilterOperators._();

  static const String equals = 'equals';
  static const String contains = 'contains';
  static const String startsWith = 'startsWith';
  static const String endsWith = 'endsWith';
  static const String greaterThan = 'gt';
  static const String greaterThanOrEqual = 'gte';
  static const String lessThan = 'lt';
  static const String lessThanOrEqual = 'lte';
  static const String between = 'between';
  static const String inList = 'in';
}
