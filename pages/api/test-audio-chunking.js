/**
 * 音声チャンク分割テスト用API
 * サンプル音声ファイルでチャンク分割機能をテスト
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
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
    const { audioFile, testMode = 'chunking' } = req.body;

    if (!audioFile) {
      return res.status(400).json({ error: '音声ファイルが必要です' });
    }

    // Base64デコードして一時ファイルに保存
    const audioBuffer = Buffer.from(audioFile.split(',')[1], 'base64');
    const tempAudioPath = path.join('/tmp', `test_audio_${Date.now()}.mp3`);
    fs.writeFileSync(tempAudioPath, audioBuffer);

    console.log(`Test audio file created: ${tempAudioPath}`);

    let result;

    if (testMode === 'chunking') {
      result = await testChunking(tempAudioPath);
    } else if (testMode === 'metadata') {
      result = await testMetadata(tempAudioPath);
    } else {
      result = await testBoth(tempAudioPath);
    }

    // 一時ファイルをクリーンアップ
    if (fs.existsSync(tempAudioPath)) {
      fs.unlinkSync(tempAudioPath);
      console.log('Test audio file cleaned up');
    }

    res.status(200).json({
      status: 'success',
      testMode,
      result
    });

  } catch (error) {
    console.error('Test error:', error);
    res.status(500).json({
      error: 'テストエラーが発生しました',
      details: error.message
    });
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
      size: 0,
      error: error.message
    };
  }
}

/**
 * 音声をチャンクに分割
 */
async function splitAudioIntoChunks(audioPath, duration) {
  const safeDuration = duration || 300;
  
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
      status: 'pending'
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
      
      // チャンクファイルのサイズを取得
      const stats = fs.statSync(chunk.chunkPath);
      chunk.fileSize = stats.size;
      chunk.status = 'created';
    } catch (error) {
      console.error(`Error creating chunk ${chunk.id}:`, error);
      chunk.status = 'error';
      chunk.error = error.message;
    }
  });

  await Promise.all(createPromises);
}

/**
 * メタデータテスト
 */
async function testMetadata(audioPath) {
  const metadata = await getAudioMetadata(audioPath);
  return {
    metadata,
    test: 'metadata_only'
  };
}

/**
 * チャンク分割テスト
 */
async function testChunking(audioPath) {
  const metadata = await getAudioMetadata(audioPath);
  const chunks = await splitAudioIntoChunks(audioPath, metadata.duration);
  
  // チャンクファイルをクリーンアップ
  for (const chunk of chunks) {
    if (fs.existsSync(chunk.chunkPath)) {
      fs.unlinkSync(chunk.chunkPath);
    }
  }
  
  return {
    metadata,
    chunks: chunks.map(chunk => ({
      id: chunk.id,
      startTime: chunk.startTime,
      endTime: chunk.endTime,
      duration: chunk.duration,
      fileSize: chunk.fileSize,
      status: chunk.status,
      error: chunk.error
    })),
    test: 'chunking_only'
  };
}

/**
 * 両方のテスト
 */
async function testBoth(audioPath) {
  const metadata = await getAudioMetadata(audioPath);
  const chunks = await splitAudioIntoChunks(audioPath, metadata.duration);
  
  // チャンクファイルをクリーンアップ
  for (const chunk of chunks) {
    if (fs.existsSync(chunk.chunkPath)) {
      fs.unlinkSync(chunk.chunkPath);
    }
  }
  
  return {
    metadata,
    chunks: chunks.map(chunk => ({
      id: chunk.id,
      startTime: chunk.startTime,
      endTime: chunk.endTime,
      duration: chunk.duration,
      fileSize: chunk.fileSize,
      status: chunk.status,
      error: chunk.error
    })),
    test: 'both'
  };
}
