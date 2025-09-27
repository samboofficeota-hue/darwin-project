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
 * 講義録を取得（プレースホルダー）
 */
async function getLectureRecord(jobId) {
  // 実際の実装では、データベースから取得
  // ここではサンプルデータを返す
  
  // サンプルデータ
  const sampleRecord = {
    jobId: jobId,
    title: '公益資本主義について',
    duration: '3600', // 1時間
    confidence: 0.92,
    fullText: '公益資本主義は、経済社会システムをアップデートするための新しいアプローチです。従来の資本主義の課題を解決し、より持続可能で公平な社会を構築することを目指しています。',
    chunks: [
      {
        chunkId: 'chunk_0',
        startTime: 0,
        endTime: 300,
        text: '公益資本主義は、経済社会システムをアップデートするための新しいアプローチです。',
        confidence: 0.95
      },
      {
        chunkId: 'chunk_1',
        startTime: 300,
        endTime: 600,
        text: '従来の資本主義の課題を解決し、より持続可能で公平な社会を構築することを目指しています。',
        confidence: 0.89
      }
    ],
    createdAt: new Date().toISOString()
  };

  return sampleRecord;
}
