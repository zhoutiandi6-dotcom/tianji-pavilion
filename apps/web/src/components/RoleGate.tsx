'use client';

import type React from "react";
import { useEffect, useState } from "react";
import { Alert, Card, Spin } from "antd";
import { authApi } from "@/lib/api";

export default function RoleGate({ allowedRoles, children }: { allowedRoles: string[]; children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const rolesKey = allowedRoles.join(",");

  useEffect(() => {
    authApi.getMe()
      .then((res) => {
        const user = res.data.data || res.data;
        setAllowed(allowedRoles.includes(user.role));
      })
      .catch(() => setAllowed(false))
      .finally(() => setLoading(false));
  }, [rolesKey]);

  if (loading) {
    return <div style={{ textAlign: "center", padding: 80 }}><Spin size="large" /></div>;
  }

  if (!allowed) {
    return (
      <Card>
        <Alert type="warning" showIcon message="当前账号无权限访问该页面。" />
      </Card>
    );
  }

  return <>{children}</>;
}
