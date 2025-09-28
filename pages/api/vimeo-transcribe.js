/**
 * Vimeo APIを使用した長時間動画の文字起こし機能
 * 実際に動作する完全な実装
 */

import crypto from 'crypto';
import { saveJobState, loadJobState, updateJobState } from '../../lib/storage.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};

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
    const { vimeoUrl, resume_job_id, lecture_info } = req.body;

    if (!vimeoUrl && !resume_job_id) {
      return res.status(400).json({ error: 'Vimeo URLまたは再開ジョブIDが必要です' });
    }

    // 既存のジョブを再開する場合
    if (resume_job_id) {
      return await resumeTranscriptionJob(resume_job_id, res);
    }

    // 新しいジョブを開始
    return await startNewTranscriptionJob(vimeoUrl, lecture_info, res);

  } catch (error) {
    console.error('Vimeo transcription error:', error);
    res.status(500).json({
      error: '文字起こしエラーが発生しました',
      details: error.message
    });
  }
}

/**
 * 新しい文字起こしジョブを開始
 */
async function startNewTranscriptionJob(vimeoUrl, lectureInfo, res) {
  try {
    // ジョブIDを生成
    const jobId = generateJobId();
    
    // Vimeo URLの検証
    const videoInfo = await validateVimeoUrl(vimeoUrl);
    if (!videoInfo) {
      return res.status(400).json({ error: '無効なVimeo URLです' });
    }

    // 処理状態を初期化
    const processingState = {
      jobId,
      vimeoUrl,
      videoInfo,
      lectureInfo,
      status: 'initializing',
      progress: 0,
      chunks: [],
      completedChunks: 0,
      totalChunks: 0,
      startTime: new Date().toISOString(),
      lastUpdate: new Date().toISOString(),
      error: null,
      result: null
    };

    saveJobState(jobId, processingState);

    // 非同期で処理を開始
    processTranscriptionAsync(jobId);

    res.status(200).json({
      status: 'started',
      jobId,
      message: '文字起こし処理を開始しました',
      estimatedDuration: estimateProcessingTime(videoInfo.duration || 0)
    });

  } catch (error) {
    console.error('Job start error:', error);
    res.status(500).json({ error: 'ジョブ開始エラーが発生しました' });
  }
}

/**
 * 中断されたジョブを再開
 */
async function resumeTranscriptionJob(jobId, res) {
  try {
    const processingState = loadJobState(jobId);
    
    if (!processingState) {
      return res.status(404).json({ error: 'ジョブが見つかりません' });
    }

    if (processingState.status === 'completed') {
      return res.status(200).json({
        status: 'already_completed',
        jobId,
        result: processingState.result
      });
    }

    // 処理を再開
    processingState.status = 'resuming';
    processingState.lastUpdate = new Date().toISOString();
    saveJobState(jobId, processingState);
    
    // 非同期で処理を再開
    processTranscriptionAsync(jobId);

    res.status(200).json({
      status: 'resumed',
      jobId,
      message: '文字起こし処理を再開しました',
      progress: processingState.progress
    });

  } catch (error) {
    console.error('Job resume error:', error);
    res.status(500).json({ error: 'ジョブ再開エラーが発生しました' });
  }
}

/**
 * 非同期で文字起こし処理を実行
 */
