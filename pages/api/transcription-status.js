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
 * ジョブステータスを取得（プレースホルダー）
 */
async function getJobStatus(jobId) {
  // 実際の実装では、データベースから取得
  // ここではプレースホルダーとして実装
  return {
    status: 'processing',
    progress: 45,
    startTime: new Date().toISOString(),
    lastUpdate: new Date().toISOString(),
    estimatedCompletion: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    error: null,
    result: null
  };
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