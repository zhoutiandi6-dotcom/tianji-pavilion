'use client';

import { useCallback, useEffect, useRef } from 'react';

type DashboardRefreshOptions = {
  refreshCore: () => Promise<void> | void;
  refreshAnalytics?: () => Promise<void> | void;
  coreIntervalMs?: number;
  analyticsIntervalMs?: number;
};

/** Refreshes visible dashboard data without overlapping requests. */
export function useDashboardRefresh({
  refreshCore,
  refreshAnalytics,
  coreIntervalMs = 15_000,
  analyticsIntervalMs = 60_000,
}: DashboardRefreshOptions) {
  const coreRunning = useRef(false);
  const analyticsRunning = useRef(false);

  const runCore = useCallback(async () => {
    if (document.visibilityState !== 'visible' || coreRunning.current) return;
    coreRunning.current = true;
    try {
      await refreshCore();
    } finally {
      coreRunning.current = false;
    }
  }, [refreshCore]);

  const runAnalytics = useCallback(async () => {
    if (!refreshAnalytics || document.visibilityState !== 'visible' || analyticsRunning.current) return;
    analyticsRunning.current = true;
    try {
      await refreshAnalytics();
    } finally {
      analyticsRunning.current = false;
    }
  }, [refreshAnalytics]);

  useEffect(() => {
    const onFocus = () => {
      if (refreshAnalytics) void runAnalytics();
      else void runCore();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') onFocus();
    };
    const onDashboardMutation = () => onFocus();
    const coreTimer = window.setInterval(() => void runCore(), coreIntervalMs);
    const analyticsTimer = refreshAnalytics
      ? window.setInterval(() => void runAnalytics(), analyticsIntervalMs)
      : undefined;

    window.addEventListener('focus', onFocus);
    window.addEventListener('tianji:dashboard-refresh', onDashboardMutation);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(coreTimer);
      if (analyticsTimer) window.clearInterval(analyticsTimer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('tianji:dashboard-refresh', onDashboardMutation);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [analyticsIntervalMs, coreIntervalMs, refreshAnalytics, runAnalytics, runCore]);

  return { refreshNow: runCore };
}
