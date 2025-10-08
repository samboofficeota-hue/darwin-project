/**
 * Google Speech-to-Text APIを使用した文字起こし機能
 * 音声データを直接受け取って文字起こしを実行
 */

import { getSpeechClient, buildRecognitionConfig, guessEncodingFromFormat } from '../../lib/google-speech.js';
import { rateLimit } from '../../lib/rate-limit.js';

// Google Cloud Speech-to-Text クライアント
const speechClient = getSpeechClient();

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
    const { audioData, format = 'mp4', startTime = 0, duration = 300, diarization = true } = req.body;

    // Rate limit per IP
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString();
    const allowed = await rateLimit(`transcribe:single:${ip}`, { windowSec: 60, limit: 12 });
    if (!allowed) {
      return res.status(429).json({ error: 'リクエストが多すぎます。しばらくしてから再試行してください。' });
    }

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

    // 設定（安全な自動判別を優先）
    const config = buildRecognitionConfig({
      encoding: guessEncodingFromFormat(format),
      // omit sampleRateHertz to allow auto-detection for compressed formats
      languageCode: 'ja-JP',
      alternativeLanguageCodes: ['en-US'],
      enableAutomaticPunctuation: true,
      enableWordTimeOffsets: true,
      enableWordConfidence: true,
      diarization: !!diarization,
      // Enhanced model may not be available for all locales; avoid hard-coding
      useEnhanced: false,
      model: undefined,
    });

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

// removed local encoding map; using guessEncodingFromFormat in lib

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
