/// Built-in dashboard item kinds. Open strings — extensible via plugins
/// (a renderer resolves an unknown kind through its item builders).
abstract final class DashboardItemTypes {
  const DashboardItemTypes._();

  /// A single aggregated number (KPI card). See `DashboardValueDefinition`.
  static const String metric = 'metric';

  /// A short list of rows. See `DashboardItemDefinition.columns`.
  static const String table = 'table';

  /// A chart. See `ChartDefinition`.
  static const String chart = 'chart';
}
