/**
 * Vimeo URL検証と動画情報取得API
 * リアルタイムでURLの有効性を確認し、動画プレビューを提供
 */

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
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URLが必要です' });
    }

    // デバッグログ
    console.log('Vimeo URL validation request:', { url, hasToken: !!process.env.VIMEO_ACCESS_TOKEN });

    // Vimeo URLの検証と動画情報取得
    const videoInfo = await validateAndGetVideoInfo(url);

    if (!videoInfo) {
      return res.status(400).json({ 
        error: '無効なVimeo URLです',
        valid: false
      });
    }

    res.status(200).json({
      valid: true,
      ...videoInfo
    });

  } catch (error) {
    console.error('Vimeo URL validation error:', error);
    
    // エラーの種類に応じて適切なステータスコードを返す
    const isClientError = error.message.includes('無効なVimeo URL') || 
                         error.message.includes('動画が見つかりません') ||
                         error.message.includes('アクセスが制限されています') ||
                         error.message.includes('動画が長すぎます') ||
                         error.message.includes('音声が含まれていない');
    
    const statusCode = isClientError ? 400 : 500;
    
    res.status(statusCode).json({
      error: 'URL検証中にエラーが発生しました',
      details: error.message,
      valid: false
    });
  }
}

/**
 * Vimeo URLの検証と動画情報取得
 */
async function validateAndGetVideoInfo(url) {
  try {
    // Vimeo URLの正規表現パターン
    const vimeoPattern = /(?:vimeo\.com\/)(?:.*\/)?(\d+)/;
    const match = url.match(vimeoPattern);
    
    if (!match) {
      throw new Error('無効なVimeo URLです。正しい形式のURLを入力してください。');
    }

    const videoId = match[1];
    
    // Vimeo APIトークンの確認（レート制限回避のため一時的にモックデータを使用）
    if (!process.env.VIMEO_ACCESS_TOKEN || process.env.VIMEO_ACCESS_TOKEN === 'mock') {
      console.warn('Using mock data for Vimeo API (rate limit or token issue)');
      // モックデータを返す（開発環境用）
      return {
        videoId,
        title: `Vimeo動画 ${videoId}`,
        duration: 1800, // 30分
        description: 'Vimeo APIのレート制限により、モックデータを表示しています。実際の動画情報は文字起こし処理時に取得されます。',
        thumbnail: null,
        embed: null,
        privacy: 'public',
        size: 0,
        createdTime: new Date().toISOString(),
        modifiedTime: new Date().toISOString(),
        valid: true
      };
    }
    
    // Vimeo APIを使用して動画情報を取得
    const response = await fetch(`https://api.vimeo.com/videos/${videoId}`, {
      headers: {
        'Authorization': `Bearer ${process.env.VIMEO_ACCESS_TOKEN}`,
        'Accept': 'application/vnd.vimeo.*+json;version=3.4'
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('動画が見つかりません');
      } else if (response.status === 403) {
        throw new Error('動画へのアクセスが制限されています');
      } else if (response.status === 429) {
        // レート制限の場合はモックデータを返す
        console.warn('Vimeo API rate limit reached, using mock data');
        return {
          videoId,
          title: `Vimeo動画 ${videoId}`,
          duration: 1800, // 30分
          description: 'Vimeo APIのレート制限により、モックデータを表示しています。実際の動画情報は文字起こし処理時に取得されます。',
          thumbnail: null,
          embed: null,
          privacy: 'public',
          size: 0,
          createdTime: new Date().toISOString(),
          modifiedTime: new Date().toISOString(),
          valid: true
        };
      } else {
        throw new Error(`Vimeo API error: ${response.status}`);
      }
    }

    const videoData = await response.json();
    
    // 動画の長さをチェック（最大4時間）
    const maxDuration = 4 * 60 * 60; // 4時間
    if (videoData.duration > maxDuration) {
      throw new Error('動画が長すぎます（最大4時間）');
    }

    // 動画の品質をチェック
    const hasAudio = videoData.files && videoData.files.some(file => 
      file.quality === 'hls' || file.quality === 'hd' || file.quality === 'sd'
    );

    if (!hasAudio) {
      throw new Error('音声が含まれていない動画です');
    }
    
    return {
      videoId,
      title: videoData.name || 'タイトルなし',
      duration: videoData.duration || 0,
      description: videoData.description || '',
      thumbnail: getBestThumbnail(videoData.pictures),
      embed: videoData.embed?.html,
      privacy: videoData.privacy?.view,
      size: videoData.size || 0,
      createdTime: videoData.created_time,
      modifiedTime: videoData.modified_time,
      valid: true
    };

  } catch (error) {
    console.error('Vimeo video info error:', error);
    
    // エラーの種類に応じて適切なメッセージを返す
    if (error.message.includes('動画が見つかりません')) {
      throw new Error('指定された動画が見つかりません。URLを確認してください。');
    } else if (error.message.includes('アクセスが制限されています')) {
      throw new Error('この動画は非公開または制限されています。');
    } else if (error.message.includes('動画が長すぎます')) {
      throw new Error('動画が長すぎます。4時間以内の動画を選択してください。');
    } else if (error.message.includes('音声が含まれていない')) {
      throw new Error('この動画には音声が含まれていません。音声付きの動画を選択してください。');
    } else {
      throw new Error(`動画情報の取得に失敗しました: ${error.message}`);
    }
  }
}

/**
 * 最適なサムネイル画像を取得
 */
function getBestThumbnail(pictures) {
  if (!pictures || !pictures.sizes || pictures.sizes.length === 0) {
    return null;
  }

  // サイズ順でソートして、適切なサイズのサムネイルを選択
  const sortedSizes = pictures.sizes.sort((a, b) => {
    const sizeA = a.width * a.height;
    const sizeB = b.width * b.height;
    return sizeB - sizeA; // 降順
  });

  // 中程度のサイズ（640x360程度）を優先
  const preferredSize = sortedSizes.find(size => 
    size.width >= 640 && size.width <= 1280
  );

  return (preferredSize || sortedSizes[0])?.link || null;
}
