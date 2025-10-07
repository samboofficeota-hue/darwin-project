/**
 * ローカルでの音声ファイルチャンク分割機能
 * ブラウザ上で音声ファイルを分割し、WAV形式でBase64データとして返す
 */

/**
 * 音声ファイルの長さを判定し、適切な処理方法を決定
 * @param {File} audioFile - 音声ファイル
 * @returns {Promise<Object>} 処理方法とメタデータ
 */
export async function analyzeAudioFile(audioFile) {
  const audioMetadata = await getAudioMetadata(audioFile);
  const durationHours = audioMetadata.duration / 3600;
  
  return {
    duration: audioMetadata.duration,
    durationHours,
    fileSize: audioFile.size,
    needsHourlySplit: durationHours >= 1,
    recommendedChunkDuration: durationHours >= 1 ? 300 : 180, // 1時間以上は5分チャンク
    metadata: audioMetadata
  };
}

/**
 * 簡易音声ファイル分割（Web Audio API使用）
 * @param {File} audioFile - 音声ファイル
 * @param {Function} onProgress - 進捗コールバック関数
 * @param {string} sessionId - セッションID（ファイルの関連付け用）
 * @returns {Promise<Array>} 分割されたファイルの配列
 */
export async function splitIntoHourlyFiles(audioFile, onProgress = null, sessionId = null) {
  const analysis = await analyzeAudioFile(audioFile);
  const segmentDuration = 1800; // 30分 = 1800秒
  const totalSegments = Math.ceil(analysis.duration / segmentDuration);
  
  // セッションIDが提供されない場合は生成
  const currentSessionId = sessionId || `session_${Date.now()}`;
  
  console.log(`Large file detected: ${analysis.durationHours.toFixed(1)} hours`);
  console.log(`Splitting into ${totalSegments} segments of 30 minutes each`);
  console.log(`Session ID: ${currentSessionId}`);
  
  const hourlyFiles = [];
  
  for (let i = 0; i < totalSegments; i++) {
    const startTime = i * segmentDuration;
    const endTime = Math.min((i + 1) * segmentDuration, analysis.duration);
    const actualDuration = endTime - startTime;
    
    console.log(`Creating segment ${i + 1}/${totalSegments}: ${startTime}s - ${endTime}s`);
    
    if (onProgress) {
      onProgress({
        current: i + 1,
        total: totalSegments,
        percentage: Math.round(((i + 1) / totalSegments) * 100),
        message: `Creating segment ${i + 1}/${totalSegments}`
      });
    }
    
    try {
      // 簡易分割：指定時間範囲の音声データを抽出
      const segmentBlob = await extractAudioSegment(audioFile, startTime, actualDuration);
      
      // ファイル名を生成（連番を明確に定義）
      const baseName = audioFile.name.replace(/\.[^/.]+$/, '');
      const segmentIndex = i + 1; // 1から始まる連番
      const fileName = `${baseName}_${currentSessionId}_segment_${segmentIndex.toString().padStart(3, '0')}.wav`;
      
      hourlyFiles.push({
        file: new File([segmentBlob], fileName, { type: 'audio/wav' }),
        startTime,
        endTime,
        duration: actualDuration,
        index: i,
        segmentIndex: segmentIndex, // 1から始まる連番
        sessionId: currentSessionId,
        originalFileName: audioFile.name,
        totalSegments: totalSegments,
        isDummy: false, // 実際の分割ファイル
        metadata: {
          originalFileName: audioFile.name,
          originalFileSize: audioFile.size,
          originalFileType: audioFile.type,
          sessionId: currentSessionId,
          segmentIndex: segmentIndex,
          totalSegments: totalSegments,
          startTime: startTime,
          endTime: endTime,
          duration: actualDuration
        }
      });
      
      // メモリ解放
      await new Promise(resolve => setTimeout(resolve, 200));
      if (window.gc) window.gc();
      
    } catch (error) {
      console.error(`Failed to create segment ${i + 1}:`, error);
      // エラーが発生した場合はスキップして続行
      continue;
    }
  }
  
  return hourlyFiles;
}

