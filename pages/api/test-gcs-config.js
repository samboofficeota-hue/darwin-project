/**
 * GCS設定確認API
 * 環境変数とCloud Storage接続をテスト
 */

import { Storage } from '@google-cloud/storage';

export default async function handler(req, res) {
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 環境変数の確認
    const config = {
      GOOGLE_CLOUD_PROJECT_ID: process.env.GOOGLE_CLOUD_PROJECT_ID ? 'Set' : 'Not set',
      GCS_BUCKET_NAME: process.env.GCS_BUCKET_NAME ? 'Set' : 'Not set',
      GOOGLE_CLIENT_EMAIL: process.env.GOOGLE_CLIENT_EMAIL ? 'Set' : 'Not set',
      GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY ? 'Set' : 'Not set',
      VERCEL: process.env.VERCEL ? 'Set' : 'Not set'
    };

    console.log('Environment variables:', config);

    // Cloud Storage接続テスト
    let storageTest = null;
    if (process.env.GOOGLE_CLOUD_PROJECT_ID && process.env.GCS_BUCKET_NAME && process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
      try {
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

        const bucketName = process.env.GCS_BUCKET_NAME;
        const bucket = storage.bucket(bucketName);
        
        // バケットの存在確認
        const [exists] = await bucket.exists();
        storageTest = {
          bucketName,
          exists,
          accessible: exists
        };
      } catch (error) {
        storageTest = {
          error: error.message,
          accessible: false
        };
      }
    }

    res.status(200).json({
      success: true,
      environment: config,
      storage: storageTest,
      message: 'GCS設定確認完了'
    });

  } catch (error) {
    console.error('GCS config test error:', error);
    res.status(500).json({
      error: 'GCS設定確認エラー',
      details: error.message
    });
  }
}
