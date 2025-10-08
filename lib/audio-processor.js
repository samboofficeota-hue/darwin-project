/**
 * 音声処理とファイル管理のユーティリティ
 * メモリ効率とクリーンアップ機能付き
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { getConfig } from './config.js';

const config = getConfig();

/**
 * 一時ファイル管理クラス
 */
export class TempFileManager {
  constructor() {
    this.tempFiles = new Set();
    this.tempDir = process.env.TMPDIR || '/tmp';
    
    // プロセス終了時のクリーンアップ
    process.on('exit', () => this.cleanup());
    process.on('SIGINT', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());
    process.on('uncaughtException', () => this.cleanup());
  }

  /**
   * 一時ファイルパスを生成
   */
  createTempPath(extension = '') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2);
    const filename = `darwin-${timestamp}-${random}${extension}`;
    const filepath = path.join(this.tempDir, filename);
    this.tempFiles.add(filepath);
    return filepath;
  }

  /**
   * ファイルを安全に削除
   */
  deleteFile(filepath) {
    try {
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
        console.log(`Deleted temp file: ${path.basename(filepath)}`);
      }
      this.tempFiles.delete(filepath);
    } catch (error) {
      console.warn(`Failed to delete temp file ${filepath}:`, error.message);
    }
  }

  /**
   * すべての一時ファイルをクリーンアップ
   */
  cleanup() {
    console.log(`Cleaning up ${this.tempFiles.size} temporary files...`);
    for (const filepath of this.tempFiles) {
      this.deleteFile(filepath);
    }
    this.tempFiles.clear();
  }

  /**
   * ファイルサイズをチェック
   */
  checkFileSize(filepath, maxSize = config.api.maxFileSize) {
    try {
      const stats = fs.statSync(filepath);
      if (stats.size > maxSize) {
        throw new Error(`File size ${Math.round(stats.size / 1024 / 1024)}MB exceeds limit ${Math.round(maxSize / 1024 / 1024)}MB`);
      }
      return stats.size;
    } catch (error) {
      throw new Error(`Failed to check file size: ${error.message}`);
    }
  }
}

/**
 * 音声処理クラス
 */
export class AudioProcessor {
  constructor() {
    this.tempManager = new TempFileManager();
  }

  /**
   * 音声セグメントを抽出（改善版）
   */
  async extractAudioSegment(audioBuffer, startTime, duration, options = {}) {
    const inputFile = this.tempManager.createTempPath('.mp4');
    const outputFile = this.tempManager.createTempPath('.wav');

    try {
      // 入力ファイルに書き込み
      fs.writeFileSync(inputFile, audioBuffer);
      console.log(`Created input file: ${path.basename(inputFile)} (${Math.round(audioBuffer.length / 1024 / 1024 * 100) / 100} MB)`);

      // ファイルサイズチェック
      this.tempManager.checkFileSize(inputFile);

      // FFmpegで音声セグメントを抽出
      const extractedBuffer = await this.runFFmpeg(inputFile, outputFile, startTime, duration, options);
      
      console.log(`Extracted audio segment: ${Math.round(extractedBuffer.length / 1024 / 1024 * 100) / 100} MB`);
      return extractedBuffer;

    } catch (error) {
      console.error('Audio extraction error:', error);
      throw error;
    } finally {
      // 一時ファイルをクリーンアップ
      this.tempManager.deleteFile(inputFile);
      this.tempManager.deleteFile(outputFile);
    }
  }

  /**
   * FFmpegを実行
   */
  async runFFmpeg(inputFile, outputFile, startTime, duration, options = {}) {
    const {
      sampleRate = config.audio.sampleRate,
      channels = config.audio.channels,
      encoding = 'pcm_s16le',
      timeout = 300000 // 5分タイムアウト
    } = options;

    return new Promise((resolve, reject) => {
      const args = [
        '-i', inputFile,
        '-ss', startTime.toString(),
        '-t', duration.toString(),
        '-vn', // ビデオストリームを無効化
        '-acodec', encoding,
        '-ar', sampleRate.toString(),
        '-ac', channels.toString(),
        '-f', 'wav',
        outputFile,
        '-y' // 上書き許可
      ];

      console.log(`Running FFmpeg: ffmpeg ${args.join(' ')}`);
      
      const ffmpeg = spawn('ffmpeg', args);
      let errorOutput = '';
      let timeoutId;

      // タイムアウト設定
      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          ffmpeg.kill('SIGKILL');
          reject(new Error(`FFmpeg timeout after ${timeout}ms`));
        }, timeout);
      }

      ffmpeg.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (timeoutId) clearTimeout(timeoutId);

