/**
 * Cloud Storage統合機能
 * 分割された音声ファイルをCloud Storageにアップロード
 */

/**
 * 分割された音声チャンクをCloud Storageにアップロード
 * @param {Array} chunks - 分割されたチャンクの配列
 * @param {string} userId - ユーザーID
 * @param {string} sessionId - セッションID
 * @returns {Promise<Array>} アップロード結果の配列
 */
export async function uploadChunksToCloudStorage(chunks, userId, sessionId) {
  try {
    console.log(`Uploading ${chunks.length} chunks to Cloud Storage for user ${userId}`);
    
    const uploadPromises = chunks.map(async (chunk, index) => {
      try {
        const uploadResult = await uploadSingleChunk(chunk, userId, sessionId);
        console.log(`Chunk ${index + 1}/${chunks.length} uploaded successfully`);
        return uploadResult;
      } catch (error) {
        console.error(`Failed to upload chunk ${index + 1}:`, error);
        throw error;
      }
    });

    const results = await Promise.all(uploadPromises);
    console.log('All chunks uploaded successfully');
    
    return results;
  } catch (error) {
    console.error('Error uploading chunks to Cloud Storage:', error);
    throw new Error(`Cloud Storageへのアップロードに失敗しました: ${error.message}`);
  }
}

/**
 * 単一のチャンクをCloud Storageにアップロード
 * @param {Object} chunk - チャンクデータ
 * @param {string} userId - ユーザーID
 * @param {string} sessionId - セッションID
 * @returns {Promise<Object>} アップロード結果
 */
async function uploadSingleChunk(chunk, userId, sessionId) {
  try {
    // 署名付きURLを取得
    const signedUrl = await getSignedUploadUrl(userId, sessionId, chunk.id);
    
    // ファイルをアップロード
    const uploadResponse = await fetch(signedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': chunk.data.length.toString()
      },
      body: chunk.data
    });

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed with status: ${uploadResponse.status}`);
    }

    return {
      chunkId: chunk.id,
      fileName: chunk.fileName,
      cloudPath: `users/${userId}/sessions/${sessionId}/chunks/${chunk.id}.wav`,
      status: 'uploaded',
      uploadTime: new Date().toISOString()
    };
  } catch (error) {
    console.error(`Error uploading chunk ${chunk.id}:`, error);
    throw error;
  }
}

/**
 * 署名付きアップロードURLを取得
 * @param {string} userId - ユーザーID
 * @param {string} sessionId - セッションID
 * @param {string} chunkId - チャンクID
 * @returns {Promise<string>} 署名付きURL
 */
async function getSignedUploadUrl(userId, sessionId, chunkId) {
  try {
    const response = await fetch('/api/cloud-storage/signed-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId,
        sessionId,
        chunkId,
        operation: 'upload'
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Failed to get signed URL:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      });
      throw new Error(`Failed to get signed URL: ${response.status} - ${errorData.error || response.statusText}`);
    }

    const data = await response.json();
    return data.signedUrl;
  } catch (error) {
    console.error('Error getting signed URL:', error);
    throw error;
  }
}

/**
 * セッション情報を保存
 * @param {string} userId - ユーザーID
 * @param {string} sessionId - セッションID
 * @param {Object} sessionData - セッションデータ
 * @returns {Promise<Object>} 保存結果
 */
export async function saveSessionInfo(userId, sessionId, sessionData) {
  try {
    const response = await fetch('/api/sessions/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId,
        sessionId,
        sessionData
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to save session: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error saving session info:', error);
    throw error;
  }
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
      throw new Error(`Failed to get session: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting session info:', error);
    throw error;
  }
}

/**
 * ユーザーのセッション一覧を取得
 * @param {string} userId - ユーザーID
 * @returns {Promise<Array>} セッション一覧
 */
export async function getUserSessions(userId) {
  try {
    const response = await fetch(`/api/sessions/list?userId=${userId}`);
    
    if (!response.ok) {
      throw new Error(`Failed to get user sessions: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting user sessions:', error);
    throw error;
  }
}
