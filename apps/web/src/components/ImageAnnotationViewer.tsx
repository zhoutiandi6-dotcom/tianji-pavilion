'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { Alert, Button, Empty, Input, Select, Space, Tag, Typography } from "antd";
import { DeleteOutlined, EyeInvisibleOutlined, EyeOutlined, SaveOutlined } from "@ant-design/icons";

const { Text } = Typography;

export type AnnotationMode = "edit" | "view" | "review";
export type AnnotationType = "point" | "rectangle";

export type ImageAnnotation = {
  id: string;
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
  onSave?: (annotations: ImageAnnotation[]) => boolean | Promise<boolean>;
  saving?: boolean;
  disabledReason?: string;
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

const EMPTY_ANNOTATIONS: ImageAnnotation[] = [];
function newAnnotationId() {
  return Array.from(window.crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
}

export default function ImageAnnotationViewer({ mode, imageUrl, imageTitle, annotations = EMPTY_ANNOTATIONS, onChange, onSave, saving = false, disabledReason }: Props) {
  const [items, setItems] = useState<ImageAnnotation[]>(annotations);
  const [visible, setVisible] = useState(true);
  const [tool, setTool] = useState<AnnotationType>("point");
  const [color, setColor] = useState<AnnotationColor>("red");
  const [draftRect, setDraftRect] = useState<ImageAnnotation | null>(null);
  const [rectStart, setRectStart] = useState<{ x: number; y: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string>();
  const saveInFlight = useRef(false);
  const imageGeneration = useRef(0);
  const imageElementRef = useRef<HTMLImageElement>(null);
  const [loadedImageUrl, setLoadedImageUrl] = useState<string>();
  const imageLoaded = !!imageUrl && loadedImageUrl === imageUrl;
  useEffect(() => {
    imageGeneration.current++;
    setDraftRect(null);
    setRectStart(null);
    setEditingId(null);
    setSaveError(undefined);
    if (imageUrl && imageElementRef.current?.complete && imageElementRef.current.naturalWidth > 0) setLoadedImageUrl(imageUrl);
  }, [imageUrl]);
  const editable = mode === "edit";
  const canEdit = editable && !saving && !disabledReason && imageLoaded;
  const canDraw = canEdit && !editingId;
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

  const saveItems = async () => {
    if (!canEdit || !onSave || saveInFlight.current) return;
    const generation = imageGeneration.current;
    saveInFlight.current = true;
    setSaveError(undefined);
    try {
      const saved = await onSave(items);
      if (generation !== imageGeneration.current) return;
      if (saved) setEditingId(null);
      else setSaveError("保存失败，当前编辑状态和输入已保留，请重试或按上方提示处理。");
    } catch {
      if (generation === imageGeneration.current) setSaveError("保存失败，当前编辑状态和输入已保留，请重试。");
    } finally { saveInFlight.current = false; }
  };

  const pointFromEvent = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * 100),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100),
    };
  };

  const addPoint = (event: MouseEvent<HTMLDivElement>) => {
    if (!canDraw || tool !== "point") return;
    const text = window.prompt("请输入标注说明");
    if (!text?.trim()) return;
    const point = pointFromEvent(event);
    commitItems([...items, { id: newAnnotationId(), type: "point", color, text: text.trim(), ...point }]);
  };

  const beginRect = (event: MouseEvent<HTMLDivElement>) => {
    if (!canDraw || tool !== "rectangle") return;
    const point = pointFromEvent(event);
    setRectStart(point);
    setDraftRect({ id: newAnnotationId(), type: "rectangle", color, text: "", x: point.x, y: point.y, width: 0, height: 0 });
  };

  const updateRect = (event: MouseEvent<HTMLDivElement>) => {
    if (!canDraw || !draftRect || !rectStart) return;
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
    if (!canDraw || !draftRect) return;
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

  const removeItem = (id: string) => {
    if (!canDraw) return;
    const next = items.filter((item) => item.id !== id);
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
            <Button size="small" icon={<SaveOutlined />} loading={saving} disabled={!canEdit || !onSave} onClick={saveItems}>保存标注</Button>
          </>
        )}
      </Space>

      {disabledReason && <Alert type="info" showIcon message={disabledReason} style={{ marginBottom: 12 }} />}
      {saveError && <Alert type="error" showIcon message={saveError} style={{ marginBottom: 12 }} />}
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
            <img ref={imageElementRef} onLoad={() => setLoadedImageUrl(imageUrl)} onError={() => setLoadedImageUrl(undefined)} src={imageUrl} alt={imageTitle || "reference"} style={{ display: "block", width: "100%", height: "auto", userSelect: "none" }} draggable={false} />
            {visible && [...items, ...(draftRect ? [draftRect] : [])].map((item, index) => {
              const color = colorHex(item.color);
              if (item.type === "point") {
                return (
                  <div key={`${item.id}-${item.type}`} style={{ position: "absolute", left: `${item.x}%`, top: `${item.y}%`, transform: "translate(-50%, -50%)" }}>
                    <div style={{ width: 28, height: 28, borderRadius: 14, background: color, color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, boxShadow: "0 4px 12px rgba(15,23,42,.2)", lineHeight: "28px" }}>{index + 1}</div>
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
                  <span style={{ position: "absolute", left: -1, top: -30, width: 28, height: 28, borderRadius: 14, background: color, color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, lineHeight: "28px" }}>{index + 1}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <Text strong>图片标注说明</Text>
        {!items.length ? (
          <Alert style={{ marginTop: 8 }} type="info" showIcon message="暂无标注" />
        ) : (
          <Space direction="vertical" style={{ width: "100%", marginTop: 8 }}>
            {items.map((item, index) => (
              <Space key={item.id} align="start" style={{ width: "100%", justifyContent: "space-between" }}>
                <Space align="start">
                  <Tag color={item.color}>{index + 1}</Tag>
                  {editingId === item.id ? (
                    <Input.TextArea aria-label={`编辑标注 ${index + 1}`} value={item.text} maxLength={2000} disabled={!canEdit}
                      onChange={(event) => commitItems(items.map(mark => mark.id === item.id ? { ...mark, text: event.target.value } : mark))} />
                  ) : <Text>{item.text || "未填写说明"}</Text>}
                </Space>
                {editable && <Space>
                  {editingId === item.id
                    ? <Button size="small" loading={saving} disabled={!canEdit} onClick={saveItems}>保存修改</Button>
                    : <Button size="small" disabled={!canEdit || !!editingId} onClick={() => { setEditingId(item.id); setDraftRect(null); setRectStart(null); }}>编辑</Button>}
                  <Button size="small" danger disabled={!canDraw} icon={<DeleteOutlined />} onClick={() => removeItem(item.id)}>删除</Button>
                </Space>}
              </Space>
            ))}
          </Space>
        )}
      </div>
    </div>
  );
}
