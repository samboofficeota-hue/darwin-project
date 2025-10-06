/**
 * Google Cloud StorageバケットのCORS設定API
 * Vercelの環境変数を使用してCORS設定を実行
 */

import { Storage } from '@google-cloud/storage';

// Google Cloud Storage クライアントの初期化
const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  credentials: {
    type: 'service_account',
    project_id: process.env.GOOGLE_CLOUD_PROJECT_ID,
    private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    client_id: process.env.GOOGLE_CLIENT_ID,
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
    client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(process.env.GOOGLE_CLIENT_EMAIL || '')}`,
    universe_domain: 'googleapis.com'
  }
});

const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'darwin-project-audio-files';

export default async function handler(req, res) {
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log(`Setting up CORS for bucket: ${BUCKET_NAME}`);
    
    const bucket = storage.bucket(BUCKET_NAME);
    
    // CORS設定（署名付きURLアップロード用に最適化）
    const corsConfiguration = [
      {
        // 署名付きURLアップロード用の設定
        origin: [
          'https://darwin-project-gold.vercel.app',
          'https://*.vercel.app', // Vercelのプレビュードメイン対応
          'http://localhost:3000',
          'http://localhost:3001',
          'http://localhost:3002',
          'http://127.0.0.1:3000',
          'http://127.0.0.1:3001',
          'http://127.0.0.1:3002'
        ],
        method: ['PUT', 'GET', 'HEAD', 'OPTIONS'], // 署名付きURLアップロードは主にPUT
        responseHeader: [
          'Content-Type',
          'Content-Length',
          'ETag',
          'Last-Modified',
          'Date',
          'Server',
          'Access-Control-Allow-Origin',
          'Access-Control-Allow-Methods',
          'Access-Control-Allow-Headers',
          'Access-Control-Expose-Headers',
          'X-Goog-Algorithm',
          'X-Goog-Credential',
          'X-Goog-Date',
          'X-Goog-Expires',
          'X-Goog-SignedHeaders',
          'X-Goog-Signature'
        ],
        maxAgeSeconds: 3600
      },
      {
        // 並列アップロード用の追加設定（Phase 2対応）
        origin: ['*'], // 並列アップロード時の柔軟性のため
        method: ['PUT', 'OPTIONS'],
        responseHeader: ['*'],
        maxAgeSeconds: 1800 // 短めのキャッシュ時間
      }
    ];
    
    // バケットのCORS設定を更新
    await bucket.setCorsConfiguration(corsConfiguration);
    
    console.log('CORS configuration updated successfully!');
    
    res.status(200).json({
      success: true,
      message: 'CORS設定が正常に完了しました',
      bucketName: BUCKET_NAME,
      corsConfiguration: corsConfiguration
    });
    
  } catch (error) {
    console.error('Error setting up CORS:', error);
    res.status(500).json({
      error: 'CORS設定に失敗しました',
      details: error.message,
      bucketName: BUCKET_NAME
    });
  }
}
