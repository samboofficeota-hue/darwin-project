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
    const extractedAudio = await extractAudioSegment(audioBuffer, startTime, duration);
    console.log(`Extracted audio segment: ${extractedAudio.length} bytes`);

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
        throw new Error(`Vimeo API error: ${response.status}`);
      }

      const videoData = await response.json();
      
      // 動画ファイルの情報を取得（複数のソースを確認）
      const files = videoData.files || [];
      const downloadFiles = videoData.download || [];
      const allFiles = [...files, ...downloadFiles];
      
      console.log(`Found ${files.length} files and ${downloadFiles.length} download files`);
      console.log('Files:', files.map(f => ({ type: f.type, quality: f.quality, size: f.size })));
      console.log('Download files:', downloadFiles.map(f => ({ type: f.type, quality: f.quality, size: f.size })));
      
      // 音声付きのファイルを探す（複数の条件で試行）
      let audioFile = allFiles.find(file => 
        file.type === 'video/mp4' && 
        file.quality === 'hls' && 
        file.size > 0
      );

      // HLSが見つからない場合は、他の品質を試す
      if (!audioFile) {
        audioFile = allFiles.find(file => 
          file.type === 'video/mp4' && 
          file.size > 0
        );
      }

      // MP4が見つからない場合は、他の形式を試す
      if (!audioFile) {
        audioFile = allFiles.find(file => 
          file.type && 
          file.type.includes('video') && 
          file.size > 0
        );
      }

      // どのファイルも見つからない場合は、最初のファイルを使用
      if (!audioFile && allFiles.length > 0) {
        audioFile = allFiles[0];
        console.log('Using first available file:', audioFile);
      }

      if (!audioFile) {
        console.error('No files found in Vimeo response:', videoData);
        throw new Error('音声付きの動画ファイルが見つかりません');
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
 * 音声の指定された時間範囲を抽出
 * 簡易実装: 実際のプロダクションではFFmpegを使用
 */
async function extractAudioSegment(audioBuffer, startTime, duration) {
  try {
    // 簡易実装: 音声の先頭部分を返す
    // 実際のプロダクションでは、FFmpegで正確な時間範囲を切り出し
    
    // 音声の長さを推定（MP4の場合、おおよその計算）
    const estimatedDuration = 300; // 5分と仮定
    const bytesPerSecond = audioBuffer.length / estimatedDuration;
    
    const startByte = Math.floor(startTime * bytesPerSecond);
    const endByte = Math.floor((startTime + duration) * bytesPerSecond);
    
    // 範囲をバッファのサイズ内に制限
    const safeStartByte = Math.max(0, Math.min(startByte, audioBuffer.length));
    const safeEndByte = Math.max(safeStartByte, Math.min(endByte, audioBuffer.length));
    
    return audioBuffer.slice(safeStartByte, safeEndByte);

  } catch (error) {
    console.error('Error extracting audio segment:', error);
    // エラーの場合は元のバッファを返す
    return audioBuffer;
  }
}
