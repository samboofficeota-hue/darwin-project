/**
 * 音声文字起こしの進捗状況確認API
 */

import { loadJobState } from '../../lib/storage.js';

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
    const { jobId } = req.query;

    if (!jobId) {
      return res.status(400).json({ error: 'ジョブIDが必要です' });
    }

    const processingState = await loadJobState(jobId);
    
    if (!processingState) {
      return res.status(404).json({ error: 'ジョブが見つかりません' });
    }

    // レスポンス用のデータを構築
    const response = {
      jobId,
      status: processingState.status,
      progress: processingState.progress,
      startTime: processingState.startTime,
      lastUpdate: processingState.lastUpdate,
      audioMetadata: processingState.audioMetadata,
      totalChunks: processingState.totalChunks,
      completedChunks: processingState.completedChunks,
      error: processingState.error,
      canResume: processingState.canResume || false,
      retryCount: processingState.retryCount || 0
    };

    // 完了している場合は結果も含める
    if (processingState.status === 'completed' && processingState.result) {
      response.result = {
        fullText: processingState.result.fullText,
        rawText: processingState.result.rawText, // 元のテキスト
        enhanced: processingState.result.enhanced, // 整形済みフラグ
        averageConfidence: processingState.result.averageConfidence,
        totalChunks: processingState.result.totalChunks,
        failedChunks: processingState.result.failedChunks,
        duration: processingState.result.duration,
        successRate: processingState.result.successRate,
        processed: processingState.result.processed
      };
    }

    // 処理中の場合はチャンクの詳細も含める
    if (processingState.status === 'processing' && processingState.chunks) {
      response.chunks = processingState.chunks.map(chunk => ({
        id: chunk.id,
        startTime: chunk.startTime,
        endTime: chunk.endTime,
        duration: chunk.duration,
        status: chunk.status,
        retryCount: chunk.retryCount,
        error: chunk.error
      }));
    }

    res.status(200).json(response);

  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({
      error: 'ステータス確認エラーが発生しました',
      details: error.message
    });
  }
}
