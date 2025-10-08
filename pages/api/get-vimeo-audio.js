/**
 * Vimeo動画から音声データを取得するAPI
 * 実際の音声ストリームをダウンロードして返す
 */

import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { VimeoAPIClient, fetchWithTimeout } from '../../lib/http-client.js';
import { AudioProcessor, FallbackAudioProcessor } from '../../lib/audio-processor.js';

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
    const audioProcessor = new AudioProcessor();
    
    try {
      extractedAudio = await audioProcessor.extractAudioSegment(audioBuffer, startTime, duration);
      console.log(`Extracted audio segment: ${extractedAudio.length} bytes`);
    } catch (extractError) {
      console.warn('FFmpeg extraction failed, using fallback method:', extractError.message);
      // フォールバック: 簡易的な抽出方法
      const fallbackProcessor = new FallbackAudioProcessor();
      extractedAudio = fallbackProcessor.extractAudioSegmentFallback(audioBuffer, startTime, duration);
      console.log(`Fallback extracted audio segment: ${extractedAudio.length} bytes`);
    } finally {
      // クリーンアップ
      audioProcessor.cleanup();
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
 * Vimeo APIから動画のダウンロードリンクを取得（統一されたHTTPクライアント使用）
 */
async function getVimeoDownloadLinks(videoId) {
  try {
    console.log(`Getting Vimeo download links for video ${videoId}`);

    const vimeoClient = new VimeoAPIClient();
    const videoData = await vimeoClient.getVideo(videoId);
    
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
    console.error('Error getting Vimeo download links:', error);
    throw error;
  }
}

/**
 * Vimeoから音声ファイルをダウンロード（タイムアウト付き）
 */
async function downloadVimeoAudio(audioUrl) {
  try {
    console.log(`Downloading audio from: ${audioUrl}`);
    
    const response = await fetchWithTimeout(audioUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Darwin-Project/1.0'
      }
    }, 120000); // 2分タイムアウト
    
    if (!response.ok) {
      throw new Error(`Audio download failed: ${response.status} ${response.statusText}`);
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      console.log(`Downloading ${Math.round(parseInt(contentLength) / 1024 / 1024 * 100) / 100} MB`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    console.log(`Downloaded ${Math.round(buffer.length / 1024 / 1024 * 100) / 100} MB successfully`);
    return buffer;

  } catch (error) {
    console.error('Error downloading Vimeo audio:', error);
    if (error.message.includes('timeout')) {
      throw new Error('音声ダウンロードがタイムアウトしました。ファイルサイズが大きすぎる可能性があります。');
    }
    throw error;
  }
}
