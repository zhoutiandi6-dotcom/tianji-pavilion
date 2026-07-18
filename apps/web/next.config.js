/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['antd', '@ant-design/icons'],
  allowedDevOrigins: ['localhost', '192.168.13.126'],
};

module.exports = nextConfig;
