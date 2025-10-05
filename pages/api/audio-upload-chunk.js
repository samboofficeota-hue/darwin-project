/**
 * チャンクアップロード用API
 * 大きなファイルを小さなチャンクに分割してアップロード
 */

import { saveJobState, loadJobState, updateJobState } from '../../lib/storage.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb', // チャンクサイズ制限
    },
  },
  // Vercel関数の設定
  maxDuration: 300, // 5分
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
    const { 
      chunkData, 
      chunkIndex, 
      totalChunks, 
      fileName, 
      fileSize, 
      uploadId,
      isLastChunk = false 
    } = req.body;

    if (!chunkData || chunkIndex === undefined || !totalChunks || !fileName || !uploadId) {
      return res.status(400).json({ 
        error: '必要なパラメータが不足しています',
        received: {
          chunkData: !!chunkData,
          chunkIndex,
          totalChunks,
          fileName,
          uploadId
        }
      });
    }

    // Base64データの検証
    if (typeof chunkData !== 'string' || chunkData.length === 0) {
      return res.status(400).json({ 
        error: 'チャンクデータが無効です',
        chunkIndex,
        dataType: typeof chunkData,
        dataLength: chunkData?.length || 0
      });
    }

    // チャンクインデックスの検証
    if (chunkIndex < 0 || chunkIndex >= totalChunks) {
      return res.status(400).json({ 
        error: 'チャンクインデックスが無効です',
        chunkIndex,
        totalChunks
      });
    }

    // アップロードセッションの状態を管理
    const sessionKey = `upload_${uploadId}`;
    let uploadSession = await loadJobState(sessionKey) || {
      uploadId,
      fileName,
      fileSize,
      totalChunks,
      receivedChunks: [],
      chunks: {},
      status: 'uploading',
      startTime: new Date().toISOString()
    };

    // チャンクを保存
    const chunkKey = `chunk_${chunkIndex}`;
    uploadSession.chunks[chunkKey] = chunkData;
    uploadSession.receivedChunks.push(chunkIndex);
    uploadSession.lastUpdate = new Date().toISOString();

    console.log(`Chunk ${chunkIndex + 1}/${totalChunks} received for ${fileName}`, {
      uploadId,
      chunkSize: chunkData.length,
      totalReceived: uploadSession.receivedChunks.length,
      isLastChunk
    });

    // 全チャンクが受信されたかチェック
    if (uploadSession.receivedChunks.length === totalChunks) {
      console.log(`All chunks received for ${fileName}, starting reconstruction...`);
      uploadSession.status = 'completed';
      
      try {
        // チャンクを結合してファイルを再構築
        const reconstructedFile = await reconstructFile(uploadSession);
        uploadSession.reconstructedFile = reconstructedFile;
        
        // 文字起こしジョブを開始
        const transcriptionJobId = await startTranscriptionJob(uploadSession);
        uploadSession.transcriptionJobId = transcriptionJobId;
        
        console.log(`Transcription job started: ${transcriptionJobId}`);
      } catch (reconstructionError) {
        console.error('File reconstruction failed:', reconstructionError);
        uploadSession.status = 'failed';
        uploadSession.error = reconstructionError.message;
      }
    }

    await saveJobState(sessionKey, uploadSession);

    res.status(200).json({
      status: 'success',
      chunkIndex,
      totalChunks,
      receivedChunks: uploadSession.receivedChunks.length,
      uploadStatus: uploadSession.status,
      transcriptionJobId: uploadSession.transcriptionJobId
    });

  } catch (error) {
    console.error('Chunk upload error:', error);
    console.error('Error stack:', error.stack);
    
    // 環境変数の確認
    console.log('Environment check:');
    console.log('- VERCEL:', process.env.VERCEL);
    console.log('- KV_REST_API_URL:', process.env.KV_REST_API_URL ? 'Set' : 'Not set');
    console.log('- KV_REST_API_TOKEN:', process.env.KV_REST_API_TOKEN ? 'Set' : 'Not set');
    console.log('- GOOGLE_APPLICATION_CREDENTIALS:', process.env.GOOGLE_APPLICATION_CREDENTIALS ? 'Set' : 'Not set');
    
    // リクエスト情報のログ
    console.log('Request info:', {
      method: req.method,
      headers: req.headers,
      bodyKeys: Object.keys(req.body || {}),
      chunkIndex: req.body?.chunkIndex,
      totalChunks: req.body?.totalChunks,
      fileName: req.body?.fileName,
      uploadId: req.body?.uploadId
    });
    
    res.status(500).json({
      error: 'チャンクアップロードエラーが発生しました',
      details: error.message,
      environment: {
        isVercel: !!process.env.VERCEL,
        hasRedis: !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN),
        hasGoogleCredentials: !!process.env.GOOGLE_APPLICATION_CREDENTIALS
      },
      requestInfo: {
        chunkIndex: req.body?.chunkIndex,
        totalChunks: req.body?.totalChunks,
        fileName: req.body?.fileName,
        uploadId: req.body?.uploadId
      }
    });
  }
}

