/**
 * 文字起こしの進行状況取得API
 * 公益資本主義「智の泉」プロジェクト用
 */

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
    const { job_id } = req.query;

    if (!job_id) {
      return res.status(400).json({ error: 'ジョブIDが指定されていません' });
    }

    // 文字起こしの進行状況を取得
    const statusResult = await getTranscriptionStatus(job_id);

    if (statusResult.status === 'error') {
      return res.status(500).json({ error: statusResult.message });
    }

    res.status(200).json(statusResult);

  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: '状況取得エラーが発生しました' });
  }
}

/**
 * 文字起こしの進行状況を取得
 * GenSparkチャット環境経由で進行状況を確認
 */
async function getTranscriptionStatus(job_id) {
  try {
    // 実際の進行状況を取得
    // ここでは、GenSparkのチャット環境経由で状況を確認
    const status = await checkGenSparkTranscriptionStatus(job_id);

    if (status.status === 'error') {
      return {
        status: 'error',
        message: status.message
      };
    }

    return {
      status: 'success',
      job_id: job_id,
      progress: status.progress,
      current_stage: status.current_stage,
      estimated_remaining: status.estimated_remaining,
      started_at: status.started_at,
      updated_at: new Date().toISOString()
    };

  } catch (error) {
    return {
      status: 'error',
      message: `状況取得エラー: ${error.message}`
    };
  }
}

/**
 * GenSparkチャット環境経由での進行状況確認
 * 実際の実装では、GenSparkのAPIまたはチャット環境との連携
 */
async function checkGenSparkTranscriptionStatus(job_id) {
  try {
    // プレースホルダー実装
    // 実際には、GenSparkのチャット環境経由で進行状況を確認
    
    console.log('GenSpark Status Check:', {
      job_id: job_id,
      timestamp: new Date().toISOString()
    });

    // 進行状況をシミュレート
    const progress = Math.floor(Math.random() * 100);
    const stages = [
      '第1段階: 生音声 → 粗テキスト化',
      '第2段階: 話者識別・区切り整理',
      '第3段階: 内容完全性確保',
      '第4段階: 最終フォーマット調整'
    ];
    
    let currentStage;
    if (progress < 25) {
      currentStage = stages[0];
    } else if (progress < 50) {
      currentStage = stages[1];
    } else if (progress < 75) {
      currentStage = stages[2];
    } else {
      currentStage = stages[3];
    }

    return {
      status: 'success',
      progress: progress,
      current_stage: currentStage,
      estimated_remaining: progress < 90 ? `${Math.floor(Math.random() * 30) + 5}分` : '完了間近',
      started_at: new Date(Date.now() - Math.random() * 3600000).toISOString() // 1時間以内のランダム時刻
    };

  } catch (error) {
    console.error('GenSpark status check error:', error);
    return {
      status: 'error',
      message: `状況確認エラー: ${error.message}`
    };
  }
}
