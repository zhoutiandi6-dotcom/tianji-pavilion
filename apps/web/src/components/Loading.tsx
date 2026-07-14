'use client';

import { Skeleton } from "antd";

export default function Loading({ text = "\u5929\u673a\u6d41\u8f6c\uff0c\u4e07\u6cd5\u5f52\u4e00\u3002\u6b63\u5728\u63a8\u6f14\u672c\u6b21\u6cd5\u65e8\u2026\u2026" }: { text?: string }) {
  return (
    <div style={{ textAlign: "center", padding: 120 }}>
      <Skeleton active paragraph={{ rows: 4 }} />
      <p style={{ marginTop: 24, color: "#999", fontSize: 16 }}>{text}</p>
    </div>
  );
}