/**
 * チャンクからファイルを再構築
 */
async function reconstructFile(uploadSession) {
  try {
    const { chunks, totalChunks, fileName } = uploadSession;
    
    // Vercel環境での一時ディレクトリを確認
    const tempDir = process.env.VERCEL ? '/tmp' : os.tmpdir();
    
    // ディレクトリが存在しない場合は作成
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const tempFilePath = path.join(tempDir, `reconstructed_${uploadSession.uploadId}_${fileName}`);
    
    console.log(`Reconstructing file: ${fileName} to ${tempFilePath}`);
    console.log(`Environment: ${process.env.VERCEL ? 'Vercel' : 'Local'}`);
    console.log(`Temp directory: ${tempDir}`);
    
    // チャンクを順序通りに結合
    let fileBuffer = Buffer.alloc(0);
    for (let i = 0; i < totalChunks; i++) {
      const chunkKey = `chunk_${i}`;
      const chunkData = chunks[chunkKey];
      if (chunkData) {
        const chunkBuffer = Buffer.from(chunkData, 'base64');
        fileBuffer = Buffer.concat([fileBuffer, chunkBuffer]);
        console.log(`Processed chunk ${i + 1}/${totalChunks} (${chunkBuffer.length} bytes)`);
      } else {
        throw new Error(`Missing chunk ${i}`);
      }
    }
    
    console.log(`Total file size: ${fileBuffer.length} bytes`);
    
    // ファイルを保存（非同期で実行）
    await fs.promises.writeFile(tempFilePath, fileBuffer);
    
    // ファイルの存在確認
    if (!fs.existsSync(tempFilePath)) {
      throw new Error('Failed to write reconstructed file');
    }
    
    const stats = fs.statSync(tempFilePath);
    console.log(`File written successfully: ${stats.size} bytes`);
    
    return {
      filePath: tempFilePath,
      size: fileBuffer.length,
      fileName: fileName
    };
    
  } catch (error) {
    console.error('File reconstruction error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      uploadId: uploadSession.uploadId,
      fileName: uploadSession.fileName,
      totalChunks: uploadSession.totalChunks,
      receivedChunks: Object.keys(uploadSession.chunks).length
    });
    throw error;
  }
}

/**
 * 文字起こしジョブを開始
 */
async function startTranscriptionJob(uploadSession) {
  try {
    const jobId = crypto.randomBytes(16).toString('hex');
    
    // 文字起こしジョブの状態を初期化
    const transcriptionState = {
      jobId,
      audioInfo: {
        fileName: uploadSession.fileName,
        fileSize: uploadSession.fileSize
      },
      audioFilePath: uploadSession.reconstructedFile.filePath,
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

    await saveJobState(jobId, transcriptionState);
    
    // 非同期で文字起こし処理を開始
    processTranscriptionAsync(jobId);
    
    return jobId;
    
  } catch (error) {
    console.error('Transcription job start error:', error);
    throw error;
  }
}

/**
 * 非同期で文字起こし処理を実行
 */
async function processTranscriptionAsync(jobId) {
  try {
    console.log(`Starting transcription for job: ${jobId}`);
    
    // ジョブ状態を取得
    const jobState = await loadJobState(jobId);
    if (!jobState || !jobState.audioFilePath) {
      throw new Error('Job state or audio file path not found');
    }

    // 状態を更新
    await updateJobState(jobId, {
      status: 'processing',
      progress: 10
    });

    // 音声ファイルの存在確認
    const fs = require('fs');
    if (!fs.existsSync(jobState.audioFilePath)) {
      throw new Error('Audio file not found');
    }

    // Google Cloud Speech-to-Text APIを使用した文字起こし
    const speech = require('@google-cloud/speech').v1.SpeechClient();
    
    // 音声ファイルを読み込み
    const audioBytes = fs.readFileSync(jobState.audioFilePath).toString('base64');
    
    const request = {
      audio: {
        content: audioBytes,
      },
      config: {
        encoding: 'MP3',
        sampleRateHertz: 16000,
        languageCode: 'ja-JP',
        enableAutomaticPunctuation: true,
        model: 'latest_long',
      },
    };

    await updateJobState(jobId, {
      status: 'processing',
      progress: 30
    });

    // 文字起こし実行
    const [response] = await speech.recognize(request);
    const transcription = response.results
      .map(result => result.alternatives[0].transcript)
      .join('\n');

    await updateJobState(jobId, {
      status: 'processing',
      progress: 80
    });

    // 結果を保存
    const result = {
      fullText: transcription,
      confidence: response.results[0]?.alternatives[0]?.confidence || 0,
      duration: 0, // 実際の実装では音声の長さを計算
      processed: true,
      completedAt: new Date().toISOString()
    };

    await updateJobState(jobId, {
      status: 'completed',
      progress: 100,
      result: result
    });

    console.log(`Transcription completed for job: ${jobId}`);

  } catch (error) {
    console.error(`Transcription error for job ${jobId}:`, error);
    await updateJobState(jobId, {
      status: 'failed',
      error: error.message
    });
  }
}

