/**
 * Vimeo動画から音声データを取得するAPI
 * 実際の音声ストリームをダウンロードして返す
 */

import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';

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
    const { vimeoUrl, startTime = 0, duration = 300 } = req.body;

    if (!vimeoUrl) {
      return res.status(400).json({ error: 'Vimeo URLが必要です' });
    }

    // Vimeo URLから動画IDを抽出
    const videoId = extractVideoId(vimeoUrl);
    if (!videoId) {
      return res.status(400).json({ error: '無効なVimeo URLです' });
    }

    console.log(`Getting audio for video ID: ${videoId}, start: ${startTime}s, duration: ${duration}s`);

    // Vimeo APIから実際の音声データを取得

    // Vimeo APIから動画のダウンロードリンクを取得
    const downloadInfo = await getVimeoDownloadLinks(videoId);
    if (!downloadInfo) {
      return res.status(400).json({ error: '動画のダウンロードリンクを取得できませんでした' });
    }

    console.log(`Download info: ${downloadInfo.audioUrl}, format: ${downloadInfo.format}`);

    // 音声ファイルをダウンロード
    const audioBuffer = await downloadVimeoAudio(downloadInfo.audioUrl);
    console.log(`Downloaded audio buffer: ${audioBuffer.length} bytes`);
    
    // 指定された時間範囲の音声を抽出
    let extractedAudio;
    try {
      extractedAudio = await extractAudioSegment(audioBuffer, startTime, duration);
      console.log(`Extracted audio segment: ${extractedAudio.length} bytes`);
    } catch (extractError) {
      console.warn('FFmpeg extraction failed, using fallback method:', extractError.message);
      // フォールバック: 簡易的な抽出方法
      extractedAudio = await extractAudioSegmentFallback(audioBuffer, startTime, duration);
      console.log(`Fallback extracted audio segment: ${extractedAudio.length} bytes`);
    }

    // 音声データをBase64エンコードして返す
    const base64Audio = extractedAudio.toString('base64');
    console.log(`Base64 encoded: ${base64Audio.length} characters`);

    res.status(200).json({
      success: true,
      audioData: base64Audio,
      format: downloadInfo.format,
      duration: extractedAudio.length,
      startTime,
      endTime: startTime + duration
    });

  } catch (error) {
    console.error('Vimeo audio download error:', error);
    res.status(500).json({
      error: '音声データの取得に失敗しました',
      details: error.message
    });
  }
}

/**
 * Vimeo URLから動画IDを抽出
 */
function extractVideoId(url) {
  const vimeoPattern = /(?:vimeo\.com\/)(?:.*\/)?(\d+)/;
  const match = url.match(vimeoPattern);
  return match ? match[1] : null;
}

/**
 * Vimeo APIから動画のダウンロードリンクを取得（レート制限対応）
 */
