export const DESIGN_MANAGER_TREND_FALLBACK = {
  source: "PENDING_REAL_API" as const,
  days: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
  previous: [14, 10, 17, 15, 18, 9, 13],
  current: [18, 16, 19, 22, 25, 14, 17],
};

/**
 * 当前 overview 接口尚未提供按日审核通过趋势。
 * 该兜底数据只供正式页面保持已确认图表结构，后续由单一聚合接口替换。
 */
export const DESIGN_MANAGER_PENDING_DATA = ["审核通过趋势"] as const;
