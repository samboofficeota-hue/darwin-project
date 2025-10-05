/**
 * チャンク文字起こしAPI
 * Cloud Storage上の分割された音声ファイルを文字起こし
 */

import { SpeechClient } from '@google-cloud/speech';
import { Storage } from '@google-cloud/storage';
import { saveJobState, loadJobState } from '../../lib/storage.js';

// Google Cloud クライアントの初期化
const speechClient = new SpeechClient({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'darwin-project-audio-files';

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
    const { userId, sessionId, chunks } = req.body;

    if (!userId || !sessionId || !chunks || !Array.isArray(chunks)) {
      return res.status(400).json({ 
        error: 'userId, sessionId, chunks が必要です' 
      });
    }

    // ジョブIDを生成
    const jobId = `transcribe_${userId}_${sessionId}_${Date.now()}`;
    
    console.log(`Starting transcription job: ${jobId} for ${chunks.length} chunks`);

    // 処理状態を初期化
    const processingState = {
      jobId,
      userId,
      sessionId,
      chunks: chunks.map(chunk => ({
        ...chunk,
        status: 'pending',
        result: null,
        error: null,
        retryCount: 0
      })),
      totalChunks: chunks.length,
      completedChunks: 0,
      status: 'initializing',
      progress: 0,
      startTime: new Date().toISOString(),
      lastUpdate: new Date().toISOString(),
      error: null,
      result: null
    };

    await saveJobState(jobId, processingState);

    // 非同期で処理を開始
    processTranscriptionAsync(jobId);

    res.status(200).json({
      success: true,
      jobId,
      message: '文字起こし処理を開始しました',
      totalChunks: chunks.length
    });

  } catch (error) {
    console.error('Error starting transcription:', error);
    res.status(500).json({
      error: '文字起こしの開始に失敗しました',
      details: error.message
    });
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
  
  try {
    processingState.status = 'processing';
    processingState.lastUpdate = new Date().toISOString();
    await saveJobState(jobId, processingState);

    console.log(`Processing ${processingState.totalChunks} chunks for job: ${jobId}`);

    // 各チャンクを順次処理
    for (let i = 0; i < processingState.chunks.length; i++) {
      const chunk = processingState.chunks[i];
      
      try {
        console.log(`Processing chunk ${i + 1}/${processingState.totalChunks}: ${chunk.chunkId}`);
        
        // チャンクの文字起こし
        const result = await transcribeChunk(chunk);
        
        chunk.status = 'completed';
        chunk.result = result;
        chunk.error = null;
        processingState.completedChunks++;
        processingState.progress = Math.round((processingState.completedChunks / processingState.totalChunks) * 100);
        processingState.lastUpdate = new Date().toISOString();
        await saveJobState(jobId, processingState);
        
        console.log(`Chunk ${chunk.chunkId} completed successfully`);
        
      } catch (error) {
        console.error(`Chunk ${chunk.chunkId} failed:`, error);
        chunk.status = 'error';
        chunk.error = error.message;
        processingState.lastUpdate = new Date().toISOString();
        await saveJobState(jobId, processingState);
      }
    }

    // 結果を統合
    const finalResult = mergeTranscriptionResults(processingState.chunks);
    
    // 処理完了
    processingState.status = 'completed';
    processingState.progress = 100;
    processingState.result = finalResult;
    processingState.lastUpdate = new Date().toISOString();
    await saveJobState(jobId, processingState);
    
    console.log(`Transcription job ${jobId} completed successfully`);

  } catch (error) {
    console.error(`Transcription job ${jobId} failed:`, error);
    processingState.status = 'error';
    processingState.error = error.message;
    processingState.lastUpdate = new Date().toISOString();
    await saveJobState(jobId, processingState);
  }
}

/**
 * 個別のチャンクを文字起こし
 */
async function transcribeChunk(chunk) {
  try {
    console.log(`Transcribing chunk: ${chunk.chunkId}`);
    
    // Cloud Storageからファイルをダウンロード
    const bucket = storage.bucket(BUCKET_NAME);
    const file = bucket.file(chunk.cloudPath);
    
    const [audioBuffer] = await file.download();
    const audioBytes = audioBuffer.toString('base64');

    // 音声設定
    const audio = {
      content: audioBytes,
    };

    const config = {
      encoding: 'LINEAR16',
      sampleRateHertz: 16000,
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

    console.log('Transcription operation started for chunk:', chunk.chunkId, operation.name);

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

    console.log(`Transcription completed for chunk ${chunk.chunkId}: ${fullText.length} characters`);

    return {
      chunkId: chunk.chunkId,
      text: fullText,
      confidence: calculateAverageConfidence(transcriptions),
      duration: 300, // 5分チャンク
      segments: transcriptions
    };

  } catch (error) {
    console.error(`Chunk ${chunk.chunkId} transcription error:`, error);
    throw new Error(`チャンク ${chunk.chunkId} の文字起こしに失敗しました: ${error.message}`);
  }
}

/**
 * 文字起こし結果を統合
 */
function mergeTranscriptionResults(chunks) {
  const successfulResults = chunks
    .filter(chunk => chunk.status === 'completed' && chunk.result)
    .map(chunk => chunk.result)
    .sort((a, b) => a.chunkId.localeCompare(b.chunkId));

  const failedResults = chunks
    .filter(chunk => chunk.status === 'error')
    .map(chunk => ({ chunkId: chunk.chunkId, error: chunk.error }));

  console.log(`Merging results: ${successfulResults.length} successful, ${failedResults.length} failed`);

  if (successfulResults.length === 0) {
    throw new Error('すべてのチャンクの処理に失敗しました');
  }

  // テキストを結合
  const fullText = successfulResults
    .map(chunk => chunk.text)
    .filter(text => text && text.trim().length > 0)
    .join('\n\n');

  // 信頼度の計算
  const totalConfidence = successfulResults.length > 0 
    ? successfulResults.reduce((sum, chunk) => sum + (chunk.confidence || 0), 0) / successfulResults.length
    : 0;

  return {
    fullText,
    averageConfidence: totalConfidence,
    totalChunks: successfulResults.length,
    failedChunks: failedResults.length,
    duration: successfulResults.length * 300, // 5分 × チャンク数
    chunks: successfulResults,
    failedChunkErrors: failedResults,
    processed: true,
    successRate: successfulResults.length / (successfulResults.length + failedResults.length)
  };
}

/**
 * 平均信頼度を計算
 */
function calculateAverageConfidence(transcriptions) {
  if (transcriptions.length === 0) return 0;
  const totalConfidence = transcriptions.reduce((sum, t) => sum + (t.confidence || 0), 0);
  return totalConfidence / transcriptions.length;
}
