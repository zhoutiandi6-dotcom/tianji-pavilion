'use client';

import { useRouter } from "next/navigation";
import { MessageOutlined } from "@ant-design/icons";

/** Entry point only: the persistent, attachment-capable form lives in Feedback Center. */
export default function FeedbackWidget() {
  const router = useRouter();
  return <div onClick={() => router.push("/dashboard/feedback")}
    style={{ position: "fixed", bottom: 24, right: 24, zIndex: 1000, width: 48, height: 48, borderRadius: "50%", background: "#1677ff", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 4px 12px rgba(22,119,255,0.4)", fontSize: 20 }}
    title="反馈中心"><MessageOutlined /></div>;
}
