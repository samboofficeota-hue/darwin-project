/**
 * ファイル操作の共通ユーティリティ関数
 */

/**
 * ファイルをBase64文字列に変換（プレフィックスなし）
 * @param {File|Blob} file - 変換するファイル
 * @returns {Promise<string>} Base64文字列（プレフィックスなし）
 */
export const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result;
      // data:audio/mpeg;base64, プレフィックスを削除して純粋なBase64文字列を返す
      const base64String = result.split(',')[1];
      resolve(base64String);
    };
    reader.onerror = error => reject(error);
  });
};

/**
 * Base64文字列をバッファに変換
 * @param {string} base64String - Base64文字列
 * @returns {Buffer} デコードされたバッファ
 */
export const base64ToBuffer = (base64String) => {
  return Buffer.from(base64String, 'base64');
};

/**
 * ファイルサイズを人間が読みやすい形式に変換
 * @param {number} bytes - バイト数
 * @returns {string} フォーマットされたサイズ文字列
 */
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * ファイルのMIMEタイプを検証
 * @param {File} file - 検証するファイル
 * @param {string[]} allowedTypes - 許可されるMIMEタイプの配列
 * @returns {boolean} 有効なファイルタイプかどうか
 */
export const validateFileType = (file, allowedTypes = ['audio/mpeg', 'audio/mp3']) => {
  return allowedTypes.includes(file.type);
};

/**
 * チャンクサイズを計算
 * @param {number} fileSize - ファイルサイズ（バイト）
 * @param {number} maxChunkSize - 最大チャンクサイズ（バイト、デフォルト5MB）
 * @returns {number} チャンク数
 */
export const calculateChunkCount = (fileSize, maxChunkSize = 5 * 1024 * 1024) => {
  return Math.ceil(fileSize / maxChunkSize);
};