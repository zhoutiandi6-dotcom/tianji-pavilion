'use client';

import { Breadcrumb } from "antd";
import { usePathname } from "next/navigation";
import { HomeOutlined } from "@ant-design/icons";

const pathMap: Record<string, string> = {
  "fazhi": "\u6cd5\u65e8\u4e2d\u5fc3",
  "new": "\u65b0\u5efa\u6cd5\u65e8",
  "stores": "\u5e97\u94fa\u7ba1\u7406",
  "requirement-types": "\u9700\u6c42\u7c7b\u578b",
  "users": "\u7528\u6237\u7ba1\u7406",
  "notifications": "\u901a\u77e5\u4e2d\u5fc3",
  "settings": "\u7cfb\u7edf\u8bbe\u7f6e",
  "logs": "操作日志",
  "feedback": "反馈管理",
};

export default function BreadcrumbNav() {
  const path = usePathname();
  const segments = path.split("/").filter(Boolean);

  const items = [
    { title: <><HomeOutlined /> \u9996\u9875</>, href: "/dashboard" },
    ...segments.slice(1).map((s, i) => {
      const label = pathMap[s] || s;
      const href = "/" + segments.slice(0, i + 2).join("/");
      if (i === segments.slice(1).length - 1) return { title: label };
      return { title: label, href };
    }),
  ];

  return <Breadcrumb items={items} style={{ marginBottom: 12 }} />;
}
