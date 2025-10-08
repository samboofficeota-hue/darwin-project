/**
 * Google Speech-to-Text APIを使用した文字起こし機能
 * 音声データを直接受け取って文字起こしを実行
 */

import { SpeechClient } from '@google-cloud/speech';
import { getConfig, validateEnvironment } from '../../lib/config.js';
import { SpeechAPIClient } from '../../lib/http-client.js';

// 設定の取得と検証
const appConfig = getConfig();
const validation = validateEnvironment();

if (!validation.isValid) {
  console.error('Environment validation failed:', validation.missing);
}

// Google Cloud Speech-to-Text クライアントの初期化
const speechClient = new SpeechClient({
  projectId: appConfig.googleCloud.projectId,
  keyFilename: appConfig.googleCloud.credentials,
});

// リトライ機能付きSpeech APIクライアント
const speechAPIClient = new SpeechAPIClient();

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
    const { audioData, format = 'mp4', startTime = 0, duration = 300 } = req.body;

    if (!audioData) {
      return res.status(400).json({ error: '音声データが必要です' });
    }

    // Base64デコード
    const audioBuffer = Buffer.from(audioData, 'base64');

    // 文字起こしの実行
    const transcriptionResult = await transcribeAudio(audioBuffer, format, startTime, duration);

    res.status(200).json({
      status: 'success',
      transcription: transcriptionResult,
      startTime,
      duration: transcriptionResult.duration || duration
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
async function transcribeAudio(audioBuffer, format, startTime, duration) {
  try {
    // 音声データをBase64エンコード
    const audioBytes = audioBuffer.toString('base64');

    // 音声設定
    const audio = {
      content: audioBytes,
    };

    // 言語設定（日本語）
    const speechConfig = {
      encoding: getAudioEncoding(format),
      sampleRateHertz: appConfig.audio.sampleRate,
      languageCode: 'ja-JP',
      alternativeLanguageCodes: ['en-US'], // 英語も対応
      enableAutomaticPunctuation: true,
      enableWordTimeOffsets: true,
      enableWordConfidence: true,
      model: 'latest_long', // 長尺音声用のモデル
      useEnhanced: true, // 高精度モード
    };

    // 文字起こしの実行（リトライ機能付き）
    const request = {
      audio: audio,
      config: speechConfig,
    };

    console.log('Starting transcription with retry support...');
    const response = await speechAPIClient.transcribeWithRetry(speechClient, request);

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
      duration: duration,
      wordCount: fullText.split(' ').length,
      startTime: startTime,
      endTime: startTime + duration
    };

  } catch (error) {
    console.error('Speech-to-Text API error:', error);
    throw new Error(`文字起こし処理エラー: ${error.message}`);
  }
}

/**
 * フォーマットから音声エンコーディングを取得
 */
function getAudioEncoding(format) {
  const encodingMap = {
    'mp3': 'MP3',
    'wav': 'LINEAR16',
    'mp4': 'MP4',
    'm4a': 'MP4',
    'webm': 'WEBM_OPUS',
  };
  return encodingMap[format] || 'MP4';
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
