/**
 * 環境変数の詳細チェックAPI
 * GOOGLE_PRIVATE_KEYなどの設定状態を確認
 */

import { Storage } from '@google-cloud/storage';
import { SpeechClient } from '@google-cloud/speech';

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

  const results = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    checks: {}
  };

  // 1. 基本環境変数のチェック
  results.checks.basicEnv = {
    GOOGLE_CLOUD_PROJECT_ID: checkEnvVar('GOOGLE_CLOUD_PROJECT_ID'),
    GOOGLE_CLIENT_EMAIL: checkEnvVar('GOOGLE_CLIENT_EMAIL'),
    GOOGLE_PRIVATE_KEY_ID: checkEnvVar('GOOGLE_PRIVATE_KEY_ID'),
    GOOGLE_CLIENT_ID: checkEnvVar('GOOGLE_CLIENT_ID'),
    GCS_BUCKET_NAME: checkEnvVar('GCS_BUCKET_NAME'),
    KV_REST_API_URL: checkEnvVar('KV_REST_API_URL'),
    KV_REST_API_TOKEN: checkEnvVar('KV_REST_API_TOKEN')
  };

  // 2. GOOGLE_PRIVATE_KEYの詳細チェック
  const privateKeyCheck = checkPrivateKey();
  results.checks.privateKey = privateKeyCheck;

  // 3. Google Cloud Storage接続テスト
  try {
    const storageCheck = await testStorageConnection();
    results.checks.storage = storageCheck;
  } catch (error) {
    results.checks.storage = {
      status: 'error',
      error: error.message
    };
  }

  // 4. Speech API接続テスト
  try {
    const speechCheck = await testSpeechConnection();
    results.checks.speech = speechCheck;
  } catch (error) {
    results.checks.speech = {
      status: 'error',
      error: error.message
    };
  }

  // 5. 全体のステータス判定
  const allChecks = [
    ...Object.values(results.checks.basicEnv),
    privateKeyCheck.status,
    results.checks.storage.status,
    results.checks.speech.status
  ];

  const hasError = allChecks.includes('error');
  const hasWarning = allChecks.includes('warning');

  results.overallStatus = hasError ? 'error' : hasWarning ? 'warning' : 'ok';

  // ステータスコードの設定
  const statusCode = results.overallStatus === 'ok' ? 200 : 
                    results.overallStatus === 'warning' ? 200 : 500;

  res.status(statusCode).json(results);
}

/**
 * 環境変数の存在チェック
 */
function checkEnvVar(name) {
  const value = process.env[name];
  if (!value) {
    return 'error';
  }
  return 'ok';
}

/**
 * GOOGLE_PRIVATE_KEYの詳細チェック
 */
function checkPrivateKey() {
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!privateKey) {
    return {
      status: 'error',
      message: 'GOOGLE_PRIVATE_KEY is not set',
      details: {
        exists: false
      }
    };
  }

  const details = {
    exists: true,
    length: privateKey.length,
    startsWithBegin: privateKey.trim().startsWith('-----BEGIN PRIVATE KEY-----'),
    endsWithEnd: privateKey.trim().endsWith('-----END PRIVATE KEY-----'),
    hasNewlines: privateKey.includes('\n'),
    hasEscapedNewlines: privateKey.includes('\\n'),
    isMultiline: privateKey.split('\n').length > 1
  };

  // 検証
  const isValid = 
    details.startsWithBegin &&
    details.endsWithEnd &&
    details.hasNewlines &&
    !details.hasEscapedNewlines &&
    details.length > 100;

  let status = 'ok';
  let message = 'Private key is properly configured';
  const warnings = [];

  if (!details.startsWithBegin) {
    status = 'error';
    message = 'Private key does not start with -----BEGIN PRIVATE KEY-----';
  } else if (!details.endsWithEnd) {
    status = 'error';
    message = 'Private key does not end with -----END PRIVATE KEY-----';
  } else if (details.hasEscapedNewlines && !details.hasNewlines) {
    status = 'warning';
    message = 'Private key contains escaped newlines (\\n) but no actual newlines';
    warnings.push('You may need to replace \\n with actual newlines');
  } else if (!details.hasNewlines) {
    status = 'error';
    message = 'Private key does not contain newline characters';
  } else if (details.length < 100) {
    status = 'error';
    message = 'Private key is too short';
  }

  return {
    status,
    message,
    details,
    warnings: warnings.length > 0 ? warnings : undefined
  };
}

/**
 * Google Cloud Storage接続テスト
 */
async function testStorageConnection() {
  try {
    // サービスアカウントキーを構築
    const serviceAccountKey = {
      type: 'service_account',
      project_id: process.env.GOOGLE_CLOUD_PROJECT_ID,
      private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      client_id: process.env.GOOGLE_CLIENT_ID,
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
      client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(process.env.GOOGLE_CLIENT_EMAIL || '')}`,
      universe_domain: 'googleapis.com'
    };

    const storage = new Storage({
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
      credentials: serviceAccountKey
    });

    const bucketName = process.env.GCS_BUCKET_NAME || 'darwin-project-audio-files';
    const bucket = storage.bucket(bucketName);
    
    // バケットの存在確認
    const [exists] = await bucket.exists();

    return {
      status: exists ? 'ok' : 'warning',
      message: exists ? 'Bucket exists and accessible' : `Bucket ${bucketName} does not exist`,
      details: {
        bucketName,
        exists
      }
    };
  } catch (error) {
    return {
      status: 'error',
      message: 'Failed to connect to Google Cloud Storage',
      error: error.message,
      errorCode: error.code
    };
  }
}

/**
 * Speech API接続テスト
 */
async function testSpeechConnection() {
  try {
    const client = new SpeechClient({
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
      credentials: {
        type: 'service_account',
        project_id: process.env.GOOGLE_CLOUD_PROJECT_ID,
        private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        client_id: process.env.GOOGLE_CLIENT_ID,
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
        auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
        client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(process.env.GOOGLE_CLIENT_EMAIL || '')}`,
        universe_domain: 'googleapis.com'
      },
      fallback: true
    });

    // クライアントの初期化が成功すればOK
    return {
      status: 'ok',
      message: 'Speech API client initialized successfully'
    };
  } catch (error) {
    return {
      status: 'error',
      message: 'Failed to initialize Speech API client',
      error: error.message,
      errorCode: error.code
    };
  }
}

