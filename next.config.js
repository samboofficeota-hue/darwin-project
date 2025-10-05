/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // 大きなファイルのアップロード対応
  experimental: {
    serverComponentsExternalPackages: ['@google-cloud/speech'],
  },
  // CloudRun用の設定
  serverRuntimeConfig: {
    maxFileSize: '50mb',
  },
  // 静的ファイルの配信設定
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
