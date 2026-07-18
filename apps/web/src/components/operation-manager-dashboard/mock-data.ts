import type { TrendChartData } from '@/components/dashboard-workbench/TrendChart';

export const OPERATION_MANAGER_TREND: TrendChartData = {
  days: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
  previous: [18, 14, 21, 17, 25, 9, 11],
  current: [22, 19, 25, 28, 31, 12, 15],
};

export const OPERATION_MANAGER_DASHBOARD_META = {
  weekLabel: '07月14日—07月20日',
  dateLabel: '2026年07月18日 周六',
  sourceLabel: '预览模式 / Mock 数据未写入系统',
} as const;

export const OPERATION_QUALITY = [
  { id: 1, name: '林妍', submitted: 18, firstPass: 14, returned: 2, pending: 2 },
  { id: 2, name: '周宁', submitted: 16, firstPass: 11, returned: 3, pending: 2 },
  { id: 3, name: '徐佳', submitted: 14, firstPass: 10, returned: 1, pending: 3 },
  { id: 4, name: '陈璐', submitted: 12, firstPass: 9, returned: 2, pending: 1 },
];

export type PendingDecree = {
  id: number;
  serialNumber: string;
  store: string;
  requester: string;
  productCode: string;
  imageCount: number;
  submittedAt: string;
  detail: string;
};

export const INITIAL_PENDING_DECREES: PendingDecree[] = [
  { id: 101, serialNumber: '天字第000130号', store: '亚马逊美国站', requester: '林妍', productCode: 'CP-8001', imageCount: 6, submittedAt: '07-18 10:20', detail: '主图与场景图共 6 张，资料齐全。' },
  { id: 102, serialNumber: '天字第000128号', store: '清透美妆', requester: '周宁', productCode: 'CP-3321', imageCount: 5, submittedAt: '07-18 09:42', detail: 'A+ 页面图片 5 张，等待审批放行。' },
  { id: 103, serialNumber: '天字第000126号', store: '北欧风沙发', requester: '徐佳', productCode: 'CP-7712', imageCount: 4, submittedAt: '07-17 16:08', detail: '产品详情图 4 张，已补齐原图链接。' },
  { id: 104, serialNumber: '天字第000121号', store: '宠物精选', requester: '陈璐', productCode: 'CP-4410', imageCount: 7, submittedAt: '07-17 14:31', detail: '活动素材 7 张，含尺寸说明。' },
  { id: 105, serialNumber: '天字第000117号', store: '亚马逊德国站', requester: '林妍', productCode: 'CP-6150', imageCount: 3, submittedAt: '07-17 11:18', detail: '季节促销图 3 张，待审批。' },
];

export const EXCEPTION_TASKS = [
  { id: 201, serialNumber: '天字第000125号', summary: '缺少原图授权说明', requester: '周宁', status: '退回 1 次' },
  { id: 202, serialNumber: '天字第000118号', summary: '图片尺寸与投放位不一致', requester: '徐佳', status: '等待 27 小时' },
  { id: 203, serialNumber: '天字第000115号', summary: '参考图链接失效', requester: '陈璐', status: '退回 2 次' },
  { id: 204, serialNumber: '天字第000109号', summary: '需求说明不完整', requester: '林妍', status: '等待 31 小时' },
  { id: 205, serialNumber: '天字第000104号', summary: 'SKU 与兼容产品冲突', requester: '周宁', status: '退回 1 次' },
];
