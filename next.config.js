/** @type {import('next').NextConfig} */
const nextConfig = {
  // CloudRun用のstandalone出力を有効化
  output: 'standalone',
  // 大きなファイルのアップロード対応
  experimental: {
    serverComponentsExternalPackages: ['@google-cloud/speech'],
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
