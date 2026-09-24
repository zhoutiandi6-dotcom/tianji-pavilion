'use client';

import { Breadcrumb } from "antd";
import { usePathname, useSearchParams } from "next/navigation";
import { HomeOutlined } from "@ant-design/icons";
import { defaultTaskListPathForRole } from "@/lib/dashboard-navigation";

const pathMap: Record<string, string> = {
  "fazhi": "法旨中心",
  "image-tasks": "图片任务",
  "new": "新建法旨",
  "stores": "店铺管理",
  "requirement-types": "需求类型",
  "users": "用户管理",
  "notifications": "通知中心",
  "settings": "系统设置",
  "logs": "操作日志",
  "feedback": "反馈管理",
};

export default function BreadcrumbNav({ role }: { role?: string }) {
  const path = usePathname();
  const searchParams = useSearchParams();
  const segments = path.split("/").filter(Boolean);

  const items = [
    { title: <><HomeOutlined /> 首页</>, href: "/dashboard" },
    ...segments.slice(1).map((segment, index) => {
      const scope = path === "/dashboard/fazhi" ? searchParams.get("scope") : null;
      const scopeLabel = scope === "design-assignment" ? "待分配" : scope === "design-reviews" ? "待审核" : scope === "design-tasks" ? "设计任务" : scope === "ops-approvals" ? "待我审批" : null;
      const label = scopeLabel || (role === "OPERATION" && segment === "fazhi" ? "我的法旨" : pathMap[segment] || segment);
      // There is no /dashboard/image-tasks index route. Its breadcrumb must
      // lead to the existing role-scoped Fazhi list instead of a 404.
      const href = segment === "image-tasks"
        ? defaultTaskListPathForRole(role)
        : "/" + segments.slice(0, index + 2).join("/");
      if (index === segments.slice(1).length - 1) return { title: label };
      return { title: label, href };
    }),
  ];

  return <Breadcrumb items={items} style={{ marginBottom: 12 }} />;
}
