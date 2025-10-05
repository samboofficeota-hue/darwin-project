/**
 * セッション情報保存API
 * ユーザーのセッション情報をデータベースに保存
 */

import { saveJobState } from '../../../lib/storage.js';

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
    const { userId, sessionId, sessionData } = req.body;

    if (!userId || !sessionId || !sessionData) {
      return res.status(400).json({ 
        error: 'userId, sessionId, sessionData が必要です' 
      });
    }

    // セッション情報を保存
    const sessionInfo = {
      userId,
      sessionId,
      ...sessionData,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    };

    const success = await saveJobState(`session:${userId}:${sessionId}`, sessionInfo);

    if (!success) {
      throw new Error('セッション情報の保存に失敗しました');
    }

    console.log(`Session saved: ${userId}/${sessionId}`);

    res.status(200).json({
      success: true,
      sessionId,
      message: 'セッション情報が保存されました'
    });

  } catch (error) {
    console.error('Error saving session:', error);
    res.status(500).json({
      error: 'セッション情報の保存に失敗しました',
      details: error.message
    });
  }
}
