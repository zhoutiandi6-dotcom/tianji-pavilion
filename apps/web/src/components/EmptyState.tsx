'use client';

import { Empty, Button } from "antd";
import { useRouter } from "next/navigation";

interface Props {
  description?: string;
  actionText?: string;
  actionPath?: string;
}

export default function EmptyState({ description = "\u6682\u65e0\u6570\u636e", actionText, actionPath }: Props) {
  const router = useRouter();
  return (
    <div style={{ padding: 60, textAlign: "center" }}>
      <Empty description={description} />
      {actionText && actionPath && (
        <Button type="primary" style={{ marginTop: 16 }} onClick={() => router.push(actionPath)}>
          {actionText}
        </Button>
      )}
    </div>
  );
}
