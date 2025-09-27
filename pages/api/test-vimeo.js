/**
 * Vimeo API接続テスト用のエンドポイント
 */

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
    const vimeoToken = process.env.VIMEO_ACCESS_TOKEN;
    
    if (!vimeoToken) {
      return res.status(500).json({ 
        error: 'Vimeo API token not configured',
        status: 'missing_token'
      });
    }

    // Vimeo APIの基本情報を取得
    const response = await fetch('https://api.vimeo.com/me', {
      headers: {
        'Authorization': `Bearer ${vimeoToken}`,
        'Accept': 'application/vnd.vimeo.*+json;version=3.4'
      }
    });

    if (!response.ok) {
      return res.status(500).json({
        error: 'Vimeo API connection failed',
        status: 'api_error',
        statusCode: response.status,
        statusText: response.statusText
      });
    }

    const userData = await response.json();

    res.status(200).json({
      status: 'success',
      message: 'Vimeo API connection successful',
      user: {
        name: userData.name,
        uri: userData.uri,
        account: userData.account
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Vimeo API test error:', error);
    res.status(500).json({
      error: 'Vimeo API test failed',
      details: error.message,
      status: 'test_error'
    });
  }
}
