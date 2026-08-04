'use client';

import { useEffect, useRef, useState } from "react";
import { Button, Col, Form, Input, InputNumber, Modal, Row, Select, Switch, Typography, message } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import api, { getErrorMessage, taskApi } from "@/lib/api";
import RoleGate from "@/components/RoleGate";
import { displayName, displayUserName } from "@/lib/display";
import { DetailSection, SecondaryPageHeader, SecondaryPageShell } from "@/components/secondary-page";
import styles from "./page.module.css";

const { Text } = Typography;

function buildImageTasks(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    imageTitle: `图片 ${index + 1}`,
    requirement: "",
  }));
}

function NewFazhiPageContent() {
  const router = useRouter();
  const [form] = Form.useForm();
  const imageCount = Form.useWatch("imageCount", form) || 1;
  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState<any[]>([]);
  const [requirementTypes, setRequirementTypes] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const createdTaskIdRef = useRef<number | null>(null);

  useEffect(() => {
    Promise.all([api.get("/stores"), api.get("/requirement-types"), api.get("/auth/me")])
      .then(([storesResponse, requirementTypesResponse, meResponse]) => {
        setStores(storesResponse.data.data || storesResponse.data || []);
        setRequirementTypes(requirementTypesResponse.data.data || requirementTypesResponse.data || []);
        const me = meResponse.data.data || meResponse.data;
        setCurrentUser(me);
        const defaultRequester = displayUserName(me);
        if (!form.getFieldValue("requesterName")) {
          form.setFieldValue("requesterName", defaultRequester);
        }
      })
      .catch((err) => {
        console.error("[fazhi-new] load options failed", err);
        message.error(getErrorMessage(err, "加载基础数据失败，请稍后重试"));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  const confirmLeave = () => {
    if (!dirty) {
      router.push("/dashboard/fazhi");
      return;
    }
    Modal.confirm({
      title: "当前有未保存内容",
      content: "当前有未保存内容，离开后将丢失，是否继续？",
      okText: "继续离开",
      cancelText: "留在本页",
      onOk: () => router.push("/dashboard/fazhi"),
    });
  };

  const onFinish = async (values: any) => {
    if (submitting) return;
    if (createdTaskIdRef.current) {
      router.replace("/dashboard/fazhi/" + createdTaskIdRef.current);
      return;
    }
    setSubmitting(true);
    try {
      const count = Math.max(1, Math.min(Number(values.imageCount || 1), 200));
      const imageTasks = buildImageTasks(count);

      const res = await taskApi.create({
        storeId: values.storeId,
        productCode: values.productCode,
        compatibleProduct: values.compatibleProduct,
        requesterName: displayName(values.requesterName, displayUserName(currentUser)),
        operatorOwner: displayUserName(currentUser),
        priority: values.urgent ? "URGENT" : "NORMAL",
        urgent: values.urgent,
        imageCount: count,
        imageSize: values.imageSize,
        usagePosition: values.usagePosition,
        requirementTypeId: values.requirementTypeId,
        imageTasks,
      });
      const task = res.data.data || res.data;
      createdTaskIdRef.current = task.id;
      form.resetFields();
      setDirty(false);
      message.success(`法旨草稿已创建：${task.serialNumber}`);
      router.replace("/dashboard/fazhi/" + task.id);
    } catch (err) {
      console.error("[fazhi-new] create failed", err);
      message.error(getErrorMessage(err, "创建失败，请稍后重试"));
    } finally {
      setSubmitting(false);
    }
  };

  const normalizedCount = Math.max(1, Math.min(Number(imageCount || 1), 200));

  return (
    <SecondaryPageShell>
      <SecondaryPageHeader
        title="新建法旨"
        subtitle="先建立主单草稿，再在详情页补充每张图片的具体需求和素材。"
        actions={[{
          key: "back",
          label: "返回我的法旨",
          icon: <ArrowLeftOutlined />,
          onClick: confirmLeave,
        }]}
      />
      <div className={styles.pageContent}>
        <Form
          className={styles.form}
          form={form}
          layout="vertical"
          disabled={loading}
          onFinish={onFinish}
          onValuesChange={() => setDirty(true)}
          initialValues={{
            imageCount: 3,
            urgent: false,
          }}
        >
          <DetailSection
            title="基础信息"
            description="填写主单信息后，系统会按需求张数创建对应的图片任务。"
          >
            <Row gutter={[20, 0]}>
              <Col xs={24} md={8}>
                <Form.Item name="storeId" label="店铺">
                  <Select allowClear placeholder="选择店铺" options={stores.map((store) => ({ value: store.id, label: store.name }))} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="productCode" label="产品编号">
                  <Input placeholder="例如 P-001" />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="compatibleProduct" label="兼容产品">
                  <Input placeholder="请输入兼容产品" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="requesterName" label="需求人">
                  <Input placeholder="默认当前登录人，如代提需求可修改" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="requirementTypeId" label="需求类型" rules={[{ required: true, message: "请选择需求类型" }]}>
                  <Select allowClear placeholder="选择需求类型" options={requirementTypes.map((item) => ({ value: item.id, label: item.name }))} />
                </Form.Item>
              </Col>
              <Col xs={24} md={5}>
                <Form.Item name="urgent" label="是否加急" valuePropName="checked">
                  <Switch checkedChildren="加急" unCheckedChildren="普通" />
                </Form.Item>
              </Col>
              <Col xs={24} md={7}>
                <Form.Item name="imageCount" label="需求张数 / 总交付张数" rules={[{ required: true, message: "请输入需求张数" }]}>
                  <InputNumber min={1} max={200} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={7}>
                <Form.Item name="imageSize" label="图片尺寸 / 输出规格说明">
                  <Input placeholder="如 1000x1000 / A+ 模块统一尺寸说明" />
                </Form.Item>
              </Col>
              <Col xs={24} md={5}>
                <Form.Item name="usagePosition" label="使用位置">
                  <Input placeholder="主图、详情页、A+、广告图等" />
                </Form.Item>
              </Col>
            </Row>
          </DetailSection>

          <section className={styles.taskNotice}>
            <div>
              <h2>图片任务说明</h2>
              <Text>系统将根据需求张数自动生成图片任务。</Text>
            </div>
            <div className={styles.taskNoticeMeta}>
              <strong>将生成 {normalizedCount} 个图片任务</strong>
              <Text type="secondary">创建草稿后，请在法旨详情页补充单张图片需求、原图或参考素材。</Text>
              <Text type="secondary">统一尺寸写在主单，单张特殊尺寸写在对应图片要求中。</Text>
            </div>
          </section>

          <div className={styles.formActions}>
            <Button onClick={confirmLeave}>取消</Button>
            <Button type="primary" htmlType="submit" loading={submitting} disabled={submitting || !!createdTaskIdRef.current} size="large">创建草稿并生成图片任务</Button>
          </div>
        </Form>
      </div>
    </SecondaryPageShell>
  );
}

export default function NewFazhiPage() {
  return <RoleGate allowedRoles={["OWNER", "SUPER_ADMIN", "OPERATION"]}><NewFazhiPageContent /></RoleGate>;
}
