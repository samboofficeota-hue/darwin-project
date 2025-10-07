/**
 * Cloud Storage署名付きURL生成API
 * アップロード用とダウンロード用の署名付きURLを生成
 */

import { Storage } from '@google-cloud/storage';

// 環境変数の詳細ログ
console.log('Private key length:', process.env.GOOGLE_PRIVATE_KEY?.length);
console.log('Private key starts with:', process.env.GOOGLE_PRIVATE_KEY?.substring(0, 50));
console.log('Private key contains newlines:', process.env.GOOGLE_PRIVATE_KEY?.includes('\\n'));

// 環境変数からサービスアカウントキーを構築
const serviceAccountKey = {
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
};

console.log('Service account key:', {
  type: serviceAccountKey.type,
  project_id: serviceAccountKey.project_id,
  client_email: serviceAccountKey.client_email,
  private_key_length: serviceAccountKey.private_key?.length,
  private_key_starts_with: serviceAccountKey.private_key?.substring(0, 50)
});

const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  credentials: serviceAccountKey
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
    const { userId, sessionId, chunkId, operation = 'upload' } = req.body;

    console.log('Request body:', req.body);
    console.log('Environment variables check:', {
      GOOGLE_CLOUD_PROJECT_ID: process.env.GOOGLE_CLOUD_PROJECT_ID ? 'SET' : 'NOT SET',
      GOOGLE_CLIENT_EMAIL: process.env.GOOGLE_CLIENT_EMAIL ? 'SET' : 'NOT SET',
      GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY ? 'SET' : 'NOT SET',
      GOOGLE_PRIVATE_KEY_ID: process.env.GOOGLE_PRIVATE_KEY_ID ? 'SET' : 'NOT SET',
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? 'SET' : 'NOT SET',
      GCS_BUCKET_NAME: process.env.GCS_BUCKET_NAME || 'darwin-project-audio-files'
    });

    // 環境変数の詳細チェック
    if (!process.env.GOOGLE_CLOUD_PROJECT_ID) {
      throw new Error('GOOGLE_CLOUD_PROJECT_ID is not set');
    }
    if (!process.env.GOOGLE_CLIENT_EMAIL) {
      throw new Error('GOOGLE_CLIENT_EMAIL is not set');
    }
    if (!process.env.GOOGLE_PRIVATE_KEY) {
      throw new Error('GOOGLE_PRIVATE_KEY is not set');
    }

    // 環境変数の詳細ログ（デバッグ用）
    console.log('Environment variables details:', {
      GOOGLE_CLOUD_PROJECT_ID: process.env.GOOGLE_CLOUD_PROJECT_ID,
      GOOGLE_CLIENT_EMAIL: process.env.GOOGLE_CLIENT_EMAIL,
      GOOGLE_PRIVATE_KEY_LENGTH: process.env.GOOGLE_PRIVATE_KEY?.length,
      GOOGLE_PRIVATE_KEY_START: process.env.GOOGLE_PRIVATE_KEY?.substring(0, 30),
      GOOGLE_PRIVATE_KEY_END: process.env.GOOGLE_PRIVATE_KEY?.substring(-30),
      GOOGLE_PRIVATE_KEY_ID: process.env.GOOGLE_PRIVATE_KEY_ID,
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
      GCS_BUCKET_NAME: process.env.GCS_BUCKET_NAME
    });

    if (!userId || !sessionId || !chunkId) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    console.log('Generating signed URL:', { userId, sessionId, chunkId, operation });

    const bucket = storage.bucket(BUCKET_NAME);
    
    // ファイルパスを生成
    const filePath = `users/${userId}/sessions/${sessionId}/chunks/${chunkId}.wav`;
    const file = bucket.file(filePath);

    // 署名付きURL生成オプション
    const options = {
      version: 'v4',
      action: operation, // 'read' または 'write'
      expires: Date.now() + 15 * 60 * 1000, // 15分で期限切れ
    };

    let signedUrl;

    if (operation === 'upload') {
      // アップロード用の署名付きURLを生成
      [signedUrl] = await file.getSignedUrl({
        ...options,
        action: 'write',
        contentType: 'audio/wav',
      });
    } else if (operation === 'download') {
      // ダウンロード用の署名付きURLを生成
      [signedUrl] = await file.getSignedUrl({
        ...options,
        action: 'read',
      });
    } else {
      return res.status(400).json({ error: 'Invalid operation. Use "upload" or "download"' });
    }

    console.log(`Generated signed URL for ${operation}: ${filePath}`);

    res.status(200).json({
      success: true,
      signedUrl,
      filePath,
      operation,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
    });

  } catch (error) {
    console.error('Error generating signed URL:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      code: error.code
    });
    
    res.status(500).json({
      error: '署名付きURLの生成に失敗しました',
      details: error.message,
      code: error.code || 'UNKNOWN_ERROR'
    });
  }
}
