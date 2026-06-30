/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@tianji/shared', 'antd', '@ant-design/icons'],
};

module.exports = nextConfig;
