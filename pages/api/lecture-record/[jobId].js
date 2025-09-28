/**
 * 講義録取得API
 * HTML形式での講義録表示用
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
    const { jobId } = req.query;

    if (!jobId) {
      return res.status(400).json({ error: 'ジョブIDが必要です' });
    }

    // 実際の実装では、データベースから講義録を取得
    // ここではプレースホルダーとして実装
    const lectureRecord = await getLectureRecord(jobId);

    if (!lectureRecord) {
      return res.status(404).json({ error: '講義録が見つかりません' });
    }

    res.status(200).json(lectureRecord);

  } catch (error) {
    console.error('Lecture record fetch error:', error);
    res.status(500).json({
      error: '講義録の取得に失敗しました',
      details: error.message
    });
  }
}

/**
 * 講義録を取得（実際の実装）
 */
async function getLectureRecord(jobId) {
  try {
    const fs = require('fs');
    const path = require('path');
    
    // 1. 処理状態ファイルから結果を取得
    const stateFile = path.join('/tmp', `job_${jobId}.json`);
    
    if (!fs.existsSync(stateFile)) {
      return null;
    }
    
    const jobData = fs.readFileSync(stateFile, 'utf8');
    const job = JSON.parse(jobData);
    
    // 2. 処理が完了していない場合はnullを返す
    if (job.status !== 'completed' || !job.result) {
      return null;
    }
    
    // 3. 講義録データを構築
    const lectureRecord = {
      jobId: jobId,
      title: job.lectureInfo?.theme || '講義録',
      duration: job.result.duration?.toString() || '0',
      confidence: job.result.averageConfidence || 0,
      fullText: job.result.fullText || '',
      chunks: job.result.chunks?.map((chunk, index) => ({
        chunkId: `chunk_${index}`,
        startTime: chunk.startTime || 0,
        endTime: chunk.endTime || 0,
        text: chunk.text || '',
        confidence: chunk.confidence || 0
      })) || [],
      createdAt: job.startTime || new Date().toISOString(),
      statistics: job.result.statistics || {},
      processed: job.result.processed || false
    };
    
    // 4. 講義録を永続化（別ファイルに保存）
    const recordFile = path.join('/tmp', `record_${jobId}.json`);
    fs.writeFileSync(recordFile, JSON.stringify(lectureRecord, null, 2));
    
    return lectureRecord;
    
  } catch (error) {
    console.error('Error getting lecture record:', error);
    return null;
  }
}
