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

// 処理状態管理用のデータベース（実際の実装では外部DBを使用）
const processingStates = new Map();

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
    const { vimeo_url, resume_job_id } = req.body;

    if (!vimeo_url && !resume_job_id) {
      return res.status(400).json({ error: 'Vimeo URLまたは再開ジョブIDが必要です' });
    }

    // 既存のジョブを再開する場合
    if (resume_job_id) {
      return await resumeTranscriptionJob(resume_job_id, res);
    }

    // 新しいジョブを開始
    return await startNewTranscriptionJob(vimeo_url, res);

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
async function startNewTranscriptionJob(vimeoUrl, res) {
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

    processingStates.set(jobId, processingState);

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
    const processingState = processingStates.get(jobId);
    
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
  const processingState = processingStates.get(jobId);
  
  try {
    processingState.status = 'processing';
    processingState.lastUpdate = new Date().toISOString();

    // 1. Vimeoから音声ストリームを取得
    const audioStream = await getVimeoAudioStream(processingState.vimeoUrl);
    
    // 2. 音声をチャンクに分割
    const chunks = await splitAudioIntoChunks(audioStream, processingState.videoInfo.duration);
    processingState.chunks = chunks;
    processingState.totalChunks = chunks.length;

    // 3. 各チャンクを並列処理
    const transcriptionResults = await processChunksInParallel(chunks, jobId);
    
    // 4. 結果を統合
    const finalResult = mergeTranscriptionResults(transcriptionResults);
    
    // 5. 処理完了
    processingState.status = 'completed';
    processingState.progress = 100;
    processingState.result = finalResult;
    processingState.lastUpdate = new Date().toISOString();

  } catch (error) {
    console.error(`Job ${jobId} processing error:`, error);
    processingState.status = 'error';
    processingState.error = error.message;
    processingState.lastUpdate = new Date().toISOString();
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
 * チャンクを並列処理
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
    // 実際の実装では、チャンクの音声データを取得してSpeech-to-Text APIに送信
    // ここではプレースホルダーとして実装
    
    const config = {
      encoding: 'MP4',
      sampleRateHertz: 44100,
      languageCode: 'ja-JP',
      enableWordTimeOffsets: true,
      enableAutomaticPunctuation: true,
      model: 'latest_long',
      useEnhanced: true
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

  const fullText = successfulResults
    .map(result => result.text)
    .join('\n');

  const averageConfidence = successfulResults
    .reduce((sum, result) => sum + result.confidence, 0) / successfulResults.length;

  return {
    fullText,
    averageConfidence,
    totalChunks: successfulResults.length,
    duration: successfulResults[successfulResults.length - 1]?.endTime || 0,
    chunks: successfulResults
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
