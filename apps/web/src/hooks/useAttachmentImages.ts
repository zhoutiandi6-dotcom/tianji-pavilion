'use client';

import { useCallback, useEffect, useRef } from "react";
import { attachmentApi } from "@/lib/api";

/** Page-scoped authenticated image downloads shared by thumbnails, preview and annotations. */
export function useAttachmentImages() {
  const cache = useRef(new Map<number, Promise<string>>());
  const generation = useRef(0);
  useEffect(() => () => {
    generation.current += 1;
    cache.current.forEach(pending => { void pending.then(url => URL.revokeObjectURL(url), () => {}); });
    cache.current.clear();
  }, []);

  return useCallback((attachment: { id: number; mimeType?: string; fileType?: string }) => {
    const existing = cache.current.get(attachment.id);
    if (existing) return existing;
    const started = generation.current;
    const pending = attachmentApi.download(attachment.id).then(response => {
      if (started !== generation.current) throw new Error("Image page was closed");
      return URL.createObjectURL(new Blob([response.data], { type: attachment.mimeType || attachment.fileType || "image/*" }));
    }).catch(error => {
      if (cache.current.get(attachment.id) === pending) cache.current.delete(attachment.id);
      throw error;
    });
    cache.current.set(attachment.id, pending);
    return pending;
  }, []);
}
