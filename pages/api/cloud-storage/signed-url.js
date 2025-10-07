/**
 * Cloud Storage署名付きURL生成API
 * アップロード用とダウンロード用の署名付きURLを生成
 */

import { Storage } from '@google-cloud/storage';

const storage = new Storage();
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
    res.status(500).json({
      error: '署名付きURLの生成に失敗しました',
      details: error.message
    });
  }
}
