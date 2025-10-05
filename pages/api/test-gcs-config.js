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
      GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS ? 'Set' : 'Not set',
      VERCEL: process.env.VERCEL ? 'Set' : 'Not set'
    };

    console.log('Environment variables:', config);

    // Cloud Storage接続テスト
    let storageTest = null;
    if (process.env.GOOGLE_CLOUD_PROJECT_ID && process.env.GCS_BUCKET_NAME) {
      try {
        const storage = new Storage({
          projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
          keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
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
