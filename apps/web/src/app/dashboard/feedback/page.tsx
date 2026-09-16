'use client';

import { useEffect, useRef, useState } from "react";
import { Button, Card, Descriptions, Drawer, Form, Image, Input, List, Modal, Select, Space, Table, Tabs, Tag, Typography, Upload, message } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import api, { attachmentApi, authApi, getErrorMessage } from "@/lib/api";

const { Title, Paragraph, Text } = Typography;
const statuses = [
  { value: "PENDING", label: "待处理", color: "default" }, { value: "PROCESSING", label: "处理中", color: "processing" },
  { value: "COMPLETED", label: "已完成", color: "success" }, { value: "DEFERRED", label: "暂缓", color: "warning" }, { value: "REJECTED", label: "不采纳", color: "error" },
];
const statusTag = (status: string) => { const item = statuses.find((x) => x.value === status) ?? { label: "待处理", color: "default" }; return <Tag color={item.color}>{item.label}</Tag>; };
const typeOptions = ["登录", "法旨中心", "审批流程", "仪表板", "公告", "用户管理", "系统设置", "其他"].map((value) => ({ value, label: value }));

function AttachmentImage({ id, fileName }: { id: number; fileName: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let objectUrl = "";
    attachmentApi.download(id).then((r) => { objectUrl = URL.createObjectURL(r.data); setUrl(objectUrl); }).catch(() => setUrl(""));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id]);
  return url ? <Image width={120} height={90} style={{ objectFit: "cover" }} src={url} alt={fileName} /> : <Text type="secondary">截图加载失败</Text>;
}

function LocalImage({ file }: { file: File }) {
  const [url, setUrl] = useState("");
  useEffect(() => { const objectUrl = URL.createObjectURL(file); setUrl(objectUrl); return () => URL.revokeObjectURL(objectUrl); }, [file]);
  return url ? <Image preview={false} height={70} style={{ objectFit: "cover" }} src={url} alt={file.name} /> : null;
}

