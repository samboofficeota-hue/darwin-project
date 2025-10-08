/**
 * Google Speech-to-Text client and config helpers
 */

import { SpeechClient } from '@google-cloud/speech';

let cachedClient = null;

export function getSpeechClient() {
  if (cachedClient) return cachedClient;

  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.GCLOUD_PROJECT || undefined;

  // Prefer GOOGLE_APPLICATION_CREDENTIALS path if provided
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    cachedClient = new SpeechClient({
      projectId,
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    });
    return cachedClient;
  }

  // Fallback to explicit credentials fields if available
  if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    cachedClient = new SpeechClient({
      projectId,
      credentials: {
        type: 'service_account',
        project_id: projectId,
        private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
        private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        client_id: process.env.GOOGLE_CLIENT_ID,
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
        auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
        client_x509_cert_url: process.env.GOOGLE_CLIENT_X509_CERT_URL,
        universe_domain: 'googleapis.com'
      }
    });
    return cachedClient;
  }

  // Last resort: default ADC (useful on Cloud Run/GCE)
  cachedClient = new SpeechClient({ projectId });
  return cachedClient;
}

/**
 * Build recognize config with safe defaults.
 * If encoding and sampleRateHertz are unknown, omit them for auto-detection.
 */
export function buildRecognitionConfig(options = {}) {
  const {
    encoding,
    sampleRateHertz,
    languageCode = 'ja-JP',
    alternativeLanguageCodes = ['en-US'],
    enableWordTimeOffsets = true,
    enableWordConfidence = true,
    enableAutomaticPunctuation = true,
    diarization = true,
    diarizationSpeakerCount = undefined,
    useEnhanced = false,
    model = undefined,
    audioChannelCount,
    enableSeparateRecognitionPerChannel,
  } = options;

  const config = {
    languageCode,
    alternativeLanguageCodes,
    enableWordTimeOffsets,
    enableWordConfidence,
    enableAutomaticPunctuation,
  };

  if (encoding) config.encoding = encoding;
  if (sampleRateHertz) config.sampleRateHertz = sampleRateHertz;
  if (typeof audioChannelCount === 'number') config.audioChannelCount = audioChannelCount;
  if (typeof enableSeparateRecognitionPerChannel === 'boolean') {
    config.enableSeparateRecognitionPerChannel = enableSeparateRecognitionPerChannel;
  }

  // Speaker diarization
  if (diarization) {
    config.enableSpeakerDiarization = true;
    if (diarizationSpeakerCount) config.diarizationSpeakerCount = diarizationSpeakerCount;
  }

  // Enhanced/model settings (guard for availability)
  if (typeof useEnhanced === 'boolean') config.useEnhanced = useEnhanced;
  if (model) config.model = model;

  return config;
}

/**
 * Heuristics to pick encoding from file/container format. For containers like MP4/M4A, omit encoding.
 */
export function guessEncodingFromFormat(format) {
  if (!format) return undefined; // let API auto-detect
  const fmt = String(format).toLowerCase();
  if (fmt === 'mp3') return 'MP3';
  if (fmt === 'wav' || fmt === 'linear16') return 'LINEAR16';
  if (fmt === 'flac') return 'FLAC';
  if (fmt === 'webm' || fmt === 'webm_opus') return 'WEBM_OPUS';
  if (fmt === 'ogg' || fmt === 'opus' || fmt === 'ogg_opus') return 'OGG_OPUS';
  // MP4/M4A often contain AAC; Google recommends omitting encoding to auto-detect
  if (fmt === 'mp4' || fmt === 'm4a' || fmt === 'aac') return undefined;
  return undefined;
}

