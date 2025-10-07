/**
 * サーバーサイド音声アップロード機能
 * フロントエンドから音声ファイルをサーバーに送信し、サーバーサイドで分割・アップロードを実行
 */

/**
 * 音声ファイルをサーバーに送信して分割・アップロードを実行
 * @param {File} audioFile - 音声ファイル
 * @param {string} userId - ユーザーID
 * @param {string} sessionId - セッションID
 * @param {number} chunkDuration - チャンクの長さ（秒）
 * @param {Function} onProgress - 進捗コールバック関数
 * @returns {Promise<Object>} 処理結果
 */
export async function uploadAudioToServer(audioFile, userId, sessionId, chunkDuration, onProgress) {
  try {
    console.log('Starting server-side audio upload:', {
      fileName: audioFile.name,
      fileSize: audioFile.size,
      fileType: audioFile.type,
      chunkDuration,
      userId,
      sessionId
    });

    // ファイルをBase64に変換
    const base64Data = await fileToBase64(audioFile);
    
    // サーバーサイド分割APIを呼び出し
    const response = await fetch('/api/audio-split-server', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audioFile: base64Data,
        userId,
        sessionId,
        chunkDuration
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    console.log('Server-side processing completed:', result);

    // 進捗を100%に設定
    if (onProgress) {
      onProgress({
        current: result.totalChunks,
        total: result.totalChunks,
        percentage: 100
      });
    }

    // 結果をフロントエンド用の形式に変換
    const chunks = result.uploadResults.map((uploadResult, index) => ({
      id: uploadResult.id,
      index: uploadResult.index,
      startTime: uploadResult.startTime,
      endTime: uploadResult.endTime,
      duration: uploadResult.duration,
      fileName: uploadResult.fileName,
      status: uploadResult.status,
      error: uploadResult.error,
      uploadResult: uploadResult.uploadResult
    }));

    return {
      success: true,
      totalChunks: result.totalChunks,
      chunkDuration: result.chunkDuration,
      chunks,
      message: result.message
    };

  } catch (error) {
    console.error('Error in server-side audio upload:', error);
    throw new Error(`サーバーサイド音声処理に失敗しました: ${error.message}`);
  }
}

/**
 * ファイルをBase64文字列に変換
 * @param {File} file - ファイルオブジェクト
 * @returns {Promise<string>} Base64文字列
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = () => {
      // data:audio/wav;base64, の部分を除去してBase64データのみを取得
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    
    reader.onerror = (error) => {
      reject(new Error('ファイルの読み込みに失敗しました'));
    };
    
    reader.readAsDataURL(file);
  });
}

/**
 * セッション情報を取得
 * @param {string} userId - ユーザーID
 * @param {string} sessionId - セッションID
 * @returns {Promise<Object>} セッション情報
 */
export async function getSessionInfo(userId, sessionId) {
  try {
    const response = await fetch(`/api/sessions/get?userId=${userId}&sessionId=${sessionId}`);
    
    if (!response.ok) {
      throw new Error(`セッション情報の取得に失敗しました: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error getting session info:', error);
    throw error;
  }
}
