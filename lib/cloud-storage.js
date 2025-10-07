/**
 * Cloud Storage操作のためのユーティリティ関数
 * 署名付きURL方式でのアップロード機能
 */

/**
 * チャンクを署名付きURL方式でアップロード
 * @param {Array} chunks - チャンクの配列
 * @param {string} userId - ユーザーID
 * @param {string} sessionId - セッションID
 * @param {Function} onProgress - 進捗コールバック関数
 * @returns {Promise<Array>} アップロード結果の配列
 */
export async function uploadChunksWithSignedUrl(chunks, userId, sessionId, onProgress) {
  console.log(`Starting upload of ${chunks.length} chunks with signed URL method`);
  
  const results = [];
  
  try {
    // シーケンシャルアップロード（Phase 1）
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`Uploading chunk ${i + 1}/${chunks.length}: ${chunk.id}`);
      
      try {
        const uploadResult = await uploadSingleChunkWithSignedUrl(chunk, userId, sessionId);
        results.push({
          ...chunk,
          uploadResult,
          status: 'success'
        });
        
        // 進捗を報告
        if (onProgress) {
          onProgress({
            current: i + 1,
            total: chunks.length,
            percentage: Math.round(((i + 1) / chunks.length) * 100)
          });
        }
        
        console.log(`Successfully uploaded chunk ${i + 1}/${chunks.length}`);
        
      } catch (error) {
        console.error(`Failed to upload chunk ${i + 1}:`, error);
        results.push({
          ...chunk,
          error: error.message,
          status: 'error'
        });
      }
    }
    
    console.log(`Upload completed: ${results.filter(r => r.status === 'success').length}/${chunks.length} successful`);
    return results;
    
  } catch (error) {
    console.error('Error in uploadChunksWithSignedUrl:', error);
    throw error;
  }
}

/**
 * 単一チャンクを署名付きURLでアップロード
 * @param {Object} chunk - チャンクオブジェクト
 * @param {string} userId - ユーザーID
 * @param {string} sessionId - セッションID
 * @param {number} maxRetries - 最大リトライ回数
 * @returns {Promise<Object>} アップロード結果
 */
async function uploadSingleChunkWithSignedUrl(chunk, userId, sessionId, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Uploading chunk ${chunk.id} (attempt ${attempt}/${maxRetries})`);
      
      // 1. 署名付きURLを取得
      const signedUrl = await getSignedUploadUrl(userId, sessionId, chunk.id);
      console.log(`Got signed URL for chunk ${chunk.id}`);
      
      // 2. バイナリデータに変換
      const binaryData = Uint8Array.from(atob(chunk.data), c => c.charCodeAt(0));
      console.log(`Converted chunk ${chunk.id} to binary data: ${binaryData.length} bytes`);
      
      // 3. 直接GCSにアップロード
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 2分タイムアウト
      
      const uploadResponse = await fetch(signedUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'audio/wav',
        },
        body: binaryData,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(`Upload failed with status: ${uploadResponse.status} - ${errorText}`);
      }

      console.log(`Successfully uploaded chunk ${chunk.id}`);
      
      return {
        chunkId: chunk.id,
        status: 'success',
        uploadedAt: new Date().toISOString(),
        fileSize: binaryData.length
      };
      
    } catch (error) {
      lastError = error;
      console.error(`Upload attempt ${attempt} failed for chunk ${chunk.id}:`, error);
      
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // 指数バックオフ
        console.log(`Retrying chunk ${chunk.id} in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw new Error(`Failed to upload chunk ${chunk.id} after ${maxRetries} attempts: ${lastError.message}`);
}

/**
 * 署名付きアップロードURLを取得
 * @param {string} userId - ユーザーID
 * @param {string} sessionId - セッションID
 * @param {string} chunkId - チャンクID
 * @returns {Promise<string>} 署名付きURL
 */
async function getSignedUploadUrl(userId, sessionId, chunkId) {
  const response = await fetch('/api/cloud-storage/signed-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userId,
      sessionId,
      chunkId,
      operation: 'upload'
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Failed to get signed URL: ${errorData.error || response.statusText}`);
  }

  const data = await response.json();
  return data.signedUrl;
}

/**
 * セッション情報を保存
 * @param {string} userId - ユーザーID
 * @param {string} sessionId - セッションID
 * @param {Object} sessionData - セッションデータ
 */
export async function saveSessionInfo(userId, sessionId, sessionData) {
  try {
    const response = await fetch('/api/sessions/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        sessionId,
        ...sessionData
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to save session info: ${response.statusText}`);
    }

    console.log('Session info saved successfully');
  } catch (error) {
    console.error('Error saving session info:', error);
    throw error;
  }
}
