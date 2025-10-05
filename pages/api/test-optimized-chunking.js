import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

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
    const { audioData, fileName = 'test_audio.mp3' } = req.body;

    if (!audioData) {
      return res.status(400).json({ error: '音声データが必要です' });
    }

    // Base64データをデコードしてファイルに保存
    const audioBuffer = Buffer.from(audioData, 'base64');
    const tempAudioPath = path.join('/tmp', `test_${Date.now()}_${fileName}`);
    fs.writeFileSync(tempAudioPath, audioBuffer);

    console.log(`Test audio file created: ${tempAudioPath}`);

    // 音声メタデータを取得
    const metadata = await getAudioMetadata(tempAudioPath);
    console.log('Audio metadata:', metadata);

    // 最適化されたチャンク分割をテスト
    const chunkingResults = await testOptimizedChunking(tempAudioPath, metadata.duration);

    // 一時ファイルをクリーンアップ
    try {
      fs.unlinkSync(tempAudioPath);
      console.log('Temporary file cleaned up');
    } catch (cleanupError) {
      console.warn('Failed to cleanup temporary file:', cleanupError.message);
    }

    res.status(200).json({
      success: true,
      metadata,
      chunkingResults,
      message: '最適化されたチャンク分割テストが完了しました'
    });

  } catch (error) {
    console.error('Test error:', error);
    res.status(500).json({
      error: 'テスト実行エラー',
      details: error.message
    });
  }
}

/**
 * 音声メタデータを取得
 */
async function getAudioMetadata(audioPath) {
  try {
    const command = `ffprobe -v quiet -print_format json -show_format -show_streams "${audioPath}"`;
    const { stdout } = await execAsync(command);
    const data = JSON.parse(stdout);
    
    const audioStream = data.streams.find(stream => stream.codec_type === 'audio');
    
    return {
      duration: parseFloat(data.format.duration) || 0,
      size: parseInt(data.format.size) || 0,
      bitrate: parseInt(data.format.bit_rate) || 0,
      sampleRate: parseInt(audioStream?.sample_rate) || 0,
      channels: parseInt(audioStream?.channels) || 0,
      codec: audioStream?.codec_name || 'unknown',
      format: data.format.format_name || 'unknown'
    };
  } catch (error) {
    console.error('Metadata extraction error:', error);
    return {
      duration: 0,
      size: 0,
      bitrate: 0,
      sampleRate: 0,
      channels: 0,
      codec: 'unknown',
      format: 'unknown'
    };
  }
}

/**
 * 最適化されたチャンク分割をテスト
 */
async function testOptimizedChunking(audioPath, duration) {
  const results = {
    silenceDetection: null,
    timeBasedFallback: null,
    finalChunks: null
  };

  try {
    // 1. 無音部分での分割をテスト
    console.log('Testing silence detection...');
    const silenceChunks = await detectSilenceAndSplit(audioPath, duration);
    
    if (silenceChunks && silenceChunks.length > 0) {
      results.silenceDetection = {
        success: true,
        chunkCount: silenceChunks.length,
        chunks: silenceChunks.map(chunk => ({
          id: chunk.id,
          startTime: chunk.startTime,
          endTime: chunk.endTime,
          duration: chunk.duration,
          splitMethod: chunk.splitMethod
        }))
      };
      results.finalChunks = silenceChunks;
      console.log(`Silence detection successful: ${silenceChunks.length} chunks`);
    } else {
      results.silenceDetection = {
        success: false,
        reason: 'No silence detected or detection failed'
      };
      
      // 2. フォールバック：時間ベース分割をテスト
      console.log('Testing time-based fallback...');
      const timeChunks = await splitAudioByTime(audioPath, duration);
      
      results.timeBasedFallback = {
        success: true,
        chunkCount: timeChunks.length,
        chunks: timeChunks.map(chunk => ({
          id: chunk.id,
          startTime: chunk.startTime,
          endTime: chunk.endTime,
          duration: chunk.duration,
          splitMethod: chunk.splitMethod
        }))
      };
      results.finalChunks = timeChunks;
      console.log(`Time-based splitting successful: ${timeChunks.length} chunks`);
    }

    // 3. チャンクファイルの詳細情報を取得
    if (results.finalChunks) {
      for (const chunk of results.finalChunks) {
        try {
          const chunkMetadata = await getAudioMetadata(chunk.chunkPath);
          chunk.fileSize = chunkMetadata.size;
          chunk.actualDuration = chunkMetadata.duration;
        } catch (error) {
          console.warn(`Failed to get metadata for chunk ${chunk.id}:`, error.message);
          chunk.fileSize = 0;
          chunk.actualDuration = chunk.duration;
        }
      }
    }

  } catch (error) {
    console.error('Chunking test error:', error);
    results.error = error.message;
  }

  return results;
}

