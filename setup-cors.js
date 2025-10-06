/**
 * Google Cloud StorageバケットのCORS設定
 * このスクリプトを実行してCORS設定を追加
 */

const { Storage } = require('@google-cloud/storage');

// Google Cloud Storage クライアントの初期化
const storage = new Storage({
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
  }
});

const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'darwin-project-audio-files';

async function setupCORS() {
  try {
    console.log(`Setting up CORS for bucket: ${BUCKET_NAME}`);
    
    const bucket = storage.bucket(BUCKET_NAME);
    
    // CORS設定
    const corsConfiguration = [
      {
        origin: ['https://darwin-project-gold.vercel.app', 'http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'],
        method: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'],
        responseHeader: ['Content-Type', 'Access-Control-Allow-Origin', 'Access-Control-Allow-Methods', 'Access-Control-Allow-Headers'],
        maxAgeSeconds: 3600
      }
    ];
    
    // バケットのCORS設定を更新
    await bucket.setCorsConfiguration(corsConfiguration);
    
    console.log('CORS configuration updated successfully!');
    console.log('CORS settings:', corsConfiguration);
    
  } catch (error) {
    console.error('Error setting up CORS:', error);
    throw error;
  }
}

// スクリプト実行
if (require.main === module) {
  setupCORS()
    .then(() => {
      console.log('CORS setup completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('CORS setup failed:', error);
      process.exit(1);
    });
}

module.exports = { setupCORS };
