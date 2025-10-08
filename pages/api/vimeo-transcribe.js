/**
 * Vimeo APIを使用した長時間動画の文字起こし機能
 * 実際に動作する完全な実装
 */

import crypto from 'crypto';
import { saveJobState, loadJobState, updateJobState } from '../../lib/storage.js';
import { getConfig } from '../../lib/config.js';
import { 
  InputValidator, 
  generateSecureJobId, 
  validateRequest,
  PrivacyProtection 
} from '../../lib/security.js';
import { performanceMonitor } from '../../lib/monitoring.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};

export default async function handler(req, res) {
  const operationId = `vimeo-transcribe-${Date.now()}`;
  performanceMonitor.startTimer(operationId);
  performanceMonitor.recordRequest();

  // セキュリティヘッダー設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    performanceMonitor.endTimer(operationId, { error: 'Method not allowed' });
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // リクエスト検証
    validateRequest(req);
    
    const { vimeoUrl, resume_job_id, lecture_info } = req.body;

    if (!vimeoUrl && !resume_job_id) {
      return res.status(400).json({ error: 'Vimeo URLまたは再開ジョブIDが必要です' });
    }

    // 入力値の検証とサニタイズ
    if (vimeoUrl) {
      InputValidator.validateVimeoUrl(vimeoUrl);
    }
    
    if (resume_job_id) {
      InputValidator.validateJobId(resume_job_id);
    }
    
    if (lecture_info) {
      InputValidator.validateLectureInfo(lecture_info);
      // 個人情報をサニタイズ
      lecture_info.theme = InputValidator.sanitizeString(lecture_info.theme);
      if (lecture_info.speaker) {
        lecture_info.speaker.name = InputValidator.sanitizeString(lecture_info.speaker.name);
        lecture_info.speaker.title = InputValidator.sanitizeString(lecture_info.speaker.title);
        lecture_info.speaker.bio = InputValidator.sanitizeString(lecture_info.speaker.bio);
      }
      if (lecture_info.description) {
        lecture_info.description = InputValidator.sanitizeString(lecture_info.description);
      }
    }

    // 既存のジョブを再開する場合
    if (resume_job_id) {
      const result = await resumeTranscriptionJob(resume_job_id, res);
      performanceMonitor.endTimer(operationId, { 
        type: 'resume_job', 
        jobId: resume_job_id,
        success: true 
      });
      return result;
    }

    // 新しいジョブを開始
    const result = await startNewTranscriptionJob(vimeoUrl, lecture_info, res);
    performanceMonitor.endTimer(operationId, { 
      type: 'new_job', 
      vimeoUrl: vimeoUrl ? 'provided' : 'not_provided',
      success: true 
    });
    performanceMonitor.recordJob('started');
    return result;

  } catch (error) {
    console.error('Vimeo transcription error:', error);
    performanceMonitor.endTimer(operationId, { 
      error: error.message,
      success: false 
    });
    performanceMonitor.recordRequest(false);
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
    // セキュアなジョブIDを生成
    const jobId = generateSecureJobId();
    
    // Vimeo URLの検証（validate-vimeo-url.jsのAPIを呼び出し）
    const validateResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'https://darwin-project-574364248563.asia-northeast1.run.app'}/api/validate-vimeo-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: vimeoUrl })
    });
    
    if (!validateResponse.ok) {
      return res.status(400).json({ error: 'Vimeo URLの検証に失敗しました' });
    }
    
    const validateData = await validateResponse.json();
    if (!validateData.valid) {
      return res.status(400).json({ error: '無効なVimeo URLです' });
    }
    
    const videoInfo = {
      videoId: validateData.videoId,
      title: validateData.title,
      duration: validateData.duration,
      description: validateData.description,
      thumbnail: validateData.thumbnail,
      embed: validateData.embed
    };

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

    // プライバシー保護のための自動削除スケジュール
    PrivacyProtection.scheduleDataCleanup(jobId);

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
  let processingState = await loadJobState(jobId);
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
      await saveJobState(jobId, processingState);

      // デバッグログを追加
      console.log('Processing state:', {
        jobId,
        hasVideoInfo: !!processingState.videoInfo,
        videoInfo: processingState.videoInfo,
        duration: processingState.videoInfo?.duration
      });
      
      // 1. 音声をチャンクに分割
      const chunks = splitAudioIntoChunks(processingState.videoInfo?.duration || 0);
      
      processingState.chunks = chunks;
      processingState.totalChunks = chunks.length;
      processingState.lastUpdate = new Date().toISOString();
      await saveJobState(jobId, processingState);

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
      await saveJobState(jobId, processingState);
      
      // パフォーマンス監視
      performanceMonitor.recordJob('completed');
      
      break;

    } catch (error) {
      retryCount++;
      console.error(`Job ${jobId} processing error (attempt ${retryCount}):`, error);
      
      if (retryCount >= maxRetries) {
        processingState.status = 'error';
        processingState.error = `処理に失敗しました（${maxRetries}回の試行後）: ${error.message}`;
        processingState.canResume = true;
        processingState.lastUpdate = new Date().toISOString();
        await saveJobState(jobId, processingState);
        
        // パフォーマンス監視
        performanceMonitor.recordJob('failed');
        
        break;
      } else {
        const waitTime = Math.min(1000 * Math.pow(2, retryCount - 1), 30000);
        processingState.status = 'paused';
        processingState.error = `一時的なエラーが発生しました。${waitTime/1000}秒後に再試行します...`;
        processingState.lastUpdate = new Date().toISOString();
        await saveJobState(jobId, processingState);
        
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
}

// validateVimeoUrl関数は削除（validate-vimeo-url.jsのAPIを使用）

/**
 * 音声をチャンクに分割（設定ベース）
 */
function splitAudioIntoChunks(duration) {
  const appConfig = getConfig();
  const safeDuration = duration || 300; // デフォルト5分
  
  // チャンクサイズを動的に調整
  let chunkDuration;
  if (safeDuration <= 600) { // 10分以下
    chunkDuration = appConfig.audio.chunkDuration.small;
  } else if (safeDuration <= 1800) { // 30分以下
    chunkDuration = appConfig.audio.chunkDuration.medium;
  } else { // 30分以上
    chunkDuration = appConfig.audio.chunkDuration.large;
  }
  
  const totalChunks = Math.ceil(safeDuration / chunkDuration);
  const chunks = [];

  console.log(`Splitting ${safeDuration}s audio into ${totalChunks} chunks of ${chunkDuration}s each`);

  for (let i = 0; i < totalChunks; i++) {
    const startTime = i * chunkDuration;
    const endTime = Math.min((i + 1) * chunkDuration, safeDuration);
    const actualDuration = endTime - startTime;
    
    chunks.push({
      id: `chunk_${i}`,
      startTime,
      endTime,
      duration: actualDuration,
      status: 'pending',
      result: null,
      error: null,
      retryCount: 0,
      maxRetries: 3
    });
  }

  return chunks;
}

/**
 * チャンクを順次処理（改善版）
 * リトライ機能とエラーハンドリングを強化
 */
async function processChunksSequentially(chunks, jobId) {
  const processingState = loadJobState(jobId);
  if (!processingState) {
    console.error('Processing state not found for job:', jobId);
    return [];
  }
  
  const results = [];
  
  // メモリ使用量の監視
  function logMemoryUsage(stage) {
    const usage = process.memoryUsage();
    console.log(`Memory usage at ${stage}:`, {
      rss: Math.round(usage.rss / 1024 / 1024) + 'MB',
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + 'MB',
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
      external: Math.round(usage.external / 1024 / 1024) + 'MB'
    });
  }
  
  logMemoryUsage('chunk processing start');

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    
    // リトライループ
    let success = false;
    let lastError = null;
    
    while (chunk.retryCount < chunk.maxRetries && !success) {
      try {
        chunk.status = 'processing';
        chunk.retryCount++;
        processingState.lastUpdate = new Date().toISOString();
        await saveJobState(jobId, processingState);
        
        console.log(`Processing chunk ${chunk.id} (attempt ${chunk.retryCount}/${chunk.maxRetries})`);
        
        // チャンクの音声データを取得して文字起こし
        const result = await processAudioChunk(chunk, processingState.vimeoUrl);
        
        chunk.status = 'completed';
        chunk.result = result;
        chunk.error = null;
        processingState.completedChunks++;
        processingState.progress = Math.round((processingState.completedChunks / processingState.totalChunks) * 100);
        processingState.lastUpdate = new Date().toISOString();
        await saveJobState(jobId, processingState);
        
        results.push({ status: 'fulfilled', value: result });
        success = true;
        
        console.log(`Chunk ${chunk.id} completed successfully`);
        
        // メモリ使用量をチェック
        logMemoryUsage(`chunk ${chunk.id} completed`);
        
        // 高メモリ使用時はガベージコレクションを実行
        const usage = process.memoryUsage();
        if (usage.rss > 1024 * 1024 * 1024) { // 1GB以上
          if (global.gc) {
            global.gc();
            console.log('Forced garbage collection after chunk completion');
          }
        }
        
      } catch (error) {
        lastError = error;
        chunk.error = error.message;
        processingState.lastUpdate = new Date().toISOString();
        await saveJobState(jobId, processingState);
        
        console.error(`Chunk ${chunk.id} failed (attempt ${chunk.retryCount}/${chunk.maxRetries}):`, error.message);
        
        // リトライ前の待機時間（指数バックオフ）
        if (chunk.retryCount < chunk.maxRetries) {
          const waitTime = Math.min(1000 * Math.pow(2, chunk.retryCount - 1), 10000);
          console.log(`Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
    
    // 最終的に失敗した場合
    if (!success) {
      chunk.status = 'error';
      processingState.lastUpdate = new Date().toISOString();
      await saveJobState(jobId, processingState);
      
      results.push({ status: 'rejected', reason: lastError });
      console.error(`Chunk ${chunk.id} failed after ${chunk.maxRetries} attempts`);
    }
  }
  
  logMemoryUsage('chunk processing end');

  return results;
}

/**
 * 個別の音声チャンクを処理（改善版）
 * タイムアウトとエラーハンドリングを強化
 */
async function processAudioChunk(chunk, vimeoUrl) {
  try {
    console.log(`Processing chunk ${chunk.id}: ${chunk.startTime}s - ${chunk.endTime}s (${chunk.duration}s)`);
    
    // 1. Vimeoから音声データを取得（タイムアウト付き）
    const audioController = new AbortController();
    const audioTimeout = setTimeout(() => audioController.abort(), 60000); // 60秒タイムアウト
    
    const audioResponse = await fetch('/api/get-vimeo-audio', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        vimeoUrl: vimeoUrl,
        startTime: chunk.startTime,
        duration: chunk.duration
      }),
      signal: audioController.signal
    });

    clearTimeout(audioTimeout);

    if (!audioResponse.ok) {
      const errorText = await audioResponse.text();
      throw new Error(`音声データの取得に失敗しました: ${audioResponse.status} - ${errorText}`);
    }

    const audioData = await audioResponse.json();
    
    if (!audioData.success || !audioData.audioData) {
      throw new Error('音声データが正しく取得できませんでした');
    }
    
    console.log(`Audio data retrieved for chunk ${chunk.id}: ${audioData.audioData.length} characters`);
    
    // 2. Speech-to-Text APIで文字起こし（タイムアウト付き）
    const transcriptionController = new AbortController();
    const transcriptionTimeout = setTimeout(() => transcriptionController.abort(), 120000); // 120秒タイムアウト
    
    const transcriptionResponse = await fetch('/api/transcribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audioData: audioData.audioData,
        format: audioData.format || 'wav',
        startTime: chunk.startTime,
        duration: chunk.duration
      }),
      signal: transcriptionController.signal
    });

    clearTimeout(transcriptionTimeout);

    if (!transcriptionResponse.ok) {
      const errorText = await transcriptionResponse.text();
      throw new Error(`文字起こしに失敗しました: ${transcriptionResponse.status} - ${errorText}`);
    }

    const transcriptionResult = await transcriptionResponse.json();
    
    if (!transcriptionResult.transcription || !transcriptionResult.transcription.text) {
      throw new Error('文字起こし結果が正しく取得できませんでした');
    }
    
    console.log(`Transcription completed for chunk ${chunk.id}: ${transcriptionResult.transcription.text.length} characters`);
    
    return {
      chunkId: chunk.id,
      startTime: chunk.startTime,
      endTime: chunk.endTime,
      text: transcriptionResult.transcription.text,
      confidence: transcriptionResult.transcription.totalConfidence || 0.8,
      duration: chunk.duration
    };

  } catch (error) {
    console.error(`Chunk ${chunk.id} processing error:`, error);
    
    // エラーの種類に応じて詳細なメッセージを提供
    if (error.name === 'AbortError') {
      throw new Error(`チャンク ${chunk.id} の処理がタイムアウトしました`);
    } else if (error.message.includes('fetch')) {
      throw new Error(`チャンク ${chunk.id} のネットワーク通信に失敗しました: ${error.message}`);
    } else {
      throw new Error(`チャンク ${chunk.id} の処理に失敗しました: ${error.message}`);
    }
  }
}


/**
 * 文字起こし結果を統合（改善版）
 * エラーハンドリングと品質チェックを強化
 */
function mergeTranscriptionResults(results) {
  const successfulResults = results
    .filter(result => result.status === 'fulfilled')
    .map(result => result.value)
    .sort((a, b) => a.startTime - b.startTime);

  const failedResults = results
    .filter(result => result.status === 'rejected')
    .map(result => result.reason);

  console.log(`Merging results: ${successfulResults.length} successful, ${failedResults.length} failed`);

  if (successfulResults.length === 0) {
    throw new Error('すべてのチャンクの処理に失敗しました');
  }

  // テキストを結合（重複を避けるため、時間順にソート）
  const fullText = successfulResults
    .map(chunk => chunk.text)
    .filter(text => text && text.trim().length > 0)
    .join('\n\n');

  // 信頼度の計算
  const totalConfidence = successfulResults.length > 0 
    ? successfulResults.reduce((sum, chunk) => sum + (chunk.confidence || 0), 0) / successfulResults.length
    : 0;

  // 処理統計
  const totalDuration = successfulResults.length > 0 
    ? successfulResults[successfulResults.length - 1].endTime 
    : 0;

  const processedDuration = successfulResults.reduce((sum, chunk) => sum + (chunk.duration || 0), 0);
  
  return {
    fullText,
    averageConfidence: totalConfidence,
    totalChunks: successfulResults.length,
    failedChunks: failedResults.length,
    duration: totalDuration,
    processedDuration,
    chunks: successfulResults,
    failedChunkErrors: failedResults.map(error => error.message),
    processed: true,
    successRate: successfulResults.length / (successfulResults.length + failedResults.length)
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
 * 処理時間を推定
 */
function estimateProcessingTime(duration) {
  // 1分の音声に対して約2-3分の処理時間を想定
  const safeDuration = duration || 300; // デフォルト5分
  return Math.ceil(safeDuration * 2.5);
}
