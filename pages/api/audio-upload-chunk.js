/**
 * チャンクアップロード用API
 * 大きなファイルを小さなチャンクに分割してアップロード
 */

import { saveJobState, loadJobState } from '../../lib/storage.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb', // チャンクサイズ制限
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
      return res.status(400).json({ error: '必要なパラメータが不足しています' });
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

    // 全チャンクが受信されたかチェック
    if (uploadSession.receivedChunks.length === totalChunks) {
      uploadSession.status = 'completed';
      
      // チャンクを結合してファイルを再構築
      const reconstructedFile = await reconstructFile(uploadSession);
      uploadSession.reconstructedFile = reconstructedFile;
      
      // 文字起こしジョブを開始
      const transcriptionJobId = await startTranscriptionJob(uploadSession);
      uploadSession.transcriptionJobId = transcriptionJobId;
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
    res.status(500).json({
      error: 'チャンクアップロードエラーが発生しました',
      details: error.message
    });
  }
}

/**
 * チャンクからファイルを再構築
 */
async function reconstructFile(uploadSession) {
  try {
    const { chunks, totalChunks, fileName } = uploadSession;
    const tempDir = '/tmp';
    const tempFilePath = path.join(tempDir, `reconstructed_${uploadSession.uploadId}_${fileName}`);
    
    // チャンクを順序通りに結合
    const fileBuffer = Buffer.alloc(0);
    for (let i = 0; i < totalChunks; i++) {
      const chunkKey = `chunk_${i}`;
      const chunkData = chunks[chunkKey];
      if (chunkData) {
        const chunkBuffer = Buffer.from(chunkData, 'base64');
        fileBuffer = Buffer.concat([fileBuffer, chunkBuffer]);
      }
    }
    
    // ファイルを保存
    fs.writeFileSync(tempFilePath, fileBuffer);
    
    return {
      filePath: tempFilePath,
      size: fileBuffer.length,
      fileName: fileName
    };
    
  } catch (error) {
    console.error('File reconstruction error:', error);
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
  // 既存のaudio-transcribe.jsの処理ロジックを使用
  // ここでは簡略化
  console.log(`Starting transcription for job: ${jobId}`);
}
