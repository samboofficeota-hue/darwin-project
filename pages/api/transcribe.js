/**
 * Google Speech-to-Text APIを使用した文字起こし機能
 * 講演動画（1時間以上の長尺）に対応
 */

import { SpeechClient } from '@google-cloud/speech';
import fs from 'fs';
import path from 'path';

// Google Cloud Speech-to-Text クライアントの初期化
const speechClient = new SpeechClient({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || 'whgc-project',
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

export const config = {
  api: {
    bodyParser: false, // ファイルアップロードのため無効化
    sizeLimit: '2gb', // 2時間の動画ファイル対応
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
    // ファイルアップロードの処理（Next.js 14対応）
    const formData = await req.formData();
    const audioFile = formData.get('audio');

    if (!audioFile || typeof audioFile === 'string') {
      return res.status(400).json({ error: '音声ファイルが指定されていません' });
    }

    // ファイル形式の検証
    const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/m4a', 'video/mp4'];
    if (!allowedTypes.includes(audioFile.type)) {
      return res.status(400).json({ 
        error: 'サポートされていないファイル形式です',
        supportedTypes: allowedTypes
      });
    }

    // ファイルサイズの検証
    const maxSize = 2 * 1024 * 1024 * 1024; // 2GB
    if (audioFile.size > maxSize) {
      return res.status(400).json({ error: 'ファイルサイズが大きすぎます（最大2GB）' });
    }

    // 一時ファイルとして保存
    const uploadDir = process.env.UPLOAD_DIR || '/tmp/uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    const tempFilePath = path.join(uploadDir, `temp-${Date.now()}-${audioFile.name}`);
    const arrayBuffer = await audioFile.arrayBuffer();
    fs.writeFileSync(tempFilePath, Buffer.from(arrayBuffer));

    // 文字起こしの実行
    const transcriptionResult = await transcribeAudio(tempFilePath, audioFile.type);

    // 一時ファイルの削除
    fs.unlinkSync(tempFilePath);

    res.status(200).json({
      status: 'success',
      transcription: transcriptionResult,
      filename: audioFile.name,
      fileSize: audioFile.size,
      duration: transcriptionResult.duration || 'unknown'
    });

  } catch (error) {
    console.error('Transcription error:', error);
    res.status(500).json({ 
      error: '文字起こしエラーが発生しました',
      details: error.message 
    });
  }
}

/**
 * Google Speech-to-Text APIを使用して音声を文字起こし
 */
async function transcribeAudio(filePath, mimeType) {
  try {
    // 音声ファイルを読み込み
    const audioBytes = fs.readFileSync(filePath).toString('base64');

    // 音声設定
    const audio = {
      content: audioBytes,
    };

    // 言語設定（日本語）
    const config = {
      encoding: getAudioEncoding(mimeType),
      sampleRateHertz: 16000,
      languageCode: 'ja-JP',
      alternativeLanguageCodes: ['en-US'], // 英語も対応
      enableAutomaticPunctuation: true,
      enableWordTimeOffsets: true,
      enableWordConfidence: true,
      model: 'latest_long', // 長尺音声用のモデル
      useEnhanced: true, // 高精度モード
    };

    // 文字起こしの実行
    const [operation] = await speechClient.longRunningRecognize({
      audio: audio,
      config: config,
    });

    console.log('Transcription operation started:', operation.name);

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

    return {
      text: fullText,
      segments: transcriptions,
      totalConfidence: calculateAverageConfidence(transcriptions),
      duration: calculateDuration(transcriptions),
      wordCount: fullText.split(' ').length
    };

  } catch (error) {
    console.error('Speech-to-Text API error:', error);
    throw new Error(`文字起こし処理エラー: ${error.message}`);
  }
}

/**
 * MIMEタイプから音声エンコーディングを取得
 */
function getAudioEncoding(mimeType) {
  const encodingMap = {
    'audio/mpeg': 'MP3',
    'audio/wav': 'LINEAR16',
    'audio/mp4': 'MP4',
    'audio/m4a': 'MP4',
    'video/mp4': 'MP4',
  };
  return encodingMap[mimeType] || 'MP3';
}

/**
 * 平均信頼度を計算
 */
function calculateAverageConfidence(transcriptions) {
  if (transcriptions.length === 0) return 0;
  const totalConfidence = transcriptions.reduce((sum, t) => sum + (t.confidence || 0), 0);
  return totalConfidence / transcriptions.length;
}

/**
 * 音声の長さを計算（概算）
 */
function calculateDuration(transcriptions) {
  if (transcriptions.length === 0) return 0;
  const lastWord = transcriptions[transcriptions.length - 1]?.words?.slice(-1)[0];
  return lastWord ? lastWord.endTime?.seconds || 0 : 0;
}
