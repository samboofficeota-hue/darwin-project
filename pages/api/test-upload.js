/**
 * アップロード機能のテスト用API
 */

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
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
    const { testData, fileName } = req.body;

    console.log('Test upload received:', {
      fileName,
      dataType: typeof testData,
      dataLength: testData?.length || 0,
      environment: {
        isVercel: !!process.env.VERCEL,
        hasRedis: !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN),
        hasGoogleCredentials: !!process.env.GOOGLE_APPLICATION_CREDENTIALS
      }
    });

    // 基本的な検証
    if (!testData || !fileName) {
      return res.status(400).json({ 
        error: 'testData and fileName are required',
        received: { testData: !!testData, fileName }
      });
    }

    // Base64データの検証
    if (typeof testData !== 'string') {
      return res.status(400).json({ 
        error: 'testData must be a string',
        dataType: typeof testData
      });
    }

    // 簡単なBase64デコードテスト
    try {
      const buffer = Buffer.from(testData, 'base64');
      console.log(`Base64 decode successful: ${buffer.length} bytes`);
    } catch (decodeError) {
      return res.status(400).json({ 
        error: 'Invalid Base64 data',
        details: decodeError.message
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Test upload successful',
      fileInfo: {
        fileName,
        dataLength: testData.length,
        decodedSize: Buffer.from(testData, 'base64').length
      },
      environment: {
        isVercel: !!process.env.VERCEL,
        hasRedis: !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN),
        hasGoogleCredentials: !!process.env.GOOGLE_APPLICATION_CREDENTIALS
      }
    });

  } catch (error) {
    console.error('Test upload error:', error);
    res.status(500).json({
      error: 'Test upload failed',
      details: error.message,
      stack: error.stack
    });
  }
}
