/**
 * チャンクを直接Cloud StorageにアップロードするAPI
 * CORS問題を回避するため、サーバーサイドでアップロード
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
    const { chunkData, chunkId, userId, sessionId } = req.body;

    if (!chunkData || !chunkId || !userId || !sessionId) {
      return res.status(400).json({ 
        error: 'chunkData, chunkId, userId, sessionId が必要です' 
      });
    }

    // ファイルパスを生成
    const filePath = `users/${userId}/sessions/${sessionId}/chunks/${chunkId}.wav`;
    
    // バケットとファイルオブジェクトを取得
    const bucket = storage.bucket(BUCKET_NAME);
    const file = bucket.file(filePath);

    // Base64データをBufferに変換
    const buffer = Buffer.from(chunkData, 'base64');

    // ファイルをアップロード
    await file.save(buffer, {
      metadata: {
        contentType: 'audio/wav',
      },
    });

    console.log(`Chunk ${chunkId} uploaded successfully to ${filePath}`);

    res.status(200).json({
      success: true,
      chunkId,
      filePath,
      bucket: BUCKET_NAME,
      uploadTime: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error uploading chunk:', error);
    res.status(500).json({
      error: 'チャンクのアップロードに失敗しました',
      details: error.message
    });
  }
}
