/**
 * Vimeo APIを使用した長時間動画の文字起こし機能
 * 中断・再開機能付きの堅牢なシステム
 */

import { SpeechClient } from '@google-cloud/speech';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Google Cloud Speech-to-Text クライアントの初期化
const speechClient = new SpeechClient({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || 'whgc-project',
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

// 処理状態管理用のファイルベースストレージ（一時的な実装）
const fs = require('fs');
const path = require('path');

// 状態をファイルに保存する関数
function saveJobState(jobId, state) {
  try {
    const stateFile = path.join('/tmp', `job_${jobId}.json`);
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('Error saving job state:', error);
  }
}

// 状態をファイルから読み込む関数
function loadJobState(jobId) {
  try {
    const stateFile = path.join('/tmp', `job_${jobId}.json`);
    if (fs.existsSync(stateFile)) {
      const data = fs.readFileSync(stateFile, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading job state:', error);
  }
  return null;
}

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
    const { vimeo_url, resume_job_id, lecture_info } = req.body;

    if (!vimeo_url && !resume_job_id) {
      return res.status(400).json({ error: 'Vimeo URLまたは再開ジョブIDが必要です' });
    }

    // 既存のジョブを再開する場合
    if (resume_job_id) {
      return await resumeTranscriptionJob(resume_job_id, res);
    }

    // 新しいジョブを開始
    return await startNewTranscriptionJob(vimeo_url, lecture_info, res);

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
    
    // 講義情報から動的Phrase Hintsを生成
    const { generateDynamicPhraseHints } = require('../../lib/text-processor');
    const phraseHints = lectureInfo ? generateDynamicPhraseHints(lectureInfo) : [];
    
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
      estimatedDuration: estimateProcessingTime(videoInfo.duration)
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
 * 非同期で文字起こし処理を実行（エラー回復機能付き）
 */
async function processTranscriptionAsync(jobId) {
  const processingState = processingStates.get(jobId);
  const maxRetries = 3;
  let retryCount = 0;
  
  while (retryCount < maxRetries) {
    try {
      processingState.status = 'processing';
      processingState.lastUpdate = new Date().toISOString();
      processingState.retryCount = retryCount;
      saveJobState(jobId, processingState);

      // 1. Vimeoから音声ストリームを取得
      const audioStream = await getVimeoAudioStreamWithRetry(processingState.vimeoUrl, retryCount);
      
      // 2. 音声をチャンクに分割
      const chunks = await splitAudioIntoChunks(audioStream, processingState.videoInfo.duration);
      processingState.chunks = chunks;
      processingState.totalChunks = chunks.length;

      // 3. 各チャンクを並列処理（エラー回復機能付き）
      const transcriptionResults = await processChunksInParallelWithRetry(chunks, jobId, retryCount);
      
      // 4. 結果を統合
      const finalResult = mergeTranscriptionResults(transcriptionResults);
      
      // 5. 処理完了
      processingState.status = 'completed';
      processingState.progress = 100;
      processingState.result = finalResult;
      saveJobState(jobId, processingState);
      processingState.lastUpdate = new Date().toISOString();
      processingState.retryCount = 0; // 成功時はリトライカウントをリセット
      break;

    } catch (error) {
      retryCount++;
      console.error(`Job ${jobId} processing error (attempt ${retryCount}):`, error);
      
      if (retryCount >= maxRetries) {
        processingState.status = 'error';
        processingState.error = `処理に失敗しました（${maxRetries}回の試行後）: ${error.message}`;
        processingState.canResume = true; // 手動で再開可能
        saveJobState(jobId, processingState);
        processingState.lastUpdate = new Date().toISOString();
        break;
      } else {
        // リトライ前の待機時間（指数バックオフ）
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
    
    return {
      videoId,
      title: videoData.name,
      duration: videoData.duration,
      description: videoData.description,
      thumbnail: videoData.pictures?.sizes?.[0]?.link,
      embed: videoData.embed?.html
    };

  } catch (error) {
    console.error('Vimeo URL validation error:', error);
    return null;
  }
}

/**
 * Vimeoから音声ストリームを取得（リトライ機能付き）
 */
async function getVimeoAudioStreamWithRetry(vimeoUrl, retryCount = 0) {
  const maxRetries = 3;
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await getVimeoAudioStream(vimeoUrl);
    } catch (error) {
      lastError = error;
      console.error(`Vimeo audio stream error (attempt ${attempt + 1}):`, error);
      
      if (attempt < maxRetries) {
        // 指数バックオフで待機
        const waitTime = Math.min(1000 * Math.pow(2, attempt), 10000);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  throw new Error(`音声ストリームの取得に失敗しました（${maxRetries + 1}回の試行後）: ${lastError.message}`);
}

/**
 * Vimeoから音声ストリームを取得
 */
async function getVimeoAudioStream(vimeoUrl) {
  try {
    // 実際の実装では、Vimeo APIから音声ストリームのURLを取得
    // ここではプレースホルダーとして実装
    
    const videoId = vimeoUrl.match(/(?:vimeo\.com\/)(?:.*\/)?(\d+)/)[1];
    
    // Vimeo APIで動画ファイルのURLを取得
    const response = await fetch(`https://api.vimeo.com/videos/${videoId}`, {
      headers: {
        'Authorization': `Bearer ${process.env.VIMEO_ACCESS_TOKEN}`,
        'Accept': 'application/vnd.vimeo.*+json;version=3.4'
      }
    });

    if (!response.ok) {
      throw new Error(`Vimeo API error: ${response.status} ${response.statusText}`);
    }

    const videoData = await response.json();
    
    // 音声ストリームのURLを取得（実際の実装では適切なAPIエンドポイントを使用）
    const audioStreamUrl = videoData.download?.[0]?.link;
    
    if (!audioStreamUrl) {
      throw new Error('音声ストリームのURLを取得できませんでした');
    }

    return {
      url: audioStreamUrl,
      format: 'mp4', // または適切な形式
      bitrate: 128000 // または適切なビットレート
    };

  } catch (error) {
    console.error('Vimeo audio stream error:', error);
    throw error;
  }
}

/**
 * 音声をチャンクに分割
 */
async function splitAudioIntoChunks(audioStream, duration) {
  const chunkDuration = 300; // 5分間のチャンク
  const totalChunks = Math.ceil(duration / chunkDuration);
  const chunks = [];

  for (let i = 0; i < totalChunks; i++) {
    const startTime = i * chunkDuration;
    const endTime = Math.min((i + 1) * chunkDuration, duration);
    
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
 * チャンクを並列処理（リトライ機能付き）
 */
async function processChunksInParallelWithRetry(chunks, jobId, retryCount = 0) {
  const processingState = processingStates.get(jobId);
  const results = [];
  const maxConcurrent = 3; // 同時処理数
  const maxRetries = 2; // チャンク単位でのリトライ回数

  for (let i = 0; i < chunks.length; i += maxConcurrent) {
    const batch = chunks.slice(i, i + maxConcurrent);
    
    const batchPromises = batch.map(async (chunk) => {
      let attempt = 0;
      let lastError;
      
      while (attempt <= maxRetries) {
        try {
          chunk.status = 'processing';
          processingState.lastUpdate = new Date().toISOString();
          
          const result = await processAudioChunk(chunk, processingState.vimeoUrl);
          
          chunk.status = 'completed';
          chunk.result = result;
          processingState.completedChunks++;
          processingState.progress = Math.round((processingState.completedChunks / processingState.totalChunks) * 100);
          processingState.lastUpdate = new Date().toISOString();
          
          return result;
          
        } catch (error) {
          lastError = error;
          attempt++;
          console.error(`Chunk ${chunk.id} processing error (attempt ${attempt}):`, error);
          
          if (attempt <= maxRetries) {
            chunk.status = 'retrying';
            chunk.error = `再試行中... (${attempt}/${maxRetries})`;
            processingState.lastUpdate = new Date().toISOString();
            
            // 指数バックオフで待機
            const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          } else {
            chunk.status = 'error';
            chunk.error = `処理に失敗しました（${maxRetries + 1}回の試行後）: ${error.message}`;
            processingState.lastUpdate = new Date().toISOString();
            throw error;
          }
        }
      }
    });

    const batchResults = await Promise.allSettled(batchPromises);
    results.push(...batchResults);
  }

  return results;
}

/**
 * チャンクを並列処理（従来版）
 */
async function processChunksInParallel(chunks, jobId) {
  const processingState = processingStates.get(jobId);
  const results = [];
  const maxConcurrent = 3; // 同時処理数

  for (let i = 0; i < chunks.length; i += maxConcurrent) {
    const batch = chunks.slice(i, i + maxConcurrent);
    
    const batchPromises = batch.map(async (chunk) => {
      try {
        chunk.status = 'processing';
        processingState.lastUpdate = new Date().toISOString();
        
        const result = await processAudioChunk(chunk, processingState.vimeoUrl);
        
        chunk.status = 'completed';
        chunk.result = result;
        processingState.completedChunks++;
        processingState.progress = Math.round((processingState.completedChunks / processingState.totalChunks) * 100);
        processingState.lastUpdate = new Date().toISOString();
        
        return result;
        
      } catch (error) {
        chunk.status = 'error';
        chunk.error = error.message;
        processingState.lastUpdate = new Date().toISOString();
        throw error;
      }
    });

    const batchResults = await Promise.allSettled(batchPromises);
    results.push(...batchResults);
  }

  return results;
}

/**
 * 個別の音声チャンクを処理
 */
async function processAudioChunk(chunk, vimeoUrl) {
  try {
    // 適応的辞書システムを統合
    const { generatePhraseHints, detectLectureDomain } = require('../../lib/text-processor');
    
    // 講義の分野を検出（サンプルテキストから）
    const sampleText = chunk.text || '';
    const domains = detectLectureDomain(sampleText);
    
    // 分野に応じたPhrase Hintsを生成
    const phraseHints = generatePhraseHints(domains);
    
    const config = {
      encoding: 'MP4',
      sampleRateHertz: 44100,
      languageCode: 'ja-JP',
      enableWordTimeOffsets: true,
      enableAutomaticPunctuation: true,
      model: 'latest_long',
      useEnhanced: true,
      // 専門用語を事前に指定
      phraseHints: phraseHints.slice(0, 100), // 100語に制限
      boost: 20.0 // 重要度を20倍にブースト
    };

    // チャンクの音声データを取得（実際の実装では適切な方法で取得）
    const audioData = await getChunkAudioData(chunk, vimeoUrl);
    
    const request = {
      audio: { content: audioData },
      config: config
    };

    const [response] = await speechClient.recognize(request);
    
    const transcription = response.results
      .map(result => result.alternatives[0].transcript)
      .join('\n');

    return {
      chunkId: chunk.id,
      startTime: chunk.startTime,
      endTime: chunk.endTime,
      text: transcription,
      confidence: response.results.reduce((sum, result) => 
        sum + (result.alternatives[0].confidence || 0), 0) / response.results.length
    };

  } catch (error) {
    console.error(`Chunk ${chunk.id} processing error:`, error);
    throw error;
  }
}

/**
 * チャンクの音声データを取得（プレースホルダー）
 */
async function getChunkAudioData(chunk, vimeoUrl) {
  // 実際の実装では、Vimeoから指定された時間範囲の音声データを取得
  // ここではプレースホルダーとして実装
  return Buffer.from('dummy_audio_data').toString('base64');
}

/**
 * 文字起こし結果を統合
 */
function mergeTranscriptionResults(results) {
  const successfulResults = results
    .filter(result => result.status === 'fulfilled')
    .map(result => result.value)
    .sort((a, b) => a.startTime - b.startTime);

  // テキスト処理システムを統合
  const { processLectureRecord } = require('../../lib/text-processor');
  
  const rawData = {
    chunks: successfulResults,
    duration: successfulResults[successfulResults.length - 1]?.endTime || 0
  };
  
  // 高度なテキスト処理を適用
  const processedData = processLectureRecord(rawData);
  
  return {
    fullText: processedData.chunks.map(chunk => chunk.text).join('\n'),
    averageConfidence: processedData.statistics.averageConfidence,
    totalChunks: processedData.statistics.totalChunks,
    duration: processedData.duration,
    chunks: processedData.chunks,
    statistics: processedData.statistics,
    processed: true
  };
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
  return Math.ceil(duration * 2.5);
}
