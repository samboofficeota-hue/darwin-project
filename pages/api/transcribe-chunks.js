/**
 * チャンク文字起こしAPI
 * Cloud Storage上の分割された音声ファイルを文字起こし
 */

import { SpeechClient } from '@google-cloud/speech';
import { Storage } from '@google-cloud/storage';
import { saveJobState, loadJobState } from '../../lib/storage.js';
import { enhanceText } from '../../lib/text-processor.js';

// Google Cloud クライアントの初期化
const speechClient = new SpeechClient({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  credentials: {
    type: 'service_account',
    project_id: process.env.GOOGLE_CLOUD_PROJECT_ID,
    private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    client_id: process.env.GOOGLE_CLIENT_ID,
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
    client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(process.env.GOOGLE_CLIENT_EMAIL || '')}`,
    universe_domain: 'googleapis.com'
  }
});

const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  credentials: {
    type: 'service_account',
    project_id: process.env.GOOGLE_CLOUD_PROJECT_ID,
    private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    client_id: process.env.GOOGLE_CLIENT_ID,
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
    client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(process.env.GOOGLE_CLIENT_EMAIL || '')}`,
    universe_domain: 'googleapis.com'
  }
});

const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'darwin-project-audio-files';

// WAVヘッダからメタ情報を取得（サンプルレート等）
function getWavInfo(buffer) {
  try {
    // 最低でも44バイト（標準WAVヘッダ）
    if (!Buffer.isBuffer(buffer) || buffer.length < 44) {
      return { sampleRate: null, channels: null, bitsPerSample: null };
    }

    // "RIFF" と "WAVE" を簡易確認
    const riff = buffer.toString('ascii', 0, 4);
    const wave = buffer.toString('ascii', 8, 12);
    if (riff !== 'RIFF' || wave !== 'WAVE') {
      return { sampleRate: null, channels: null, bitsPerSample: null };
    }

    const channels = buffer.readUInt16LE(22);        // 2 bytes
    const sampleRate = buffer.readUInt32LE(24);       // 4 bytes
    const bitsPerSample = buffer.readUInt16LE(34);    // 2 bytes

    return { sampleRate, channels, bitsPerSample };
  } catch (e) {
    return { sampleRate: null, channels: null, bitsPerSample: null };
  }
}

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

    console.log('=== Transcribe Chunks API Called ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2).substring(0, 1000));
    console.log('Chunks count:', chunks?.length);
    console.log('First chunk sample:', chunks?.[0]);

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
      chunks: chunks.map((chunk, index) => {
        const chunkId = chunk.chunkId || chunk.id || `chunk_${index}`;
        
        // cloudPathが提供されていない場合はエラー
        if (!chunk.cloudPath) {
          console.error(`Missing cloudPath for chunk ${index}:`, chunk);
          throw new Error(`Chunk ${index} (${chunkId}) にcloudPathが指定されていません`);
        }
        
        return {
          ...chunk,
          chunkId,
          cloudPath: chunk.cloudPath, // 必須
          status: 'pending',
          result: null,
          error: null,
          retryCount: 0
        };
      }),
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
    const mergedResult = mergeTranscriptionResults(processingState.chunks);
    
    // Phase 3: テキストの高度な整形を適用
    console.log('Enhancing transcription text...');
    const enhancedText = enhanceText(mergedResult.fullText, {
      removeFillers: true,
      fixChunkBoundaries: true,
      improveReadability: true,
      addParagraphs: true
    });
    
    const finalResult = {
      ...mergedResult,
      fullText: enhancedText,
      rawText: mergedResult.fullText, // 元のテキストも保存
      enhanced: true
    };
    
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
    console.log(`Cloud Path: ${chunk.cloudPath}`);
    console.log(`Bucket Name: ${BUCKET_NAME}`);
    
    // Cloud Storageからファイルをダウンロード
    const bucket = storage.bucket(BUCKET_NAME);
    const file = bucket.file(chunk.cloudPath);
    
    // ファイルの存在確認
    const [exists] = await file.exists();
    console.log(`File exists in GCS: ${exists}`);
    
    if (!exists) {
      throw new Error(`ファイルが見つかりません: ${chunk.cloudPath} in bucket ${BUCKET_NAME}`);
    }
    
    const [audioBuffer] = await file.download();
    console.log(`Downloaded ${audioBuffer.length} bytes from GCS`);

    // WAVヘッダから実サンプルレートを取得し、STT設定へ反映
    const wavInfo = getWavInfo(audioBuffer);
    const detectedSampleRate = wavInfo.sampleRate || 48000; // フォールバック: 48kHz
    if (wavInfo.sampleRate) {
      console.log(`Detected WAV sampleRate=${wavInfo.sampleRate}, channels=${wavInfo.channels}, bits=${wavInfo.bitsPerSample}`);
    } else {
      console.warn('WAV header not detected. Falling back to 48000 Hz');
    }

    const audioBytes = audioBuffer.toString('base64');

    // 音声設定
    const audio = {
      content: audioBytes,
    };

    const config = {
      encoding: 'LINEAR16',
      sampleRateHertz: detectedSampleRate,
      languageCode: 'ja-JP',
      // 安全な最小構成。拡張モデル指定は一旦外す
      enableAutomaticPunctuation: true,
      enableWordTimeOffsets: true,
      enableWordConfidence: true,
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
    .sort((a, b) => {
      // チャンクIDから数値を抽出して正しくソート
      const aNum = parseInt(a.chunkId.match(/\d+/)?.[0] || '0');
      const bNum = parseInt(b.chunkId.match(/\d+/)?.[0] || '0');
      return aNum - bNum;
    });

  const failedResults = chunks
    .filter(chunk => chunk.status === 'error')
    .map(chunk => ({ chunkId: chunk.chunkId, error: chunk.error }));

  console.log(`Merging results: ${successfulResults.length} successful, ${failedResults.length} failed`);

  if (successfulResults.length === 0) {
    throw new Error('すべてのチャンクの処理に失敗しました');
  }

  // テキストを結合（チャンク間は改行で区切る）
  const fullText = successfulResults
    .map(chunk => chunk.text)
    .filter(text => text && text.trim().length > 0)
    .join('\n\n');

  // 実際の総時間を計算（各チャンクのdurationを使用）
  const totalDuration = successfulResults.reduce((sum, chunk) => sum + (chunk.duration || 180), 0);

  // 信頼度の計算
  const totalConfidence = successfulResults.length > 0 
    ? successfulResults.reduce((sum, chunk) => sum + (chunk.confidence || 0), 0) / successfulResults.length
    : 0;

  return {
    fullText,
    averageConfidence: totalConfidence,
    totalChunks: successfulResults.length,
    failedChunks: failedResults.length,
    duration: totalDuration,
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
