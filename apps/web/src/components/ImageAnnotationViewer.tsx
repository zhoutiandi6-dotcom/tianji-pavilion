'use client';

import { useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { Alert, Button, Empty, Select, Space, Tag, Typography } from "antd";
import { DeleteOutlined, EyeInvisibleOutlined, EyeOutlined, SaveOutlined } from "@ant-design/icons";

const { Text } = Typography;

export type AnnotationMode = "edit" | "view" | "review";
export type AnnotationType = "point" | "rectangle";

export type ImageAnnotation = {
  id: number;
  type: AnnotationType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  color: AnnotationColor;
  text: string;
};

export type AnnotationColor = "red" | "orange" | "yellow" | "green" | "blue" | "purple";

type Props = {
  mode: AnnotationMode;
  imageUrl?: string;
  imageTitle?: string;
  annotations?: ImageAnnotation[];
  onChange?: (annotations: ImageAnnotation[]) => void;
  onSave?: (annotations: ImageAnnotation[]) => void;
};

const COLOR_OPTIONS: Array<{ value: AnnotationColor; label: string; color: string; usage: string }> = [
  { value: "red", label: "红色", color: "#ef4444", usage: "修改重点" },
  { value: "orange", label: "橙色", color: "#f97316", usage: "补充强调" },
  { value: "yellow", label: "黄色", color: "#eab308", usage: "注意事项" },
  { value: "green", label: "绿色", color: "#22c55e", usage: "保持区域" },
  { value: "blue", label: "蓝色", color: "#2563eb", usage: "参考区域" },
  { value: "purple", label: "紫色", color: "#9333ea", usage: "特殊说明" },
];

function colorHex(color: AnnotationColor) {
  return COLOR_OPTIONS.find((item) => item.value === color)?.color || "#ef4444";
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

export default function ImageAnnotationViewer({ mode, imageUrl, imageTitle, annotations = [], onChange, onSave }: Props) {
  const [items, setItems] = useState<ImageAnnotation[]>(annotations);
  const [visible, setVisible] = useState(true);
  const [tool, setTool] = useState<AnnotationType>("point");
  const [color, setColor] = useState<AnnotationColor>("red");
  const [draftRect, setDraftRect] = useState<ImageAnnotation | null>(null);
  const [rectStart, setRectStart] = useState<{ x: number; y: number } | null>(null);
  const editable = mode === "edit";
  const modeLabel = mode === "edit" ? "运营编辑" : mode === "review" ? "主管审核查看" : "设计师查看";

  useEffect(() => setItems(annotations), [annotations]);

  const colorOptions = useMemo(() => COLOR_OPTIONS.map((item) => ({
    value: item.value,
    label: `${item.label} - ${item.usage}`,
  })), []);

  const commitItems = (next: ImageAnnotation[]) => {
    setItems(next);
    onChange?.(next);
  };

  const pointFromEvent = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * 100),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100),
    };
  };

  const addPoint = (event: MouseEvent<HTMLDivElement>) => {
    if (!editable || tool !== "point") return;
    const text = window.prompt("请输入标注说明");
    if (!text?.trim()) return;
    const point = pointFromEvent(event);
    commitItems([...items, { id: items.length + 1, type: "point", color, text: text.trim(), ...point }]);
  };

  const beginRect = (event: MouseEvent<HTMLDivElement>) => {
    if (!editable || tool !== "rectangle") return;
    const point = pointFromEvent(event);
    setRectStart(point);
    setDraftRect({ id: items.length + 1, type: "rectangle", color, text: "", x: point.x, y: point.y, width: 0, height: 0 });
  };

  const updateRect = (event: MouseEvent<HTMLDivElement>) => {
    if (!draftRect || !rectStart) return;
    const point = pointFromEvent(event);
    setDraftRect({
      ...draftRect,
      x: Math.min(rectStart.x, point.x),
      y: Math.min(rectStart.y, point.y),
      width: Math.abs(point.x - rectStart.x),
      height: Math.abs(point.y - rectStart.y),
    });
  };

  const finishRect = () => {
    if (!draftRect) return;
    if ((draftRect.width || 0) < 2 || (draftRect.height || 0) < 2) {
      setDraftRect(null);
      setRectStart(null);
      return;
    }
    const text = window.prompt("请输入框选说明");
    if (text?.trim()) commitItems([...items, { ...draftRect, text: text.trim() }]);
    setDraftRect(null);
    setRectStart(null);
  };

  const removeItem = (id: number) => {
    const next = items.filter((item) => item.id !== id).map((item, index) => ({ ...item, id: index + 1 }));
    commitItems(next);
  };

  return (
    <div>
      <Space wrap style={{ marginBottom: 12 }}>
        <Tag color={editable ? "blue" : "default"}>{modeLabel}</Tag>
        <Button size="small" icon={visible ? <EyeOutlined /> : <EyeInvisibleOutlined />} onClick={() => setVisible((prev) => !prev)}>
          {visible ? "隐藏标注层" : "显示标注层"}
        </Button>
        {editable && (
          <>
            <Select size="small" value={tool} style={{ width: 116 }} onChange={setTool} options={[{ value: "point", label: "点标注" }, { value: "rectangle", label: "框选区域" }]} />
            <Select size="small" value={color} style={{ width: 170 }} onChange={setColor} options={colorOptions} />
            <Button size="small" icon={<SaveOutlined />} onClick={() => onSave?.(items)}>保存标注</Button>
          </>
        )}
      </Space>

      {!imageUrl ? (
        <Empty description="暂无可标注参考图，请先上传原图或参考图" />
      ) : (
        <div
          style={{
            width: "100%",
            overflow: "visible",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            background: "#f8fafc",
            padding: 12,
          }}
        >
          <div
            style={{
              position: "relative",
              width: "100%",
              lineHeight: 0,
              cursor: editable ? (tool === "rectangle" ? "crosshair" : "copy") : "default",
            }}
          onClick={addPoint}
          onMouseDown={beginRect}
          onMouseMove={updateRect}
          onMouseUp={finishRect}
        >
            <img src={imageUrl} alt={imageTitle || "reference"} style={{ display: "block", width: "100%", height: "auto", userSelect: "none" }} draggable={false} />
            {visible && [...items, ...(draftRect ? [draftRect] : [])].map((item) => {
              const color = colorHex(item.color);
              if (item.type === "point") {
                return (
                  <div key={`${item.id}-${item.type}`} style={{ position: "absolute", left: `${item.x}%`, top: `${item.y}%`, transform: "translate(-50%, -50%)" }}>
                    <div style={{ width: 28, height: 28, borderRadius: 14, background: color, color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, boxShadow: "0 4px 12px rgba(15,23,42,.2)", lineHeight: "28px" }}>{item.id}</div>
                  </div>
                );
              }
              return (
                <div
                  key={`${item.id}-${item.type}`}
                  style={{
                    position: "absolute",
                    left: `${item.x}%`,
                    top: `${item.y}%`,
                    width: `${item.width || 0}%`,
                    height: `${item.height || 0}%`,
                    border: `2px solid ${color}`,
                    background: `${color}22`,
                    borderRadius: 4,
                  }}
                >
                  <span style={{ position: "absolute", left: -1, top: -30, width: 28, height: 28, borderRadius: 14, background: color, color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, lineHeight: "28px" }}>{item.id}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <Text strong>图片标注说明</Text>
        {!items.length ? (
          <Alert style={{ marginTop: 8 }} type="info" showIcon message="当前标注为预览能力，刷新后可能丢失。" />
        ) : (
          <Space direction="vertical" style={{ width: "100%", marginTop: 8 }}>
            {items.map((item) => (
              <Space key={item.id} align="start" style={{ width: "100%", justifyContent: "space-between" }}>
                <Space align="start">
                  <Tag color={item.color}>{item.id}</Tag>
                  <Text>{item.text || "未填写说明"}</Text>
                </Space>
                {editable && <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeItem(item.id)}>删除</Button>}
              </Space>
            ))}
          </Space>
        )}
      </div>
    </div>
  );
}
