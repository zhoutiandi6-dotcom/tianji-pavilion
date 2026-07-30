/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['antd', '@ant-design/icons'],
  allowedDevOrigins: [
    'localhost',
    '127.0.0.1',
    ...(process.env.TIANJI_LAN_IP ? [process.env.TIANJI_LAN_IP] : []),
  ],
};

module.exports = nextConfig;