/**
 * 音声ファイルの指定部分を簡易抽出
 * @param {File} audioFile - 音声ファイル
 * @param {number} startTime - 開始時間（秒）
 * @param {number} duration - 長さ（秒）
 * @returns {Promise<Blob>} 抽出された音声データ
 */
async function extractAudioSegment(audioFile, startTime, duration) {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    const url = URL.createObjectURL(audioFile);
    
    audio.addEventListener('loadeddata', async () => {
      try {
        // AudioContextを作成
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // 指定された時間範囲の音声データを抽出
        const startSample = Math.floor(startTime * audioBuffer.sampleRate);
        const endSample = Math.floor((startTime + duration) * audioBuffer.sampleRate);
        const chunkLength = endSample - startSample;
        
        // メモリ制限チェック（30分 = 約300MB）
        const estimatedSize = chunkLength * audioBuffer.numberOfChannels * 4; // WAV = 4 bytes per sample
        if (estimatedSize > 200 * 1024 * 1024) { // 200MB制限
          throw new Error(`Segment too large: ${(estimatedSize / 1024 / 1024).toFixed(1)}MB`);
        }
        
        // 新しいAudioBufferを作成
        const segmentBuffer = audioContext.createBuffer(
          audioBuffer.numberOfChannels,
          chunkLength,
          audioBuffer.sampleRate
        );
        
        // データをコピー（メモリ効率を考慮）
        for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
          const channelData = audioBuffer.getChannelData(channel);
          const segmentData = segmentBuffer.getChannelData(channel);
          
          // バッチ処理でメモリ効率を向上
          const batchSize = 44100; // 1秒分ずつ処理
          for (let i = 0; i < chunkLength; i += batchSize) {
            const endIdx = Math.min(i + batchSize, chunkLength);
            for (let j = i; j < endIdx; j++) {
              segmentData[j] = channelData[startSample + j];
            }
            // バッチ間でメモリ解放の機会を提供
            if (i % (batchSize * 10) === 0) {
              await new Promise(resolve => setTimeout(resolve, 1));
            }
          }
        }
        
        // WAV形式でエクスポート
        const wavData = audioBufferToWav(segmentBuffer);
        const blob = new Blob([wavData], { type: 'audio/wav' });
        
        // メモリ解放
        audioContext.close();
        URL.revokeObjectURL(url);
        resolve(blob);
        
      } catch (error) {
        console.error('extractAudioSegment error:', error);
        URL.revokeObjectURL(url);
        reject(error);
      }
    });
    
    audio.addEventListener('error', (error) => {
      URL.revokeObjectURL(url);
      reject(new Error('音声ファイルの読み込みに失敗しました'));
    });
    
    audio.src = url;
  });
}


/**
 * 音声ファイルをチャンクに分割（ストリーミング処理）
 * @param {File} audioFile - 音声ファイル
 * @param {number} chunkDurationSeconds - チャンクの長さ（秒）
 * @param {Function} onProgress - 進捗コールバック関数
 * @returns {Promise<Array>} 分割されたチャンクの配列
 */
