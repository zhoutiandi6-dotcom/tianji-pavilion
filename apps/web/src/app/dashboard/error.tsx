'use client';

import { useEffect } from 'react';
import { Button, Result } from 'antd';

type DashboardErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function DashboardError({ error, reset }: DashboardErrorProps) {
  useEffect(() => {
    console.error('[dashboard-render-error]', error);
  }, [error]);

  return (
    <Result
      status="error"
      title="驾驶舱暂时无法加载"
      subTitle="请重新加载页面；若问题持续，请联系系统管理员。错误编号：DASHBOARD_RENDER_ERROR"
      extra={<Button type="primary" onClick={reset}>重新加载</Button>}
    />
  );
}
