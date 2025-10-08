/**
 * システムヘルスチェックAPI
 * 環境設定と外部サービスの接続状況を確認
 */

import { healthCheck, getConfigForLogging } from '../../lib/config.js';

export default async function handler(req, res) {
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const health = healthCheck();
    const config = getConfigForLogging();

    // 詳細情報の取得（クエリパラメータで制御）
    const includeDetails = req.query.details === 'true';
    const includeConfig = req.query.config === 'true';

    const response = {
      status: health.status,
      timestamp: health.timestamp,
      checks: health.checks
    };

    if (includeDetails) {
      // 外部サービスの接続テスト
      const externalChecks = await performExternalChecks();
      response.externalServices = externalChecks;
    }

    if (includeConfig) {
      response.configuration = config;
    }

    // ステータスコードの設定
    const statusCode = health.status === 'ok' ? 200 : 
                      health.status === 'warning' ? 200 : 503;

    res.status(statusCode).json(response);

  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Health check failed',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * 外部サービスの接続テスト
 */
async function performExternalChecks() {
  const checks = [];

  // Vimeo API接続テスト
  try {
    const vimeoCheck = await testVimeoConnection();
    checks.push({
      name: 'Vimeo API',
      status: vimeoCheck.success ? 'ok' : 'error',
      message: vimeoCheck.message,
      responseTime: vimeoCheck.responseTime
    });
  } catch (error) {
    checks.push({
      name: 'Vimeo API',
      status: 'error',
      message: error.message
    });
  }

  // Redis接続テスト
  try {
    const redisCheck = await testRedisConnection();
    checks.push({
      name: 'Redis',
      status: redisCheck.success ? 'ok' : 'error',
      message: redisCheck.message,
      responseTime: redisCheck.responseTime
    });
  } catch (error) {
    checks.push({
      name: 'Redis',
      status: 'error',
      message: error.message
    });
  }

  // Google Cloud Speech API接続テスト
  try {
    const speechCheck = await testSpeechAPIConnection();
    checks.push({
      name: 'Google Cloud Speech API',
      status: speechCheck.success ? 'ok' : 'error',
      message: speechCheck.message,
      responseTime: speechCheck.responseTime
    });
  } catch (error) {
    checks.push({
      name: 'Google Cloud Speech API',
      status: 'error',
      message: error.message
    });
  }

  return checks;
}

/**
 * Vimeo API接続テスト
 */
async function testVimeoConnection() {
  const startTime = Date.now();
  
  try {
    if (!process.env.VIMEO_ACCESS_TOKEN) {
      return {
        success: false,
        message: 'Vimeo access token not configured',
        responseTime: Date.now() - startTime
      };
    }

    const response = await fetch('https://api.vimeo.com/me', {
      headers: {
        'Authorization': `Bearer ${process.env.VIMEO_ACCESS_TOKEN}`,
        'Accept': 'application/vnd.vimeo.*+json;version=3.4'
      }
    });

    return {
      success: response.ok,
      message: response.ok ? 'Connected successfully' : `HTTP ${response.status}`,
      responseTime: Date.now() - startTime
    };
  } catch (error) {
    return {
      success: false,
      message: error.message,
      responseTime: Date.now() - startTime
    };
  }
}

/**
 * Redis接続テスト
 */
async function testRedisConnection() {
  const startTime = Date.now();
  
  try {
    if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
      return {
        success: false,
        message: 'Redis credentials not configured',
        responseTime: Date.now() - startTime
      };
    }

    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });

    const testKey = `health-check-${Date.now()}`;
    await redis.set(testKey, 'test', { ex: 10 });
    const result = await redis.get(testKey);
    await redis.del(testKey);

    return {
      success: result === 'test',
      message: result === 'test' ? 'Connected successfully' : 'Connection test failed',
      responseTime: Date.now() - startTime
    };
  } catch (error) {
    return {
      success: false,
      message: error.message,
      responseTime: Date.now() - startTime
    };
  }
}

/**
 * Google Cloud Speech API接続テスト
 */
async function testSpeechAPIConnection() {
  const startTime = Date.now();
  
  try {
    const { SpeechClient } = await import('@google-cloud/speech');
    
    const client = new SpeechClient({
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || 'whgc-project',
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    });

    // 簡単な設定テスト（実際の音声データは送信しない）
    const config = {
      encoding: 'LINEAR16',
      sampleRateHertz: 16000,
      languageCode: 'ja-JP',
    };

    // クライアントの初期化が成功すればOK
    return {
      success: true,
      message: 'Client initialized successfully',
      responseTime: Date.now() - startTime
    };
  } catch (error) {
    return {
      success: false,
      message: error.message,
      responseTime: Date.now() - startTime
    };
  }
}