async function getVimeoDownloadLinks(videoId) {
  const maxRetries = 3;
  const baseDelay = 1000; // 1秒

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (!process.env.VIMEO_ACCESS_TOKEN) {
        throw new Error('Vimeo APIトークンが設定されていません');
      }

      console.log(`Vimeo API request attempt ${attempt} for video ${videoId}`);

      // Vimeo APIで動画の詳細情報を取得
      const response = await fetch(`https://api.vimeo.com/videos/${videoId}`, {
        headers: {
          'Authorization': `Bearer ${process.env.VIMEO_ACCESS_TOKEN}`,
          'Accept': 'application/vnd.vimeo.*+json;version=3.4'
        }
      });

      if (response.status === 429) {
        // レート制限エラーの場合
        const retryAfter = response.headers.get('Retry-After');
        const delay = retryAfter ? parseInt(retryAfter) * 1000 : baseDelay * Math.pow(2, attempt - 1);
        
        console.log(`Rate limited. Waiting ${delay}ms before retry ${attempt}/${maxRetries}`);
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        } else {
          throw new Error(`Vimeo API rate limit exceeded after ${maxRetries} attempts`);
        }
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Vimeo API error: ${response.status} - ${errorText}`);
        
        if (response.status === 403) {
          throw new Error('動画へのアクセスが制限されています。動画が非公開または認証が必要です。');
        } else if (response.status === 404) {
          throw new Error('動画が見つかりません。URLを確認してください。');
        } else if (response.status === 401) {
          throw new Error('Vimeo APIトークンが無効です。');
        } else {
          throw new Error(`Vimeo API error: ${response.status} - ${errorText}`);
        }
      }

      const videoData = await response.json();
      
      // デバッグ: レスポンス構造を確認
      console.log('Vimeo API response structure:');
      console.log('- Has files:', !!videoData.files);
      console.log('- Has download:', !!videoData.download);
      console.log('- Has play:', !!videoData.play);
      console.log('- Has embed:', !!videoData.embed);
      
      // 動画ファイルの情報を取得（複数のソースを確認）
      const files = videoData.files || [];
      const downloadFiles = videoData.download || [];
      const playFiles = videoData.play || {};
      const allFiles = [...files, ...downloadFiles];
      
      // playオブジェクトからもファイル情報を取得
      if (playFiles.progressive && Array.isArray(playFiles.progressive)) {
        allFiles.push(...playFiles.progressive);
        console.log('Added progressive files from play object:', playFiles.progressive.length);
      }
      
      console.log(`Found ${files.length} files and ${downloadFiles.length} download files`);
      console.log('Files:', files.map(f => ({ type: f.type, quality: f.quality, size: f.size })));
      console.log('Download files:', downloadFiles.map(f => ({ type: f.type, quality: f.quality, size: f.size })));
      
      // 音声付きのファイルを探す（改善された検索ロジック）
      let audioFile = null;
      
      // 1. HLS品質のMP4ファイルを優先
      audioFile = allFiles.find(file => 
        file.type === 'video/mp4' && 
        file.quality === 'hls' && 
        file.size > 0
      );
      
      // 2. HLSが見つからない場合は、高品質のMP4を探す
      if (!audioFile) {
        audioFile = allFiles.find(file => 
          file.type === 'video/mp4' && 
          file.quality && 
          (file.quality === 'hd' || file.quality === 'sd') &&
          file.size > 0
        );
      }
      
      // 3. 品質指定なしのMP4ファイルを探す
      if (!audioFile) {
        audioFile = allFiles.find(file => 
          file.type === 'video/mp4' && 
          file.size > 0
        );
      }
      
      // 4. 他の動画形式を探す
      if (!audioFile) {
        audioFile = allFiles.find(file => 
          file.type && 
          (file.type.includes('video') || file.type.includes('mp4')) && 
          file.size > 0
        );
      }
      
      // 5. サイズが0でないファイルを探す
      if (!audioFile) {
        audioFile = allFiles.find(file => 
          file.size > 0
        );
      }
      
      // 6. 最後の手段：最初のファイルを使用
      if (!audioFile && allFiles.length > 0) {
        audioFile = allFiles[0];
        console.log('Using first available file as fallback:', audioFile);
      }
      
      // デバッグ情報を追加
      console.log('File search results:');
      console.log('- Total files found:', allFiles.length);
      console.log('- Selected file:', audioFile ? {
        type: audioFile.type,
        quality: audioFile.quality,
        size: audioFile.size,
        hasLink: !!audioFile.link
      } : 'None');

      if (!audioFile) {
        console.error('No files found in Vimeo response. Full response structure:');
        console.error(JSON.stringify(videoData, null, 2));
        
        // 最後の手段：playオブジェクトから直接リンクを取得
        if (playFiles.progressive && playFiles.progressive.length > 0) {
          const firstProgressive = playFiles.progressive[0];
          if (firstProgressive.url) {
            console.log('Using progressive file as fallback:', firstProgressive);
            audioFile = {
              link: firstProgressive.url,
              type: firstProgressive.mime || 'video/mp4',
              quality: firstProgressive.quality || 'unknown',
              size: firstProgressive.size || 0
            };
          }
        }
        
        if (!audioFile) {
          throw new Error('音声付きの動画ファイルが見つかりません。動画が非公開または制限されている可能性があります。');
        }
      }

      console.log('Selected audio file:', { type: audioFile.type, quality: audioFile.quality, size: audioFile.size });

      return {
        audioUrl: audioFile.link,
        format: 'mp4',
        size: audioFile.size,
        quality: audioFile.quality
      };

    } catch (error) {
      console.error(`Vimeo API error (attempt ${attempt}):`, error);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // 指数バックオフで待機
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(`Waiting ${delay}ms before retry ${attempt + 1}/${maxRetries}`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Vimeoから音声ファイルをダウンロード
 */
async function downloadVimeoAudio(audioUrl) {
  try {
    const response = await fetch(audioUrl);
    
    if (!response.ok) {
      throw new Error(`Audio download failed: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);

  } catch (error) {
    console.error('Error downloading Vimeo audio:', error);
    throw error;
  }
}

/**
 * FFmpegを使用した正確な音声セグメント抽出
 * 他の事例を参考にした改善実装
 */