        if (code === 0) {
          try {
            if (fs.existsSync(outputFile)) {
              const extractedBuffer = fs.readFileSync(outputFile);
              resolve(extractedBuffer);
            } else {
              reject(new Error('Output file was not created'));
            }
          } catch (readError) {
            reject(new Error(`Failed to read extracted audio: ${readError.message}`));
          }
        } else {
          reject(new Error(`FFmpeg failed with code ${code}: ${errorOutput}`));
        }
      });

      ffmpeg.on('error', (error) => {
        if (timeoutId) clearTimeout(timeoutId);
        reject(new Error(`FFmpeg spawn error: ${error.message}`));
      });
    });
  }

  /**
   * 音声品質の分析
   */
  async analyzeAudioQuality(audioBuffer) {
    const inputFile = this.tempManager.createTempPath('.mp4');
    
    try {
      fs.writeFileSync(inputFile, audioBuffer);
      
      return new Promise((resolve, reject) => {
        const ffprobe = spawn('ffprobe', [
          '-v', 'quiet',
          '-print_format', 'json',
          '-show_format',
          '-show_streams',
          inputFile
        ]);

        let output = '';
        let errorOutput = '';

        ffprobe.stdout.on('data', (data) => {
          output += data.toString();
        });

        ffprobe.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });

        ffprobe.on('close', (code) => {
          if (code === 0) {
            try {
              const info = JSON.parse(output);
              const audioStream = info.streams?.find(s => s.codec_type === 'audio');
              
              resolve({
                duration: parseFloat(info.format?.duration || 0),
                bitrate: parseInt(info.format?.bit_rate || 0),
                sampleRate: parseInt(audioStream?.sample_rate || 0),
                channels: parseInt(audioStream?.channels || 0),
                codec: audioStream?.codec_name || 'unknown',
                size: parseInt(info.format?.size || 0)
              });
            } catch (parseError) {
              reject(new Error(`Failed to parse ffprobe output: ${parseError.message}`));
            }
          } else {
            reject(new Error(`ffprobe failed with code ${code}: ${errorOutput}`));
          }
        });

        ffprobe.on('error', (error) => {
          reject(new Error(`ffprobe spawn error: ${error.message}`));
        });
      });
    } finally {
      this.tempManager.deleteFile(inputFile);
    }
  }

  /**
   * メモリ使用量の監視
   */
  getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
      rss: Math.round(usage.rss / 1024 / 1024 * 100) / 100, // MB
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024 * 100) / 100, // MB
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100, // MB
      external: Math.round(usage.external / 1024 / 1024 * 100) / 100, // MB
    };
  }

  /**
   * メモリ使用量の警告
   */
  checkMemoryUsage(threshold = 1024) { // 1GB threshold
    const usage = this.getMemoryUsage();
    if (usage.rss > threshold) {
      console.warn(`High memory usage detected: ${usage.rss}MB (threshold: ${threshold}MB)`);
      console.warn('Memory usage details:', usage);
      
      // ガベージコレクションを強制実行
      if (global.gc) {
        global.gc();
        console.log('Forced garbage collection executed');
      }
    }
    return usage;
  }

  /**
   * クリーンアップ
   */
  cleanup() {
    this.tempManager.cleanup();
  }
}

/**
 * ストリーミング音声処理クラス
 */
export class StreamingAudioProcessor {
  constructor(chunkSize = config.api.chunkSize) {
    this.chunkSize = chunkSize;
    this.tempManager = new TempFileManager();
  }

  /**
   * 大きな音声ファイルをチャンクに分割してストリーミング処理
   */
  async *processAudioStream(audioBuffer, chunkDuration = 300) {
    const processor = new AudioProcessor();
    
    try {
      // 音声品質を分析
      const audioInfo = await processor.analyzeAudioQuality(audioBuffer);
      console.log('Audio info:', audioInfo);

      const totalDuration = audioInfo.duration;
      const numChunks = Math.ceil(totalDuration / chunkDuration);

      console.log(`Processing ${totalDuration}s audio in ${numChunks} chunks of ${chunkDuration}s each`);

      for (let i = 0; i < numChunks; i++) {
        const startTime = i * chunkDuration;
        const actualDuration = Math.min(chunkDuration, totalDuration - startTime);
        
        console.log(`Processing chunk ${i + 1}/${numChunks}: ${startTime}s - ${startTime + actualDuration}s`);

        try {
          const chunkBuffer = await processor.extractAudioSegment(
            audioBuffer, 
            startTime, 
            actualDuration
          );

          yield {
            chunkIndex: i,
            startTime,
            duration: actualDuration,
            buffer: chunkBuffer,
            totalChunks: numChunks
          };

          // メモリ使用量をチェック
          processor.checkMemoryUsage();

        } catch (chunkError) {
          console.error(`Failed to process chunk ${i + 1}:`, chunkError);
          yield {
            chunkIndex: i,
            startTime,
            duration: actualDuration,
            error: chunkError.message,
            totalChunks: numChunks
          };
        }
      }
    } finally {
      processor.cleanup();
    }
  }

  /**
   * クリーンアップ
   */
  cleanup() {
    this.tempManager.cleanup();
  }
}

/**
 * フォールバック音声処理（FFmpegが利用できない場合）
 */
export class FallbackAudioProcessor {
  /**
   * 簡易的な音声セグメント抽出
   */
  extractAudioSegmentFallback(audioBuffer, startTime, duration) {
    try {
      console.log('Using fallback audio extraction method');
      
      // 音声の長さを推定（MP4の場合、おおよその計算）
      const estimatedDuration = 300; // 5分と仮定
      const bytesPerSecond = audioBuffer.length / estimatedDuration;
      
      const startByte = Math.floor(startTime * bytesPerSecond);
      const endByte = Math.floor((startTime + duration) * bytesPerSecond);
      
      // 範囲をバッファのサイズ内に制限
      const safeStartByte = Math.max(0, Math.min(startByte, audioBuffer.length));
      const safeEndByte = Math.max(safeStartByte, Math.min(endByte, audioBuffer.length));
      
      console.log(`Fallback extraction: ${safeStartByte} to ${safeEndByte} bytes`);
      
      return audioBuffer.slice(safeStartByte, safeEndByte);

    } catch (error) {
      console.error('Error in fallback extraction:', error);
      // 最終的なフォールバック: 元のバッファを返す
      return audioBuffer;
    }
  }
}

export default {
  TempFileManager,
  AudioProcessor,
  StreamingAudioProcessor,
  FallbackAudioProcessor
};
