/**
 * 環境変数の管理とバリデーション
 * フォールバック機能付きの設定管理
 */

/**
 * 必須環境変数の検証
 */
export function validateEnvironment() {
  const requiredVars = [
    'GOOGLE_CLOUD_PROJECT_ID',
    'VIMEO_ACCESS_TOKEN',
    'KV_REST_API_URL',
    'KV_REST_API_TOKEN'
  ];

  const missing = [];
  const warnings = [];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  // オプション環境変数のチェック
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    warnings.push('GOOGLE_APPLICATION_CREDENTIALS is not set. Using default credentials.');
  }

  if (!process.env.GCS_BUCKET_NAME) {
    warnings.push('GCS_BUCKET_NAME is not set. File storage may not work properly.');
  }

  return {
    isValid: missing.length === 0,
    missing,
    warnings
  };
}

/**
 * 設定値の取得（フォールバック付き）
 */
export function getConfig() {
  const validation = validateEnvironment();
  
  if (!validation.isValid) {
    console.error('Missing required environment variables:', validation.missing);
    console.warn('Warnings:', validation.warnings);
  }

  return {
    // Google Cloud設定
    googleCloud: {
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || 'whgc-project',
      credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      bucketName: process.env.GCS_BUCKET_NAME || 'darwin-project-audio'
    },

    // Vimeo設定
    vimeo: {
      accessToken: process.env.VIMEO_ACCESS_TOKEN,
      apiVersion: '3.4',
      userAgent: 'Darwin-Project/1.0',
      rateLimit: {
        maxRetries: 5,
        baseDelay: 2000,
        maxDelay: 60000
      }
    },

    // Redis設定
    redis: {
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
      ttl: 3600 // 1時間
    },

    // API設定
    api: {
      timeout: 30000, // 30秒
      maxFileSize: 2 * 1024 * 1024 * 1024, // 2GB
      chunkSize: 50 * 1024 * 1024, // 50MB
      maxConcurrentChunks: 3
    },

    // 音声処理設定
    audio: {
      maxDuration: 4 * 60 * 60, // 4時間
      chunkDuration: {
        small: 120,  // 2分（10分以下の動画）
        medium: 300, // 5分（30分以下の動画）
        large: 600   // 10分（30分以上の動画）
      },
      sampleRate: 16000,
      channels: 1,
      encoding: 'LINEAR16'
    },

    // セキュリティ設定
    security: {
      allowedOrigins: [
        'https://darwin-project-574364248563.asia-northeast1.run.app',
        'https://darwin-project.vercel.app',
        'http://localhost:3000'
      ],
      maxRequestsPerMinute: 60,
      sessionTimeout: 24 * 60 * 60 * 1000 // 24時間
    },

    // 環境情報
    environment: {
      isProduction: process.env.NODE_ENV === 'production',
      isDevelopment: process.env.NODE_ENV === 'development',
      isValid: validation.isValid,
      missing: validation.missing,
      warnings: validation.warnings
    }
  };
}

/**
 * 設定の健全性チェック
 */
export function healthCheck() {
  const config = getConfig();
  const checks = [];

  // Google Cloud接続チェック
  checks.push({
    name: 'Google Cloud Configuration',
    status: config.googleCloud.projectId ? 'ok' : 'error',
    message: config.googleCloud.projectId ? 'Project ID configured' : 'Missing GOOGLE_CLOUD_PROJECT_ID'
  });

  // Vimeo API接続チェック
  checks.push({
    name: 'Vimeo API Configuration',
    status: config.vimeo.accessToken ? 'ok' : 'error',
    message: config.vimeo.accessToken ? 'Access token configured' : 'Missing VIMEO_ACCESS_TOKEN'
  });

  // Redis接続チェック
  checks.push({
    name: 'Redis Configuration',
    status: (config.redis.url && config.redis.token) ? 'ok' : 'warning',
    message: (config.redis.url && config.redis.token) ? 'Redis configured' : 'Redis not configured - using memory fallback'
  });

  const overallStatus = checks.some(c => c.status === 'error') ? 'error' : 
                       checks.some(c => c.status === 'warning') ? 'warning' : 'ok';

  return {
    status: overallStatus,
    checks,
    timestamp: new Date().toISOString()
  };
}

/**
 * 環境変数の安全な取得
 */
export function getEnvVar(name, defaultValue = null, required = false) {
  const value = process.env[name];
  
  if (!value && required) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  
  return value || defaultValue;
}

/**
 * 設定の出力（機密情報をマスク）
 */
export function getConfigForLogging() {
  const config = getConfig();
  
  return {
    ...config,
    vimeo: {
      ...config.vimeo,
      accessToken: config.vimeo.accessToken ? '***masked***' : null
    },
    redis: {
      ...config.redis,
      token: config.redis.token ? '***masked***' : null
    }
  };
}