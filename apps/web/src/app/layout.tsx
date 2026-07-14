import type { Metadata } from 'next';
import type React from 'react';
import './globals.css';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { ThemeProvider } from '@/lib/context/theme';

export const metadata: Metadata = {
  title: '天机阁 - TianJi Pavilion',
  description: '企业内部设计协作管理平台',
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <AntdRegistry><ThemeProvider>{children}</ThemeProvider></AntdRegistry>
      </body>
    </html>
  );
}
