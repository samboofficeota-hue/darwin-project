/**
 * セッション情報取得API
 * ユーザーのセッション情報を取得
 */

import { loadJobState } from '../../../lib/storage.js';

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
    const { userId, sessionId } = req.query;

    if (!userId || !sessionId) {
      return res.status(400).json({ 
        error: 'userId, sessionId が必要です' 
      });
    }

    // セッション情報を取得
    const sessionInfo = await loadJobState(`session:${userId}:${sessionId}`);

    if (!sessionInfo) {
      return res.status(404).json({ 
        error: 'セッションが見つかりません' 
      });
    }

    console.log(`Session retrieved: ${userId}/${sessionId}`);

    res.status(200).json({
      success: true,
      session: sessionInfo
    });

  } catch (error) {
    console.error('Error getting session:', error);
    res.status(500).json({
      error: 'セッション情報の取得に失敗しました',
      details: error.message
    });
  }
}
