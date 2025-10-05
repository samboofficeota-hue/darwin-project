/**
 * ファイルダウンロード機能
 * 分割されたチャンクをローカルにダウンロードして確認
 */

/**
 * Base64データをファイルとしてダウンロード
 * @param {string} base64Data - Base64エンコードされたデータ
 * @param {string} fileName - ファイル名
 * @param {string} mimeType - MIMEタイプ
 */
export function downloadBase64File(base64Data, fileName, mimeType = 'audio/wav') {
  try {
    // Base64データをBlobに変換
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });
    
    // ダウンロードリンクを作成
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    
    // ダウンロードを実行
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // URLを解放
    URL.revokeObjectURL(url);
    
    console.log(`Downloaded: ${fileName}`);
    return true;
  } catch (error) {
    console.error('Download error:', error);
    return false;
  }
}

/**
 * 分割されたチャンクをすべてダウンロード
 * @param {Array} chunks - 分割されたチャンクの配列
 * @param {string} originalFileName - 元のファイル名
 */
export function downloadAllChunks(chunks, originalFileName) {
  const baseName = originalFileName.replace(/\.[^/.]+$/, '');
  
  chunks.forEach((chunk, index) => {
    const fileName = `${baseName}_chunk_${index + 1}.wav`;
    downloadBase64File(chunk.data, fileName);
  });
  
  console.log(`Downloaded ${chunks.length} chunks`);
}

/**
 * チャンクの情報をコンソールに出力
 * @param {Array} chunks - 分割されたチャンクの配列
 */
export function logChunkInfo(chunks) {
  console.log('=== Chunk Information ===');
  chunks.forEach((chunk, index) => {
    console.log(`Chunk ${index + 1}:`, {
      id: chunk.id,
      startTime: chunk.startTime,
      endTime: chunk.endTime,
      duration: chunk.duration,
      dataSize: chunk.data.length,
      fileName: chunk.fileName
    });
  });
  console.log('========================');
}
