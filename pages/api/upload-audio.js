/**
 * 音声ファイルアップロードAPI
 * 公益資本主義「智の泉」プロジェクト用
 */

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '2gb', // 2時間の音声ファイル対応
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
    const { file, folder_path = '智の泉/01_講演録' } = req.body;

    if (!file) {
      return res.status(400).json({ error: 'ファイルが指定されていません' });
    }

    // ファイルサイズの制限（2GB）
    const maxSize = 2 * 1024 * 1024 * 1024; // 2GB
    if (file.size > maxSize) {
      return res.status(413).json({ error: 'ファイルサイズが大きすぎます（最大2GB）' });
    }

    // ファイル形式の検証
    const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/m4a'];
    if (!allowedTypes.includes(file.type)) {
      return res.status(400).json({ error: 'サポートされていないファイル形式です' });
    }

    // ファイルアップロード処理
    const uploadResult = await uploadFile(file, folder_path);

    if (uploadResult.status === 'error') {
      return res.status(500).json({ error: uploadResult.message });
    }

    res.status(200).json(uploadResult);

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'アップロードエラーが発生しました' });
  }
}

/**
 * ファイルをアップロード
 * 実際の実装では、データベースまたはストレージに保存
 */
async function uploadFile(file, folder_path) {
  try {
    // ファイルIDを生成
    const file_id = generateFileId();
    
    // 一時URLを生成（30分有効）
    const temp_url = `https://darwin-project.vercel.app/files/${file_id}`;
    
    // 実際のアップロード処理
    // ここでは、ローカルストレージまたはデータベースに保存
    const uploadSuccess = await executeFileUpload(file, folder_path, file_id);
    
    if (!uploadSuccess) {
      return {
        status: 'error',
        message: 'ファイルのアップロードに失敗しました'
      };
    }

    return {
      status: 'success',
      file_id: file_id,
      filename: file.name,
      folder_path: folder_path,
      temp_url: temp_url,
      upload_time: new Date().toISOString(),
      file_size: file.size,
      message: 'ファイルがアップロードされました'
    };

  } catch (error) {
    return {
      status: 'error',
      message: `アップロードエラー: ${error.message}`
    };
  }
}

/**
 * ファイルIDを生成
 */
function generateFileId() {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

/**
 * ファイルアップロード実行
 * 実際の実装では、データベースまたはストレージに保存
 */
async function executeFileUpload(file, folder_path, file_id) {
  try {
    // プレースホルダー実装
    // 実際には、データベースまたはストレージに保存
    
    // ファイルの基本情報をログに出力
    console.log('File Upload:', {
      filename: file.name,
      size: file.size,
      type: file.type,
      folder_path: folder_path,
      file_id: file_id
    });

    // 実際のアップロード処理をシミュレート
    // ここでは成功として返す
    return true;

  } catch (error) {
    console.error('File upload error:', error);
    return false;
  }
}