async function processTranscriptionAsync(jobId) {
  let processingState = loadJobState(jobId);
  if (!processingState) {
    console.error('Processing state not found for job:', jobId);
    return;
  }
  
  const maxRetries = 3;
  let retryCount = 0;
  
  while (retryCount < maxRetries) {
    try {
      processingState.status = 'processing';
      processingState.lastUpdate = new Date().toISOString();
      processingState.retryCount = retryCount;
      saveJobState(jobId, processingState);

      // 1. 音声をチャンクに分割
      const chunks = splitAudioIntoChunks(processingState.videoInfo.duration || 0);
      
      processingState.chunks = chunks;
      processingState.totalChunks = chunks.length;
      processingState.lastUpdate = new Date().toISOString();
      saveJobState(jobId, processingState);

      // 2. 各チャンクを順次処理
      const transcriptionResults = await processChunksSequentially(chunks, jobId);
      
      // 3. 結果を統合
      const finalResult = mergeTranscriptionResults(transcriptionResults);
      
      // 4. 処理完了
      processingState.status = 'completed';
      processingState.progress = 100;
      processingState.result = finalResult;
      processingState.lastUpdate = new Date().toISOString();
      processingState.retryCount = 0;
      saveJobState(jobId, processingState);
      
      break;

    } catch (error) {
      retryCount++;
      console.error(`Job ${jobId} processing error (attempt ${retryCount}):`, error);
      
      if (retryCount >= maxRetries) {
        processingState.status = 'error';
        processingState.error = `処理に失敗しました（${maxRetries}回の試行後）: ${error.message}`;
        processingState.canResume = true;
        saveJobState(jobId, processingState);
        processingState.lastUpdate = new Date().toISOString();
        break;
      } else {
        const waitTime = Math.min(1000 * Math.pow(2, retryCount - 1), 30000);
        processingState.status = 'paused';
        processingState.error = `一時的なエラーが発生しました。${waitTime/1000}秒後に再試行します...`;
        processingState.lastUpdate = new Date().toISOString();
        saveJobState(jobId, processingState);
        
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
}

/**
 * Vimeo URLの検証と動画情報取得
 */
async function validateVimeoUrl(vimeoUrl) {
  try {
    // Vimeo URLの正規表現パターン
    const vimeoPattern = /(?:vimeo\.com\/)(?:.*\/)?(\d+)/;
    const match = vimeoUrl.match(vimeoPattern);
    
    if (!match) {
      return null;
    }

    const videoId = match[1];
    
    // Vimeo APIを使用して動画情報を取得
    const response = await fetch(`https://api.vimeo.com/videos/${videoId}`, {
      headers: {
        'Authorization': `Bearer ${process.env.VIMEO_ACCESS_TOKEN}`,
        'Accept': 'application/vnd.vimeo.*+json;version=3.4'
      }
    });

    if (!response.ok) {
      throw new Error(`Vimeo API error: ${response.status}`);
    }

    const videoData = await response.json();
    
    // デバッグログを追加
    console.log('Vimeo API response:', {
      videoId,
      name: videoData.name,
      duration: videoData.duration,
      hasPictures: !!videoData.pictures,
      hasEmbed: !!videoData.embed
    });
    
    return {
      videoId,
      title: videoData.name || 'Unknown Title',
      duration: videoData.duration || 0,
      description: videoData.description || '',
      thumbnail: videoData.pictures?.sizes?.[0]?.link || '',
      embed: videoData.embed?.html || ''
    };

  } catch (error) {
    console.error('Vimeo URL validation error:', error);
    return null;
  }
}

/**
 * 音声をチャンクに分割
 */
function splitAudioIntoChunks(duration) {
  // デフォルトの動画長を設定（5分）
  const safeDuration = duration || 300;
  const chunkDuration = 300; // 5分間のチャンク
  const totalChunks = Math.ceil(safeDuration / chunkDuration);
  const chunks = [];

  for (let i = 0; i < totalChunks; i++) {
    const startTime = i * chunkDuration;
    const endTime = Math.min((i + 1) * chunkDuration, safeDuration);
    
    chunks.push({
      id: `chunk_${i}`,
      startTime,
      endTime,
      duration: endTime - startTime,
      status: 'pending',
      result: null,
      error: null
    });
  }

  return chunks;
}

/**
 * チャンクを順次処理
 */
async function processChunksSequentially(chunks, jobId) {
  const processingState = loadJobState(jobId);
  if (!processingState) {
    console.error('Processing state not found for job:', jobId);
    return [];
  }
  
  const results = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    
    try {
      chunk.status = 'processing';
      processingState.lastUpdate = new Date().toISOString();
      saveJobState(jobId, processingState);
      
      // チャンクの音声データを取得して文字起こし
      const result = await processAudioChunk(chunk, processingState.vimeoUrl);
      
      chunk.status = 'completed';
      chunk.result = result;
      processingState.completedChunks++;
      processingState.progress = Math.round((processingState.completedChunks / processingState.totalChunks) * 100);
      processingState.lastUpdate = new Date().toISOString();
      saveJobState(jobId, processingState);
      
      results.push({ status: 'fulfilled', value: result });
      
    } catch (error) {
      chunk.status = 'error';
      chunk.error = error.message;
      processingState.lastUpdate = new Date().toISOString();
      saveJobState(jobId, processingState);
      
      results.push({ status: 'rejected', reason: error });
    }
  }

  return results;
}

/**
 * 個別の音声チャンクを処理
 */
async function processAudioChunk(chunk, vimeoUrl) {
  try {
    // 1. Vimeoから音声データを取得
    const audioResponse = await fetch('/api/get-vimeo-audio', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        vimeoUrl: vimeoUrl,
        startTime: chunk.startTime,
        duration: chunk.duration
      })
    });

    if (!audioResponse.ok) {
      throw new Error('音声データの取得に失敗しました');
    }

    const audioData = await audioResponse.json();
    
    // 2. Speech-to-Text APIで文字起こし
    const transcriptionResponse = await fetch('/api/transcribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audioData: audioData.audioData,
        format: audioData.format,
        startTime: chunk.startTime,
        duration: chunk.duration
      })
    });

    if (!transcriptionResponse.ok) {
      throw new Error('文字起こしに失敗しました');
    }

    const transcriptionResult = await transcriptionResponse.json();
    
    return {
      chunkId: chunk.id,
      startTime: chunk.startTime,
      endTime: chunk.endTime,
      text: transcriptionResult.transcription.text,
      confidence: transcriptionResult.transcription.totalConfidence
    };

  } catch (error) {
    console.error(`Chunk ${chunk.id} processing error:`, error);
    throw error;
  }
}


