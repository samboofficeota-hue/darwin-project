/**
 * Redis接続テストAPI
 */

import { saveJobState, loadJobState } from '../../lib/storage.js';

export default async function handler(req, res) {
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const testJobId = 'test-redis-connection';
    const testData = {
      status: 'testing',
      message: 'Redis connection test',
      timestamp: new Date().toISOString()
    };

    // Redis接続テスト
    console.log('Testing Redis connection...');
    console.log('Environment variables:', {
      KV_REST_API_URL: process.env.KV_REST_API_URL ? 'SET' : 'NOT SET',
      KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN ? 'SET' : 'NOT SET'
    });

    // データを保存
    const saveResult = await saveJobState(testJobId, testData);
    console.log('Save result:', saveResult);

    // データを読み込み
    const loadedData = await loadJobState(testJobId);
    console.log('Loaded data:', loadedData);

    res.status(200).json({
      success: true,
      environment: {
        KV_REST_API_URL: process.env.KV_REST_API_URL ? 'SET' : 'NOT SET',
        KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN ? 'SET' : 'NOT SET'
      },
      saveResult,
      loadedData,
      message: 'Redis connection test completed'
    });

  } catch (error) {
    console.error('Redis test error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      environment: {
        KV_REST_API_URL: process.env.KV_REST_API_URL ? 'SET' : 'NOT SET',
        KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN ? 'SET' : 'NOT SET'
      }
    });
  }
}
