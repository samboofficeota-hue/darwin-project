/**
 * Cloud Storageバケット作成API
 * 指定されたバケットが存在しない場合に作成
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
    console.log(`Checking bucket: ${BUCKET_NAME}`);

    // バケットの存在確認
    const bucket = storage.bucket(BUCKET_NAME);
    const [exists] = await bucket.exists();

    if (exists) {
      console.log(`Bucket ${BUCKET_NAME} already exists`);
      return res.status(200).json({
        success: true,
        message: 'バケットは既に存在します',
        bucketName: BUCKET_NAME,
        exists: true
      });
    }

    // バケットを作成
    console.log(`Creating bucket: ${BUCKET_NAME}`);
    const [bucketCreated] = await storage.createBucket(BUCKET_NAME, {
      location: 'asia-northeast1', // 東京リージョン
      storageClass: 'STANDARD',
      uniformBucketLevelAccess: true
    });

    console.log(`Bucket ${BUCKET_NAME} created successfully`);

    res.status(200).json({
      success: true,
      message: 'バケットが正常に作成されました',
      bucketName: BUCKET_NAME,
      exists: true,
      created: true
    });

  } catch (error) {
    console.error('Error creating bucket:', error);
    res.status(500).json({
      error: 'バケットの作成に失敗しました',
      details: error.message,
      bucketName: BUCKET_NAME
    });
  }
}