/**
 * 無音部分を検出して音声を分割
 */
async function detectSilenceAndSplit(audioPath, duration) {
  try {
    // 無音部分を検出（-50dB以下、0.5秒以上）
    const silenceCommand = `ffmpeg -i "${audioPath}" -af silencedetect=noise=-50dB:duration=0.5 -f null - 2>&1 | grep "silence_start"`;
    const silenceOutput = await execAsync(silenceCommand);
    
    if (!silenceOutput || silenceOutput.trim() === '') {
      console.log('No silence detected');
      return null;
    }
    
    // 無音開始時間を抽出
    const silenceStarts = silenceOutput
      .split('\n')
      .filter(line => line.includes('silence_start'))
      .map(line => {
        const match = line.match(/silence_start: ([\d.]+)/);
        return match ? parseFloat(match[1]) : null;
      })
      .filter(time => time !== null && time > 0);
    
    if (silenceStarts.length === 0) {
      return null;
    }
    
    // 無音部分を基準にチャンクを作成
    const chunks = [];
    let lastStart = 0;
    
    for (let i = 0; i < silenceStarts.length; i++) {
      const silenceStart = silenceStarts[i];
      const chunkDuration = silenceStart - lastStart;
      
      // 最小チャンクサイズ（30秒）を確保
      if (chunkDuration >= 30) {
        const chunkPath = path.join('/tmp', `test_silence_chunk_${i}_${Date.now()}.mp3`);
        chunks.push({
          id: `silence_chunk_${i}`,
          startTime: lastStart,
          endTime: silenceStart,
          duration: chunkDuration,
          chunkPath,
          status: 'pending',
          splitMethod: 'silence'
        });
        lastStart = silenceStart;
      }
    }
    
    // 最後のチャンクを追加
    if (lastStart < duration) {
      const finalDuration = duration - lastStart;
      if (finalDuration >= 30) {
        const chunkPath = path.join('/tmp', `test_silence_chunk_final_${Date.now()}.mp3`);
        chunks.push({
          id: `silence_chunk_final`,
          startTime: lastStart,
          endTime: duration,
          duration: finalDuration,
          chunkPath,
          status: 'pending',
          splitMethod: 'silence'
        });
      }
    }
    
    if (chunks.length > 0) {
      await createChunkFiles(audioPath, chunks);
      return chunks;
    }
    
    return null;
  } catch (error) {
    console.error('Silence detection error:', error);
    return null;
  }
}

/**
 * 時間ベースで音声を分割（フォールバック）
 */
async function splitAudioByTime(audioPath, duration) {
  // チャンクサイズを動的に調整
  let chunkDuration;
  if (duration <= 600) { // 10分以下
    chunkDuration = 120; // 2分チャンク
  } else if (duration <= 1800) { // 30分以下
    chunkDuration = 300; // 5分チャンク
  } else { // 30分以上
    chunkDuration = 600; // 10分チャンク
  }
  
  const totalChunks = Math.ceil(duration / chunkDuration);
  const chunks = [];

  console.log(`Time-based splitting: ${duration}s into ${totalChunks} chunks of ${chunkDuration}s each`);

  for (let i = 0; i < totalChunks; i++) {
    const startTime = i * chunkDuration;
    const endTime = Math.min((i + 1) * chunkDuration, duration);
    const actualDuration = endTime - startTime;
    
    const chunkPath = path.join('/tmp', `test_time_chunk_${i}_${Date.now()}.mp3`);
    
    chunks.push({
      id: `time_chunk_${i}`,
      startTime,
      endTime,
      duration: actualDuration,
      chunkPath,
      status: 'pending',
      splitMethod: 'time'
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
      // 音声品質を最適化してチャンクを作成
      const command = `ffmpeg -i "${audioPath}" -ss ${chunk.startTime} -t ${chunk.duration} -ar 16000 -ac 1 -b:a 64k "${chunk.chunkPath}" -y`;
      await execAsync(command);
      console.log(`Created optimized chunk file: ${chunk.chunkPath}`);
    } catch (error) {
      console.error(`Error creating chunk ${chunk.id}:`, error);
      throw error;
    }
  });

  await Promise.all(createPromises);
}
