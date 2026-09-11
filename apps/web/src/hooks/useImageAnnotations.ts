'use client';

import { useEffect, useRef, useState } from "react";
import { attachmentApi, getErrorMessage } from "@/lib/api";
import type { ImageAnnotation } from "@/components/ImageAnnotationViewer";

type Entry = { annotations: ImageAnnotation[]; version: number; dirty: boolean; loading: boolean; saving: boolean; error?: string; saveError?: string; conflict?: boolean };
const empty = (): Entry => ({ annotations: [], version: 0, dirty: false, loading: true, saving: false });
export function useImageAnnotations(attachmentId?: number) {
  const [entries, setEntries] = useState<Record<number, Entry>>({});
  const entriesRef = useRef(entries);
  const [reloadKey, setReloadKey] = useState(0);
  const savingIds = useRef(new Set<number>());
  const patch = (id: number, update: (prev: Entry) => Entry) => {
    const next = { ...entriesRef.current, [id]: update(entriesRef.current[id] || empty()) };
    entriesRef.current = next;
    setEntries(next);
  };
  useEffect(() => {
    if (!attachmentId) return;
    let disposed = false;
    patch(attachmentId, prev => ({ ...prev, loading: true, error: undefined }));
    attachmentApi.getAnnotations(attachmentId).then(res => {
      if (disposed) return;
      const data = res.data.data || res.data;
      if (data.attachmentId !== attachmentId || data.document?.schemaVersion !== 1 || !Array.isArray(data.document.annotations)) throw new Error("Invalid annotation response");
      patch(attachmentId, prev => prev.dirty
        ? { ...prev, loading: false, conflict: prev.version !== data.version }
        : { ...empty(), annotations: data.document.annotations, version: data.version, loading: false });
    }).catch(error => {
      if (!disposed) patch(attachmentId, prev => ({ ...prev, loading: false, error: getErrorMessage(error, "标注读取失败，请重试；未加载前不能保存") }));
    });
    return () => { disposed = true; };
  }, [attachmentId, reloadKey]);

  const entry = attachmentId ? entries[attachmentId] || empty() : { ...empty(), loading: false };
  const change = (annotations: ImageAnnotation[]) => {
    if (attachmentId && !entry.loading && !entry.error && !savingIds.current.has(attachmentId)) patch(attachmentId, prev => ({ ...prev, annotations, dirty: true }));
  };
  const save = async (annotations: ImageAnnotation[]) => {
    if (!attachmentId || entry.loading || entry.error || entry.conflict || savingIds.current.has(attachmentId)) return false;
    const id = attachmentId;
    const expectedVersion = entriesRef.current[id]?.version ?? 0;
    savingIds.current.add(id);
    patch(id, prev => ({ ...prev, saving: true, saveError: undefined }));
    try {
      const res = await attachmentApi.saveAnnotations(id, { expectedVersion, document: { schemaVersion: 1, annotations } });
      const data = res.data.data || res.data;
      patch(id, () => ({ ...empty(), annotations: data.document.annotations, version: data.version, loading: false }));
      return true;
    } catch (error: any) {
      const conflict = error?.response?.status === 409;
      patch(id, prev => ({ ...prev, saving: false, dirty: true, conflict,
        saveError: conflict ? "标注已被其他人更新，未覆盖服务器内容。当前草稿已保留，请核对后重新读取。" : getErrorMessage(error, "保存失败，当前草稿已保留") }));
      return false;
    } finally { savingIds.current.delete(id); }
  };
  const reload = () => {
    if (attachmentId && !savingIds.current.has(attachmentId)) {
      patch(attachmentId, () => empty());
      setReloadKey(key => key + 1);
    }
  };
  return { ...entry, change, save, reload, anyDirty: Object.values(entries).some(item => item.dirty || item.saving) };
}
