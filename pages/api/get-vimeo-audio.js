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

    // Vimeo APIから動画のダウンロードリンクを取得
    const downloadInfo = await getVimeoDownloadLinks(videoId);
    if (!downloadInfo) {
      return res.status(400).json({ error: '動画のダウンロードリンクを取得できませんでした' });
    }

    // 音声ファイルをダウンロード
    const audioBuffer = await downloadVimeoAudio(downloadInfo.audioUrl);
    
    // 指定された時間範囲の音声を抽出
    const extractedAudio = await extractAudioSegment(audioBuffer, startTime, duration);

    // 音声データをBase64エンコードして返す
    const base64Audio = extractedAudio.toString('base64');

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
 * Vimeo APIから動画のダウンロードリンクを取得
 */
async function getVimeoDownloadLinks(videoId) {
  try {
    if (!process.env.VIMEO_ACCESS_TOKEN) {
      throw new Error('Vimeo APIトークンが設定されていません');
    }

    // Vimeo APIで動画の詳細情報を取得
    const response = await fetch(`https://api.vimeo.com/videos/${videoId}`, {
      headers: {
        'Authorization': `Bearer ${process.env.VIMEO_ACCESS_TOKEN}`,
        'Accept': 'application/vnd.vimeo.*+json;version=3.4'
      }
    });

    if (!response.ok) {
      throw new Error(`Vimeo API error: ${response.status}`);
    }

    const videoData = await response.json();
    
    // 動画ファイルの情報を取得
    const files = videoData.files || [];
    
    // 音声付きのファイルを探す（MP4形式を優先）
    const audioFile = files.find(file => 
      file.type === 'video/mp4' && 
      file.quality === 'hls' && 
      file.size > 0
    );

    if (!audioFile) {
      throw new Error('音声付きの動画ファイルが見つかりません');
    }

    return {
      audioUrl: audioFile.link,
      format: 'mp4',
      size: audioFile.size,
      quality: audioFile.quality
    };

  } catch (error) {
    console.error('Error getting Vimeo download links:', error);
    throw error;
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
 * 注意: 実際の実装では、FFmpegなどの音声処理ライブラリが必要
 */
async function extractAudioSegment(audioBuffer, startTime, duration) {
  try {
    // 簡易実装: 実際の実装ではFFmpegを使用
    // ここでは元のバッファをそのまま返す
    // 実際のプロダクションでは、FFmpegで音声を切り出し
    
    const startByte = Math.floor((startTime / 300) * audioBuffer.length); // 5分を300秒と仮定
    const endByte = Math.floor(((startTime + duration) / 300) * audioBuffer.length);
    
    return audioBuffer.slice(startByte, endByte);

  } catch (error) {
    console.error('Error extracting audio segment:', error);
    throw error;
  }
}
