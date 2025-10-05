/**
 * MP3音声ファイルの文字起こし機能
 * CloudRun + チャンク分割による効率的な処理
 */

import crypto from 'crypto';
import { saveJobState, loadJobState, updateJobState } from '../../lib/storage.js';
import { SpeechClient } from '@google-cloud/speech';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

// Google Cloud Speech-to-Text クライアントの初期化
const speechClient = new SpeechClient({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || 'whgc-project',
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '100mb', // MP3ファイル用にサイズ制限を拡大
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
    const { audioFile, resume_job_id, audioInfo } = req.body;

    if (!audioFile && !resume_job_id) {
      return res.status(400).json({ error: '音声ファイルまたは再開ジョブIDが必要です' });
    }

    // 既存のジョブを再開する場合
    if (resume_job_id) {
      return await resumeTranscriptionJob(resume_job_id, res);
    }

    // 新しいジョブを開始
    return await startNewTranscriptionJob(audioFile, audioInfo, res);

  } catch (error) {
    console.error('Audio transcription error:', error);
    res.status(500).json({
      error: '文字起こしエラーが発生しました',
      details: error.message
    });
  }
}

/**
 * 新しい文字起こしジョブを開始
 */
async function startNewTranscriptionJob(audioFile, audioInfo, res) {
  try {
    // ジョブIDを生成
    const jobId = generateJobId();
    
    // 音声ファイルの検証
    if (!audioFile || !audioFile.startsWith('data:audio/mp3;base64,')) {
      return res.status(400).json({ error: 'MP3形式の音声ファイルが必要です' });
    }

    // Base64デコードして一時ファイルに保存
    const audioBuffer = Buffer.from(audioFile.split(',')[1], 'base64');
    const tempAudioPath = path.join('/tmp', `audio_${jobId}.mp3`);
    fs.writeFileSync(tempAudioPath, audioBuffer);

    // 音声ファイルの情報を取得
    const audioMetadata = await getAudioMetadata(tempAudioPath);
    
    // 処理状態を初期化
    const processingState = {
      jobId,
      audioInfo: audioInfo || {},
      audioMetadata,
      tempAudioPath,
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

    await saveJobState(jobId, processingState);

    // 非同期で処理を開始
    processTranscriptionAsync(jobId);

    res.status(200).json({
      status: 'started',
      jobId,
      message: '音声文字起こし処理を開始しました',
      estimatedDuration: estimateProcessingTime(audioMetadata.duration || 0),
      audioMetadata
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
    const processingState = await loadJobState(jobId);
    
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
    await saveJobState(jobId, processingState);
    
    // 非同期で処理を再開
    processTranscriptionAsync(jobId);

    res.status(200).json({
      status: 'resumed',
      jobId,
      message: '音声文字起こし処理を再開しました',
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

      console.log('Processing audio file:', {
        jobId,
        duration: processingState.audioMetadata?.duration,
        tempPath: processingState.tempAudioPath
      });
      
      // 1. 音声をチャンクに分割
      const chunks = await splitAudioIntoChunks(
        processingState.tempAudioPath, 
        processingState.audioMetadata.duration
      );
      
      processingState.chunks = chunks;
      processingState.totalChunks = chunks.length;
      processingState.lastUpdate = new Date().toISOString();
      await saveJobState(jobId, processingState);

      // 2. 各チャンクを順次処理
      const transcriptionResults = await processChunksSequentially(chunks, jobId);
      
      // 3. 結果を統合
      const finalResult = mergeTranscriptionResults(transcriptionResults);
      
      // 4. 一時ファイルをクリーンアップ
      await cleanupTempFiles(processingState.tempAudioPath, chunks);
      
      // 5. 処理完了
      processingState.status = 'completed';
      processingState.progress = 100;
      processingState.result = finalResult;
      processingState.lastUpdate = new Date().toISOString();
      processingState.retryCount = 0;
      await saveJobState(jobId, processingState);
      
      break;

    } catch (error) {
      retryCount++;
      console.error(`Job ${jobId} processing error (attempt ${retryCount}):`, error);
      
      if (retryCount >= maxRetries) {
        processingState.status = 'error';
        processingState.error = `処理に失敗しました（${maxRetries}回の試行後）: ${error.message}`;
        processingState.canResume = true;
        await saveJobState(jobId, processingState);
        processingState.lastUpdate = new Date().toISOString();
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

/**
 * 音声ファイルのメタデータを取得
 */
async function getAudioMetadata(audioPath) {
  try {
    const { stdout } = await execAsync(`ffprobe -v quiet -print_format json -show_format -show_streams "${audioPath}"`);
    const metadata = JSON.parse(stdout);
    
    const audioStream = metadata.streams.find(stream => stream.codec_type === 'audio');
    const duration = parseFloat(metadata.format.duration) || 0;
    
    return {
      duration,
      sampleRate: audioStream?.sample_rate || 44100,
      channels: audioStream?.channels || 2,
      bitrate: audioStream?.bit_rate || metadata.format.bit_rate,
      format: metadata.format.format_name,
      size: metadata.format.size
    };
  } catch (error) {
    console.error('Error getting audio metadata:', error);
    return {
      duration: 0,
      sampleRate: 44100,
      channels: 2,
      bitrate: 128000,
      format: 'mp3',
      size: 0
    };
  }
}

/**
 * 音声をチャンクに分割（MP3専用最適化版）
 */
async function splitAudioIntoChunks(audioPath, duration) {
  const safeDuration = duration || 300; // デフォルト5分
  
  // チャンクサイズを動的に調整
  let chunkDuration;
  if (safeDuration <= 600) { // 10分以下
    chunkDuration = 120; // 2分チャンク
  } else if (safeDuration <= 1800) { // 30分以下
    chunkDuration = 300; // 5分チャンク
  } else { // 30分以上
    chunkDuration = 600; // 10分チャンク
  }
  
  const totalChunks = Math.ceil(safeDuration / chunkDuration);
  const chunks = [];

  console.log(`Splitting ${safeDuration}s audio into ${totalChunks} chunks of ${chunkDuration}s each`);

  for (let i = 0; i < totalChunks; i++) {
    const startTime = i * chunkDuration;
    const endTime = Math.min((i + 1) * chunkDuration, safeDuration);
    const actualDuration = endTime - startTime;
    
    const chunkPath = path.join('/tmp', `chunk_${i}_${Date.now()}.mp3`);
    
    chunks.push({
      id: `chunk_${i}`,
      startTime,
      endTime,
      duration: actualDuration,
      chunkPath,
      status: 'pending',
      result: null,
      error: null,
      retryCount: 0,
      maxRetries: 3
    });
  }

  // FFmpegで実際にチャンクファイルを作成
  await createChunkFiles(audioPath, chunks);

  return chunks;
}

/**
 * FFmpegでチャンクファイルを作成
 */
async function createChunkFiles(audioPath, chunks) {
  const createPromises = chunks.map(async (chunk) => {
    try {
      const command = `ffmpeg -i "${audioPath}" -ss ${chunk.startTime} -t ${chunk.duration} -c copy "${chunk.chunkPath}" -y`;
      await execAsync(command);
      console.log(`Created chunk file: ${chunk.chunkPath}`);
    } catch (error) {
      console.error(`Error creating chunk ${chunk.id}:`, error);
      throw error;
    }
  });

  await Promise.all(createPromises);
}

/**
 * チャンクを順次処理
 */
async function processChunksSequentially(chunks, jobId) {
  const processingState = await loadJobState(jobId);
  if (!processingState) {
    console.error('Processing state not found for job:', jobId);
    return [];
  }
  
  const results = [];

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
        
        // チャンクの文字起こし
        const result = await transcribeAudioChunk(chunk);
        
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

  return results;
}

/**
 * 個別の音声チャンクを文字起こし
 */
async function transcribeAudioChunk(chunk) {
  try {
    console.log(`Transcribing chunk ${chunk.id}: ${chunk.startTime}s - ${chunk.endTime}s (${chunk.duration}s)`);
    
    // チャンクファイルを読み込み
    const audioBuffer = fs.readFileSync(chunk.chunkPath);
    const audioBytes = audioBuffer.toString('base64');

    // 音声設定（MP3専用）
    const audio = {
      content: audioBytes,
    };

    const config = {
      encoding: 'MP3',
      sampleRateHertz: 44100,
      languageCode: 'ja-JP',
      alternativeLanguageCodes: ['en-US'],
      enableAutomaticPunctuation: true,
      enableWordTimeOffsets: true,
      enableWordConfidence: true,
      model: 'latest_long',
      useEnhanced: true,
    };

    // 文字起こしの実行
    const [operation] = await speechClient.longRunningRecognize({
      audio: audio,
      config: config,
    });

    console.log('Transcription operation started for chunk:', chunk.id, operation.name);

    // 非同期処理の完了を待機
    const [response] = await operation.promise();

    // 結果の処理
    const results = response.results || [];
    const transcriptions = results.map(result => ({
      text: result.alternatives[0].transcript,
      confidence: result.alternatives[0].confidence,
      words: result.alternatives[0].words || []
    }));

    // 全体のテキストを結合
    const fullText = transcriptions.map(t => t.text).join(' ');

    console.log(`Transcription completed for chunk ${chunk.id}: ${fullText.length} characters`);

    return {
      chunkId: chunk.id,
      startTime: chunk.startTime,
      endTime: chunk.endTime,
      text: fullText,
      confidence: calculateAverageConfidence(transcriptions),
      duration: chunk.duration,
      segments: transcriptions
    };

  } catch (error) {
    console.error(`Chunk ${chunk.id} transcription error:`, error);
    throw new Error(`チャンク ${chunk.id} の文字起こしに失敗しました: ${error.message}`);
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
 * 一時ファイルをクリーンアップ
 */
async function cleanupTempFiles(audioPath, chunks) {
  try {
    // 元の音声ファイルを削除
    if (fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
      console.log('Cleaned up original audio file:', audioPath);
    }

    // チャンクファイルを削除
    for (const chunk of chunks) {
      if (fs.existsSync(chunk.chunkPath)) {
        fs.unlinkSync(chunk.chunkPath);
        console.log('Cleaned up chunk file:', chunk.chunkPath);
      }
    }
  } catch (error) {
    console.error('Error cleaning up temp files:', error);
  }
}

/**
 * 平均信頼度を計算
 */
function calculateAverageConfidence(transcriptions) {
  if (transcriptions.length === 0) return 0;
  const totalConfidence = transcriptions.reduce((sum, t) => sum + (t.confidence || 0), 0);
  return totalConfidence / transcriptions.length;
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
