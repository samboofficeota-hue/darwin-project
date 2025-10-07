/**
 * サーバーサイド音声分割API
 * フロントエンドから送信された音声ファイルをFFmpegでMP3チャンクに分割し、GCSに直接アップロード
 */

import { Storage } from '@google-cloud/storage';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const execAsync = promisify(exec);
const storage = new Storage();
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
    const { audioFile, userId, sessionId, chunkDuration = 180 } = req.body;

    if (!audioFile || !userId || !sessionId) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    console.log('Starting server-side audio splitting:', {
      userId,
      sessionId,
      chunkDuration,
      fileSize: audioFile.length
    });

    // 1. 音声ファイルを一時ファイルに保存
    const tempDir = '/tmp';
    const tempFileName = `audio_${uuidv4()}.wav`;
    const tempFilePath = path.join(tempDir, tempFileName);
    
    // Base64データをデコードしてファイルに保存
    const audioBuffer = Buffer.from(audioFile, 'base64');
    fs.writeFileSync(tempFilePath, audioBuffer);

    try {
      // 2. 音声ファイルのメタデータを取得
      const metadata = await getAudioMetadata(tempFilePath);
      console.log('Audio metadata:', metadata);

      // 3. チャンク数を計算
      const totalChunks = Math.ceil(metadata.duration / chunkDuration);
      console.log(`Splitting into ${totalChunks} chunks of ${chunkDuration}s each`);

      // 4. FFmpegでチャンクに分割
      const chunks = await splitAudioIntoChunks(tempFilePath, metadata.duration, chunkDuration, totalChunks);
      console.log(`Created ${chunks.length} chunk files`);

      // 5. 各チャンクをGCSに直接アップロード
      const uploadResults = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(`Uploading chunk ${i + 1}/${chunks.length}: ${chunk.fileName}`);
        
        try {
          const uploadResult = await uploadChunkToGCS(chunk, userId, sessionId);
          uploadResults.push({
            ...chunk,
            uploadResult,
            status: 'success'
          });
        } catch (error) {
          console.error(`Failed to upload chunk ${i + 1}:`, error);
          uploadResults.push({
            ...chunk,
            error: error.message,
            status: 'error'
          });
        }

        // 一時ファイルを削除
        if (fs.existsSync(chunk.filePath)) {
          fs.unlinkSync(chunk.filePath);
        }
      }

      // 6. セッション情報を保存
      await saveSessionInfo(userId, sessionId, {
        totalChunks: chunks.length,
        chunkDuration,
        uploadResults: uploadResults.map(r => ({
          id: r.id,
          startTime: r.startTime,
          endTime: r.endTime,
          duration: r.duration,
          status: r.status,
          error: r.error
        }))
      });

      // 7. 一時ファイルを削除
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }

      res.status(200).json({
        success: true,
        message: '音声分割とアップロードが完了しました',
        totalChunks: chunks.length,
        chunkDuration,
        uploadResults
      });

    } catch (error) {
      // エラー時も一時ファイルを削除
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      throw error;
    }

  } catch (error) {
    console.error('Error in server-side audio splitting:', error);
    res.status(500).json({
      error: '音声分割に失敗しました',
      details: error.message
    });
  }
}

/**
 * 音声ファイルのメタデータを取得
 */
async function getAudioMetadata(audioPath) {
  try {
    const command = `ffprobe -v quiet -print_format json -show_format -show_streams "${audioPath}"`;
    const { stdout } = await execAsync(command);
    const metadata = JSON.parse(stdout);
    
    const audioStream = metadata.streams.find(stream => stream.codec_type === 'audio');
    const duration = parseFloat(metadata.format.duration);
    
    return {
      duration,
      sampleRate: audioStream.sample_rate,
      channels: audioStream.channels,
      bitrate: parseInt(metadata.format.bit_rate) || 128000,
      codec: audioStream.codec_name
    };
  } catch (error) {
    console.error('Error getting audio metadata:', error);
    throw new Error('音声ファイルのメタデータ取得に失敗しました');
  }
}

/**
 * FFmpegで音声をチャンクに分割
 */
async function splitAudioIntoChunks(audioPath, duration, chunkDuration, totalChunks) {
  const chunks = [];
  const tempDir = '/tmp';

  for (let i = 0; i < totalChunks; i++) {
    const startTime = i * chunkDuration;
    const endTime = Math.min((i + 1) * chunkDuration, duration);
    const actualDuration = endTime - startTime;
    
    const chunkFileName = `chunk_${i}_${Date.now()}.mp3`;
    const chunkPath = path.join(tempDir, chunkFileName);
    
    // FFmpegでチャンクを抽出（MP3形式で出力）
    const command = `ffmpeg -i "${audioPath}" -ss ${startTime} -t ${actualDuration} -acodec mp3 -ab 128k -ar 44100 -ac 2 "${chunkPath}"`;
    
    try {
      await execAsync(command);
      
      // ファイルサイズを確認
      const stats = fs.statSync(chunkPath);
      
      chunks.push({
        id: `chunk_${i}`,
        index: i,
        startTime,
        endTime,
        duration: actualDuration,
        fileName: chunkFileName,
        filePath: chunkPath,
        fileSize: stats.size,
        status: 'ready'
      });
      
      console.log(`Created chunk ${i + 1}/${totalChunks}: ${chunkFileName} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
      
    } catch (error) {
      console.error(`Failed to create chunk ${i + 1}:`, error);
      throw new Error(`チャンク ${i + 1} の作成に失敗しました: ${error.message}`);
    }
  }

  return chunks;
}

/**
 * チャンクをGCSに直接アップロード
 */
async function uploadChunkToGCS(chunk, userId, sessionId) {
  const bucket = storage.bucket(BUCKET_NAME);
  const fileName = `users/${userId}/sessions/${sessionId}/chunks/${chunk.id}.mp3`;
  const file = bucket.file(fileName);

  // ファイルを読み込み
  const fileBuffer = fs.readFileSync(chunk.filePath);

  // GCSにアップロード
  await file.save(fileBuffer, {
    metadata: {
      contentType: 'audio/mp3',
      cacheControl: 'public, max-age=3600',
    },
    resumable: false, // 小さいファイルなので一括アップロード
  });

  console.log(`Uploaded chunk ${chunk.id} to GCS: ${fileName}`);

  return {
    fileName,
    fileSize: fileBuffer.length,
    uploadedAt: new Date().toISOString()
  };
}

/**
 * セッション情報を保存
 */
async function saveSessionInfo(userId, sessionId, sessionData) {
  const bucket = storage.bucket(BUCKET_NAME);
  const fileName = `users/${userId}/sessions/${sessionId}/session.json`;
  const file = bucket.file(fileName);

  const sessionInfo = {
    userId,
    sessionId,
    createdAt: new Date().toISOString(),
    ...sessionData
  };

  await file.save(JSON.stringify(sessionInfo, null, 2), {
    metadata: {
      contentType: 'application/json',
    },
  });

  console.log(`Session info saved: ${fileName}`);
}