async function extractAudioSegment(audioBuffer, startTime, duration) {
  try {
    const fs = require('fs');
    const { spawn } = require('child_process');
    const path = require('path');
    
    // 一時ファイルを作成
    const tempDir = '/tmp';
    const inputFile = path.join(tempDir, `input_${Date.now()}.mp4`);
    const outputFile = path.join(tempDir, `output_${Date.now()}.wav`);
    
    // 入力ファイルに書き込み
    fs.writeFileSync(inputFile, audioBuffer);
    
    console.log(`Extracting audio segment: ${startTime}s to ${startTime + duration}s`);
    
    // FFmpegを使用して音声セグメントを抽出
    const ffmpeg = spawn('ffmpeg', [
      '-i', inputFile,
      '-ss', startTime.toString(),
      '-t', duration.toString(),
      '-vn', // ビデオストリームを無効化
      '-acodec', 'pcm_s16le', // 16bit PCM
      '-ar', '16000', // 16kHz サンプルレート
      '-ac', '1', // モノラル
      '-f', 'wav',
      outputFile,
      '-y' // 上書き許可
    ]);
    
    return new Promise((resolve, reject) => {
      let errorOutput = '';
      
      ffmpeg.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      ffmpeg.on('close', (code) => {
        // 一時ファイルをクリーンアップ
        try {
          if (fs.existsSync(inputFile)) {
            fs.unlinkSync(inputFile);
          }
        } catch (cleanupError) {
          console.warn('Failed to cleanup input file:', cleanupError);
        }
        
        if (code === 0) {
          try {
            if (fs.existsSync(outputFile)) {
              const extractedBuffer = fs.readFileSync(outputFile);
              // 出力ファイルをクリーンアップ
              fs.unlinkSync(outputFile);
              console.log(`Successfully extracted ${extractedBuffer.length} bytes`);
              resolve(extractedBuffer);
            } else {
              throw new Error('Output file was not created');
            }
          } catch (readError) {
            console.error('Error reading extracted audio:', readError);
            reject(new Error('Failed to read extracted audio segment'));
          }
        } else {
          console.error('FFmpeg error:', errorOutput);
          // 出力ファイルをクリーンアップ
          try {
            if (fs.existsSync(outputFile)) {
              fs.unlinkSync(outputFile);
            }
          } catch (cleanupError) {
            console.warn('Failed to cleanup output file:', cleanupError);
          }
          reject(new Error(`FFmpeg failed with code ${code}: ${errorOutput}`));
        }
      });
      
      ffmpeg.on('error', (error) => {
        console.error('FFmpeg spawn error:', error);
        // 一時ファイルをクリーンアップ
        try {
          if (fs.existsSync(inputFile)) {
            fs.unlinkSync(inputFile);
          }
          if (fs.existsSync(outputFile)) {
            fs.unlinkSync(outputFile);
          }
        } catch (cleanupError) {
          console.warn('Failed to cleanup files:', cleanupError);
        }
        reject(new Error('FFmpeg is not available or failed to start'));
      });
    });

  } catch (error) {
    console.error('Error extracting audio segment:', error);
    // フォールバック: 元のバッファを返す
    console.log('Falling back to original buffer');
    return audioBuffer;
  }
}

/**
 * フォールバック用の簡易音声抽出
 * FFmpegが利用できない場合の代替手段
 */
async function extractAudioSegmentFallback(audioBuffer, startTime, duration) {
  try {
    // 簡易実装: 音声の先頭部分を返す
    // 実際のプロダクションでは、より高度な処理が必要
    
    // 音声の長さを推定（MP4の場合、おおよその計算）
    const estimatedDuration = 300; // 5分と仮定
    const bytesPerSecond = audioBuffer.length / estimatedDuration;
    
    const startByte = Math.floor(startTime * bytesPerSecond);
    const endByte = Math.floor((startTime + duration) * bytesPerSecond);
    
    // 範囲をバッファのサイズ内に制限
    const safeStartByte = Math.max(0, Math.min(startByte, audioBuffer.length));
    const safeEndByte = Math.max(safeStartByte, Math.min(endByte, audioBuffer.length));
    
    console.log(`Fallback extraction: ${safeStartByte} to ${safeEndByte} bytes`);
    
    return audioBuffer.slice(safeStartByte, safeEndByte);

  } catch (error) {
    console.error('Error in fallback extraction:', error);
    // 最終的なフォールバック: 元のバッファを返す
    return audioBuffer;
  }
}
