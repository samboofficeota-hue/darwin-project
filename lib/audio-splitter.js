/**
 * ローカルでの音声ファイルチャンク分割機能
 * ブラウザ上で音声ファイルを分割し、Base64データとして返す
 */

/**
 * 音声ファイルをチャンクに分割
 * @param {File} audioFile - 音声ファイル
 * @param {number} chunkDurationSeconds - チャンクの長さ（秒）
 * @returns {Promise<Array>} 分割されたチャンクの配列
 */
export async function splitAudioFile(audioFile, chunkDurationSeconds = 300) {
  try {
    console.log('Starting audio file splitting:', {
      fileName: audioFile.name,
      fileSize: audioFile.size,
      fileType: audioFile.type,
      chunkDuration: chunkDurationSeconds
    });

    // 音声ファイルのメタデータを取得
    const audioMetadata = await getAudioMetadata(audioFile);
    console.log('Audio metadata:', audioMetadata);

    // チャンク数を計算
    const totalChunks = Math.ceil(audioMetadata.duration / chunkDurationSeconds);
    console.log(`Splitting into ${totalChunks} chunks`);

    const chunks = [];

    // 各チャンクを処理
    for (let i = 0; i < totalChunks; i++) {
      const startTime = i * chunkDurationSeconds;
      const endTime = Math.min((i + 1) * chunkDurationSeconds, audioMetadata.duration);
      const actualDuration = endTime - startTime;

      console.log(`Processing chunk ${i + 1}/${totalChunks}: ${startTime}s - ${endTime}s`);

      // チャンクの音声データを抽出
      const chunkData = await extractAudioChunk(audioFile, startTime, actualDuration);
      
      chunks.push({
        id: `chunk_${i}`,
        index: i,
        startTime,
        endTime,
        duration: actualDuration,
        data: chunkData,
        fileName: `${audioFile.name}_chunk_${i}.mp3`,
        metadata: {
          originalFileName: audioFile.name,
          originalFileSize: audioFile.size,
          originalFileType: audioFile.type,
          totalChunks,
          chunkIndex: i
        }
      });
    }

    console.log(`Successfully split audio into ${chunks.length} chunks`);
    return chunks;

  } catch (error) {
    console.error('Error splitting audio file:', error);
    throw new Error(`音声ファイルの分割に失敗しました: ${error.message}`);
  }
}

/**
 * 音声ファイルのメタデータを取得
 * @param {File} audioFile - 音声ファイル
 * @returns {Promise<Object>} メタデータ
 */
async function getAudioMetadata(audioFile) {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    const url = URL.createObjectURL(audioFile);
    
    audio.addEventListener('loadedmetadata', () => {
      URL.revokeObjectURL(url);
      resolve({
        duration: audio.duration,
        sampleRate: 44100, // デフォルト値
        channels: 2, // デフォルト値
        bitrate: 128000 // デフォルト値
      });
    });
    
    audio.addEventListener('error', (error) => {
      URL.revokeObjectURL(url);
      reject(new Error('音声ファイルの読み込みに失敗しました'));
    });
    
    audio.src = url;
  });
}

/**
 * 音声ファイルの指定された部分を抽出
 * @param {File} audioFile - 音声ファイル
 * @param {number} startTime - 開始時間（秒）
 * @param {number} duration - 長さ（秒）
 * @returns {Promise<string>} Base64エンコードされた音声データ
 */
async function extractAudioChunk(audioFile, startTime, duration) {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    const url = URL.createObjectURL(audioFile);
    
    audio.addEventListener('loadeddata', async () => {
      try {
        // AudioContextを使用して音声を処理
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // 指定された時間範囲の音声データを抽出
        const startSample = Math.floor(startTime * audioBuffer.sampleRate);
        const endSample = Math.floor((startTime + duration) * audioBuffer.sampleRate);
        const chunkLength = endSample - startSample;
        
        // 新しいAudioBufferを作成
        const chunkBuffer = audioContext.createBuffer(
          audioBuffer.numberOfChannels,
          chunkLength,
          audioBuffer.sampleRate
        );
        
        // データをコピー
        for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
          const channelData = audioBuffer.getChannelData(channel);
          const chunkData = chunkBuffer.getChannelData(channel);
          for (let i = 0; i < chunkLength; i++) {
            chunkData[i] = channelData[startSample + i];
          }
        }
        
        // WAV形式でエクスポート
        const wavData = audioBufferToWav(chunkBuffer);
        const base64Data = arrayBufferToBase64(wavData);
        
        URL.revokeObjectURL(url);
        resolve(base64Data);
        
      } catch (error) {
        URL.revokeObjectURL(url);
        reject(error);
      }
    });
    
    audio.addEventListener('error', (error) => {
      URL.revokeObjectURL(url);
      reject(new Error('音声チャンクの抽出に失敗しました'));
    });
    
    audio.src = url;
  });
}

/**
 * AudioBufferをWAV形式に変換
 * @param {AudioBuffer} audioBuffer - 音声バッファ
 * @returns {ArrayBuffer} WAVデータ
 */
function audioBufferToWav(audioBuffer) {
  const numberOfChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numberOfChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = audioBuffer.length * blockAlign;
  const bufferSize = 44 + dataSize;
  
  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);
  
  // WAVヘッダーを書き込み
  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  writeString(0, 'RIFF');
  view.setUint32(4, bufferSize - 8, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);
  
  // 音声データを書き込み
  let offset = 44;
  for (let i = 0; i < audioBuffer.length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(channel)[i]));
      view.setInt16(offset, sample * 0x7FFF, true);
      offset += 2;
    }
  }
  
  return buffer;
}

/**
 * ArrayBufferをBase64文字列に変換
 * @param {ArrayBuffer} buffer - バッファ
 * @returns {string} Base64文字列
 */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