export default function FeedbackPage() {
  const [role, setRole] = useState(""); const [active, setActive] = useState("submit"); const [form] = Form.useForm();
  const [files, setFiles] = useState<File[]>([]); const [items, setItems] = useState<any[]>([]); const [listLoading, setListLoading] = useState(false); const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState<any>(null); const [statusModal, setStatusModal] = useState<any>(null); const [statusForm] = Form.useForm();
  const skipNextListLoad = useRef(false);
  const admin = ["OWNER", "SUPER_ADMIN"].includes(role);

  const load = async (scope: "mine" | "all") => {
    setListLoading(true); try { const r = await api.get(scope === "mine" ? "/feedback/mine" : "/feedback"); const d = r.data.data || r.data; setItems(d.items || []); }
    catch (e) { message.error(getErrorMessage(e, "反馈列表加载失败")); } finally { setListLoading(false); }
  };
  useEffect(() => { authApi.getMe().then((r) => setRole((r.data.data || r.data).role)).catch(() => undefined); }, []);
  useEffect(() => {
    if (active !== "mine" && active !== "all") return;
    if (skipNextListLoad.current) { skipNextListLoad.current = false; return; }
    load(active);
  }, [active]);

  const submit = async (values: any) => {
    setSubmitting(true);
    try {
      const created = await api.post("/feedback", values); const feedback = created.data.data || created.data;
      try {
        for (const file of files) await attachmentApi.uploadFeedback(feedback.id, file);
      } catch (uploadError) {
        // The feedback is already durable. Show it explicitly instead of leaving the
        // user on the submit form with the impression that the whole submission vanished.
        form.resetFields(); setFiles([]); skipNextListLoad.current = true; setActive("mine"); await load("mine");
        message.error(`反馈已提交，但截图上传失败：${getErrorMessage(uploadError, "请在我的反馈中确认记录")}`);
        return;
      }
      form.resetFields(); setFiles([]); skipNextListLoad.current = true; setActive("mine"); await load("mine");
      message.success(files.length ? "反馈和截图已提交" : "反馈已提交");
    } catch (e) { message.error(getErrorMessage(e, "提交失败；如已创建反馈，请在我的反馈确认截图状态")); }
    finally { setSubmitting(false); }
  };
  const openDetail = async (id: number) => { try { const r = await api.get(`/feedback/${id}`); setDetail(r.data.data || r.data); } catch (e) { message.error(getErrorMessage(e, "反馈详情加载失败")); } };
  const submitStatus = async (values: any) => {
    try { await api.patch(`/feedback/${statusModal.id}/status`, values); message.success("状态已更新并写入历史"); setStatusModal(null); statusForm.resetFields(); await openDetail(detail.id); if (active !== "submit") load(active as "mine" | "all"); }
    catch (e) { message.error(getErrorMessage(e)); }
  };
  const columns = [
    { title: "类型", dataIndex: "module", width: 120 }, { title: "标题", dataIndex: "title", render: (v: string, r: any) => v || r.description.slice(0, 24) },
    { title: "简要内容", dataIndex: "description", ellipsis: true }, { title: "提交时间", dataIndex: "createdAt", width: 170, render: (v: string) => new Date(v).toLocaleString("zh-CN") },
    { title: "当前状态", dataIndex: "status", width: 100, render: statusTag },
    ...(active === "mine" ? [{ title: "最新处理说明", dataIndex: "latestHandlingNote", ellipsis: true, render: (v: string) => v || "-" }] : []),
  ];
  return <div>
    <Title level={4}>反馈中心</Title>
    <Tabs activeKey={active} onChange={setActive} items={[
      { key: "submit", label: "提交反馈", children: <Card><Form form={form} layout="vertical" onFinish={submit}>
        <Form.Item name="module" label="类型" rules={[{ required: true, message: "请选择反馈类型" }]}><Select options={typeOptions} /></Form.Item>
        <Form.Item name="title" label="标题" rules={[{ max: 100 }]}><Input placeholder="用一句话概括问题" /></Form.Item>
        <Form.Item name="description" label="内容" rules={[{ required: true, message: "请填写反馈内容" }]}><Input.TextArea rows={5} /></Form.Item>
        <Form.Item name="severity" label="优先级" initialValue="normal"><Select options={[{ value: "critical", label: "严重" }, { value: "major", label: "主要" }, { value: "normal", label: "一般" }, { value: "minor", label: "轻微" }, { value: "suggestion", label: "建议" }]} /></Form.Item>
        <Form.Item name="suggestion" label="改进建议"><Input.TextArea rows={2} /></Form.Item>
        <Form.Item label="截图（可选）" extra="仅图片；提交后会与本反馈记录永久绑定。"><Upload accept="image/*" multiple beforeUpload={(file) => { setFiles((current) => [...current, file]); return false; }} showUploadList={false}><Button icon={<PlusOutlined />}>选择图片</Button></Upload>
          <Space wrap style={{ marginTop: 12 }}>{files.map((file, index) => <Card size="small" key={`${file.name}-${index}`} cover={<LocalImage file={file} />} actions={[<DeleteOutlined key="delete" onClick={() => setFiles((current) => current.filter((_, i) => i !== index))} />]}><Text ellipsis style={{ maxWidth: 100, display: "block" }}>{file.name}</Text></Card>)}</Space>
        </Form.Item><Button type="primary" htmlType="submit" loading={submitting}>提交反馈</Button>
      </Form></Card> },
      { key: "mine", label: "我的反馈", children: <Card><Table rowKey="id" loading={listLoading} columns={columns} dataSource={items} onRow={(r) => ({ onClick: () => openDetail(r.id), style: { cursor: "pointer" } })} /></Card> },
      { key: "all", label: "全部反馈", children: <Card><Paragraph type="secondary">共享列表用于确认相同问题是否已被提交。</Paragraph><Table rowKey="id" loading={listLoading} columns={columns} dataSource={items} onRow={(r) => ({ onClick: () => openDetail(r.id), style: { cursor: "pointer" } })} /></Card> },
    ]} />
    <Drawer title="反馈详情" open={!!detail} onClose={() => setDetail(null)} width={680}>{detail && <>
      <Descriptions bordered column={1} size="small" items={[{ key: "type", label: "类型", children: detail.module }, { key: "title", label: "标题", children: detail.title || "-" }, { key: "status", label: "当前状态", children: statusTag(detail.status) }, { key: "note", label: "处理说明", children: detail.handlingNote || "-" }]} />
      <Title level={5} style={{ marginTop: 20 }}>反馈内容</Title><Paragraph style={{ whiteSpace: "pre-wrap" }}>{detail.description}</Paragraph>
      <Title level={5}>截图</Title><Space wrap>{detail.attachments?.length ? detail.attachments.map((a: any) => <AttachmentImage key={a.id} id={a.id} fileName={a.fileName} />) : <Text type="secondary">无截图</Text>}</Space>
      {admin && <Button style={{ marginTop: 20 }} type="primary" onClick={() => { setStatusModal(detail); statusForm.setFieldsValue({ status: detail.status, note: "" }); }}>修改状态</Button>}
      <Title level={5} style={{ marginTop: 20 }}>状态历史</Title><List size="small" bordered dataSource={detail.statusHistory || []} locale={{ emptyText: "暂无状态变更记录" }} renderItem={(h: any) => <List.Item>{statusTag(h.fromStatus)} → {statusTag(h.toStatus)}{" "}{h.operatorName || h.operator?.displayName || `用户 #${h.operatorId}`} {new Date(h.createdAt).toLocaleString("zh-CN")}{h.note ? `：${h.note}` : ""}</List.Item>} />
    </>}</Drawer>
    <Modal title="修改反馈状态" open={!!statusModal} onCancel={() => setStatusModal(null)} onOk={() => statusForm.submit()}><Form form={statusForm} layout="vertical" onFinish={submitStatus}><Form.Item name="status" label="状态" rules={[{ required: true }]}><Select options={statuses.map(({ value, label }) => ({ value, label }))} /></Form.Item><Form.Item noStyle shouldUpdate>{() => { const status = statusForm.getFieldValue("status"); const required = ["COMPLETED", "DEFERRED", "REJECTED"].includes(status); return <Form.Item name="note" label={status === "REJECTED" ? "不采纳原因" : "处理说明"} rules={[{ required, message: status === "REJECTED" ? "必须填写不采纳原因" : "必须填写处理说明" }]}><Input.TextArea rows={3} /></Form.Item>; }}</Form.Item></Form></Modal>
  </div>;
}
