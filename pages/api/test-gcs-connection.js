/**
 * GCS接続テストAPI
 * Google Cloud Storageへの接続と認証をテスト
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
    console.log('Testing GCS connection...');
    
    // 環境変数の確認
    const envCheck = {
      GOOGLE_CLOUD_PROJECT_ID: process.env.GOOGLE_CLOUD_PROJECT_ID ? 'SET' : 'NOT SET',
      GOOGLE_CLIENT_EMAIL: process.env.GOOGLE_CLIENT_EMAIL ? 'SET' : 'NOT SET',
      GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY ? 'SET' : 'NOT SET',
      GCS_BUCKET_NAME: process.env.GCS_BUCKET_NAME || 'darwin-project-audio-files'
    };

    console.log('Environment variables:', envCheck);

    // Storage クライアントの初期化
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

    console.log('Storage client initialized');

    // バケットの存在確認
    const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'darwin-project-audio-files';
    const bucket = storage.bucket(BUCKET_NAME);
    
    console.log(`Checking bucket: ${BUCKET_NAME}`);
    const [exists] = await bucket.exists();
    
    console.log(`Bucket exists: ${exists}`);

    // 署名付きURL生成テスト
    const testFilePath = 'test/test-file.txt';
    const testFile = bucket.file(testFilePath);
    
    console.log('Testing signed URL generation...');
    const [signedUrl] = await testFile.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000,
      contentType: 'text/plain'
    });

    console.log('Signed URL generated successfully');

    res.status(200).json({
      success: true,
      message: 'GCS接続テスト成功',
      environment: envCheck,
      bucketExists: exists,
      signedUrlGenerated: true,
      testSignedUrl: signedUrl.substring(0, 100) + '...' // 最初の100文字のみ表示
    });

  } catch (error) {
    console.error('GCS connection test failed:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      code: error.code,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      error: 'GCS接続テストに失敗しました',
      details: error.message,
      code: error.code || 'UNKNOWN_ERROR',
      environment: {
        GOOGLE_CLOUD_PROJECT_ID: process.env.GOOGLE_CLOUD_PROJECT_ID ? 'SET' : 'NOT SET',
        GOOGLE_CLIENT_EMAIL: process.env.GOOGLE_CLIENT_EMAIL ? 'SET' : 'NOT SET',
        GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY ? 'SET' : 'NOT SET',
        GCS_BUCKET_NAME: process.env.GCS_BUCKET_NAME || 'darwin-project-audio-files'
      }
    });
  }
}
