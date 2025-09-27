/**
 * 文字起こしジョブのステータス確認API
 * 中断・再開機能のサポート
 */

export default async function handler(req, res) {
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { job_id } = req.query;

    if (!job_id) {
      return res.status(400).json({ error: 'ジョブIDが必要です' });
    }

    // 実際の実装では、データベースからジョブ情報を取得
    // ここではプレースホルダーとして実装
    const jobStatus = await getJobStatus(job_id);

    if (!jobStatus) {
      return res.status(404).json({ error: 'ジョブが見つかりません' });
    }

    res.status(200).json({
      jobId: job_id,
      status: jobStatus.status,
      progress: jobStatus.progress,
      message: getStatusMessage(jobStatus.status),
      startTime: jobStatus.startTime,
      lastUpdate: jobStatus.lastUpdate,
      estimatedCompletion: jobStatus.estimatedCompletion,
      error: jobStatus.error,
      result: jobStatus.result,
      canResume: jobStatus.status === 'error' || jobStatus.status === 'paused'
    });

  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({
      error: 'ステータス確認エラーが発生しました',
      details: error.message
    });
  }
}

/**
 * ジョブステータスを取得（実際の実装）
 */
async function getJobStatus(jobId) {
  // 実際の実装では、データベースから取得
  // ここでは、vimeo-transcribe.jsのprocessingStatesから取得
  const { processingStates } = require('./vimeo-transcribe');
  const job = processingStates.get(jobId);
  
  if (!job) {
    return null;
  }

  // 推定完了時間を計算
  let estimatedCompletion = null;
  if (job.status === 'processing' && job.totalChunks > 0) {
    const completedChunks = job.completedChunks || 0;
    const remainingChunks = job.totalChunks - completedChunks;
    const avgTimePerChunk = 30000; // 30秒/チャンク（推定）
    const estimatedRemainingMs = remainingChunks * avgTimePerChunk;
    estimatedCompletion = new Date(Date.now() + estimatedRemainingMs).toISOString();
  }

  return {
    status: job.status,
    progress: job.progress || 0,
    startTime: job.startTime,
    lastUpdate: job.lastUpdate,
    estimatedCompletion,
    error: job.error,
    result: job.result,
    currentStage: getCurrentStage(job),
    retryCount: job.retryCount || 0,
    totalChunks: job.totalChunks || 0,
    completedChunks: job.completedChunks || 0,
    canResume: job.status === 'error' || job.status === 'paused'
  };
}

/**
 * 現在の処理段階を取得
 */
function getCurrentStage(job) {
  if (!job) return '不明';
  
  switch (job.status) {
    case 'initializing':
      return '初期化中...';
    case 'processing':
      if (job.totalChunks > 0) {
        const completed = job.completedChunks || 0;
        const total = job.totalChunks;
        return `チャンク処理中... (${completed}/${total})`;
      }
      return '音声ストリーム取得中...';
    case 'completed':
      return '処理完了';
    case 'error':
      return 'エラー発生';
    case 'paused':
      return '一時停止中';
    case 'resuming':
      return '再開中...';
    default:
      return '不明';
  }
}

/**
 * ステータスメッセージを取得
 */
function getStatusMessage(status) {
  const messages = {
    'initializing': '初期化中...',
    'processing': '文字起こし処理中...',
    'completed': '処理完了',
    'error': 'エラーが発生しました',
    'paused': '処理が一時停止されました',
    'resuming': '処理を再開中...'
  };
  
  return messages[status] || '不明なステータス';
}