export async function splitAudioFile(audioFile, chunkDurationSeconds = 180, onProgress = null) {
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

    // 各チャンクを順次処理（メモリ効率を向上）
    for (let i = 0; i < totalChunks; i++) {
      const startTime = i * chunkDurationSeconds;
      const endTime = Math.min((i + 1) * chunkDurationSeconds, audioMetadata.duration);
      const actualDuration = endTime - startTime;

      console.log(`Processing chunk ${i + 1}/${totalChunks}: ${startTime}s - ${endTime}s`);

      // 進捗を報告
      if (onProgress) {
        onProgress({
          current: i + 1,
          total: totalChunks,
          percentage: Math.round(((i + 1) / totalChunks) * 100)
        });
      }

      // チャンクの音声データを抽出
      const chunkData = await extractAudioChunk(audioFile, startTime, actualDuration);
      
      chunks.push({
        id: `chunk_${i}`,
        index: i,
        startTime,
        endTime,
        duration: actualDuration,
        data: chunkData,
        fileName: `${audioFile.name}_chunk_${i}.wav`,
        metadata: {
          originalFileName: audioFile.name,
          originalFileSize: audioFile.size,
          originalFileType: audioFile.type,
          totalChunks,
          chunkIndex: i
        }
      });

      // メモリ解放のための短い待機
      if (i < totalChunks - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // メモリ解放を強制実行
        if (window.gc) {
          window.gc();
        }
      }
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
      let audioContext = null;
      try {
        // AudioContextを使用して音声を処理
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        
        // メモリ使用量を制限するため、必要最小限のデータのみデコード
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // 指定された時間範囲の音声データを抽出
        const startSample = Math.floor(startTime * audioBuffer.sampleRate);
        const endSample = Math.floor((startTime + duration) * audioBuffer.sampleRate);
        const chunkLength = endSample - startSample;
        
        // メモリ制限チェック（30分 = 約300MB）
        const estimatedSize = chunkLength * audioBuffer.numberOfChannels * 4; // WAV = 4 bytes per sample
        if (estimatedSize > 300 * 1024 * 1024) { // 300MB制限
          throw new Error(`Chunk too large: ${(estimatedSize / 1024 / 1024).toFixed(1)}MB`);
        }
        
        // 新しいAudioBufferを作成
        const chunkBuffer = audioContext.createBuffer(
          audioBuffer.numberOfChannels,
          chunkLength,
          audioBuffer.sampleRate
        );
        
        // データをコピー（メモリ効率を考慮）
        for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
          const channelData = audioBuffer.getChannelData(channel);
          const chunkData = chunkBuffer.getChannelData(channel);
          
          // バッチ処理でメモリ効率を向上
          const batchSize = 44100; // 1秒分ずつ処理
          for (let i = 0; i < chunkLength; i += batchSize) {
            const endIdx = Math.min(i + batchSize, chunkLength);
            for (let j = i; j < endIdx; j++) {
              chunkData[j] = channelData[startSample + j];
            }
            // バッチ間でメモリ解放の機会を提供
            if (i % (batchSize * 10) === 0) {
              await new Promise(resolve => setTimeout(resolve, 1));
            }
          }
        }
        
        // WAV形式でエクスポート
        const wavData = audioBufferToWav(chunkBuffer);
        const base64Data = arrayBufferToBase64(wavData);
        
        // メモリ解放
        if (audioContext) {
          audioContext.close();
        }
        URL.revokeObjectURL(url);
        resolve(base64Data);
        
      } catch (error) {
        console.error('extractAudioChunk error:', error);
        if (audioContext) {
          audioContext.close();
        }
        URL.revokeObjectURL(url);
        reject(error);
      }
    });
    
    audio.addEventListener('error', (error) => {
      URL.revokeObjectURL(url);
      reject(new Error('音声ファイルの読み込みに失敗しました'));
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
  const length = audioBuffer.length;
  
  // WAVヘッダーを作成
  const buffer = new ArrayBuffer(44 + length * numberOfChannels * 2);
  const view = new DataView(buffer);
  
  // RIFFヘッダー
  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length * numberOfChannels * 2, true);
  writeString(8, 'WAVE');
  
  // fmtチャンク
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numberOfChannels * 2, true);
  view.setUint16(32, numberOfChannels * 2, true);
  view.setUint16(34, 16, true);
  
  // dataチャンク
  writeString(36, 'data');
  view.setUint32(40, length * numberOfChannels * 2, true);
  
  // 音声データを書き込み
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(channel)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
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

/**
 * Base64文字列をArrayBufferに変換
 * @param {string} base64 - Base64文字列
 * @returns {ArrayBuffer} ArrayBuffer
 */
function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
