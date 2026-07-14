'use client';

import { useEffect, useState } from "react";
import { Card, Empty, Table, Tag, Typography } from "antd";
import api from "@/lib/api";
import RoleGate from "@/components/RoleGate";

const { Title } = Typography;

const actionLabels: Record<string, string> = {
  create_task: "创建法旨",
  edit_task: "编辑法旨",
  delete_task: "删除法旨",
  submit_ops_approval: "提交运营审批",
  withdraw_ops_approval: "撤回审批",
  ops_approve_task: "运营主管通过",
  ops_reject_task: "运营主管退回",
  create_image_task: "新增图片任务",
  edit_image_task: "编辑图片任务",
  delete_image_task: "删除图片任务",
  assign_designer: "分配设计师",
  batch_assign_designer: "批量分配设计师",
  batch_update_priority: "批量设置优先级",
  upload_task_attachment: "上传主单附件",
  upload_image_original_attachment: "上传原图附件",
  upload_image_reference_attachment: "上传参考附件",
  upload_completed_attachment: "上传完成稿",
  update_link: "更新链接",
  update_design_note: "更新设计备注",
  submit_design_review: "提交设计审核",
  resubmit_design_review: "重新提交设计审核",
  design_review_approve: "设计审核通过",
  design_review_reject: "设计退回修改",
  update_image_task_status: "图片任务状态变化",
  update_task_status: "法旨状态变化",
  login: "登录",
};

function parseMeta(value?: string) {
  try { return value ? JSON.parse(value) : {}; } catch { return {}; }
}

function LogsPageContent() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>({ items: [], total: 0 });

  useEffect(() => {
    api.get("/operation-logs", { params: { pageSize: 50 } })
      .then((res) => setData(res.data.data || res.data))
      .finally(() => setLoading(false));
  }, []);

  const columns = [
    { title: "操作人", dataIndex: "operatorId", width: 100, render: (v: number) => v ? `用户 #${v}` : "系统" },
    { title: "操作时间", dataIndex: "createdAt", width: 180, render: (v: string) => new Date(v).toLocaleString("zh-CN") },
    { title: "类型", dataIndex: "action", width: 170, render: (v: string) => <Tag>{actionLabels[v] || v}</Tag> },
    { title: "对象", dataIndex: "resourceType", width: 130, render: (v: string, r: any) => `${v || "-"} #${r.resourceId ?? "-"}` },
    { title: "摘要", dataIndex: "metadata", render: (v: string) => parseMeta(v).content || parseMeta(v).name || "-" },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>操作日志</Title>
      <Card>
        {data.items?.length ? (
          <Table rowKey="id" loading={loading} dataSource={data.items} columns={columns} pagination={{ pageSize: 20 }} />
        ) : (
          <Empty description="暂无操作记录，完成法旨创建、审批或分配后会显示日志" />
        )}
      </Card>
    </div>
  );
}

export default function LogsPage() {
  return <RoleGate allowedRoles={["OWNER", "SUPER_ADMIN"]}><LogsPageContent /></RoleGate>;
}