/**
 * 文字起こし結果を統合
 */
function mergeTranscriptionResults(results) {
  const successfulResults = results
    .filter(result => result.status === 'fulfilled')
    .map(result => result.value)
    .sort((a, b) => a.startTime - b.startTime);

  const fullText = successfulResults.map(chunk => chunk.text).join('\n');
  const totalConfidence = successfulResults.reduce((sum, chunk) => sum + (chunk.confidence || 0), 0) / successfulResults.length;
  
  return {
    fullText,
    averageConfidence: totalConfidence,
    totalChunks: successfulResults.length,
    duration: successfulResults[successfulResults.length - 1]?.endTime || 0,
    chunks: successfulResults,
    processed: true
  };
}

/**
 * 講義録を永続化保存
 */
async function saveLectureRecord(jobId, processingState, finalResult) {
  try {
    const lectureRecord = {
      jobId: jobId,
      title: processingState.lectureInfo?.theme || '講義録',
      duration: finalResult.duration?.toString() || '0',
      confidence: finalResult.averageConfidence || 0,
      fullText: finalResult.fullText || '',
      chunks: finalResult.chunks?.map((chunk, index) => ({
        chunkId: `chunk_${index}`,
        startTime: chunk.startTime || 0,
        endTime: chunk.endTime || 0,
        text: chunk.text || '',
        confidence: chunk.confidence || 0
      })) || [],
      createdAt: processingState.startTime || new Date().toISOString(),
      processed: finalResult.processed || false,
      lectureInfo: processingState.lectureInfo || {},
      videoInfo: processingState.videoInfo || {}
    };
    
    // 講義録を別ファイルに保存
    const recordFile = path.join('/tmp', `record_${jobId}.json`);
    fs.writeFileSync(recordFile, JSON.stringify(lectureRecord, null, 2));
    
    console.log(`Lecture record saved: ${recordFile}`);
    
  } catch (error) {
    console.error('Error saving lecture record:', error);
  }
}

/**
 * ジョブIDを生成
 */
function generateJobId() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * 処理時間を推定
 */
function estimateProcessingTime(duration) {
  // 1分の音声に対して約2-3分の処理時間を想定
  const safeDuration = duration || 300; // デフォルト5分
  return Math.ceil(safeDuration * 2.5);
}
