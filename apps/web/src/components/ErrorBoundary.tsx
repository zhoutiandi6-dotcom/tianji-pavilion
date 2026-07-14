'use client';
import { Component, ErrorInfo, ReactNode } from "react";
import { Button, Typography, Space } from "antd";
const { Title, Text } = Typography;

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error): State { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("ErrorBoundary:", error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 80, textAlign: "center" }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>⚠️</div>
          <Title level={3}>系统出现异常</Title>
          <Text type="secondary">{this.state.error?.message}</Text>
          <div style={{ marginTop: 16 }}>
            <Space>
              <Button type="primary" onClick={() => { this.setState({ hasError: false }); window.location.href = "/dashboard"; }}>返回首页</Button>
              <Button onClick={() => window.location.reload()}>刷新页面</Button>
            </Space>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
