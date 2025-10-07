'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { splitAudioFile } from '../../../lib/audio-splitter';
import { uploadChunksWithSignedUrl, saveSessionInfo } from '../../../lib/cloud-storage';
import { logChunkInfo } from '../../../lib/file-downloader';

interface AudioChunk {
  id: string;
  index: number;
  startTime: number;
  endTime: number;
  duration: number;
  data: string;
  fileName: string;
  metadata: {
    originalFileName: string;
    originalFileSize: number;
    originalFileType: string;
    totalChunks: number;
    chunkIndex: number;
  };
}

interface UploadResult {
  id: string;
  index: number;
  startTime: number;
  endTime: number;
  duration: number;
  status: string;
  error?: string;
  uploadResult?: any;
}

export default function ChunkedTranscribePage() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [chunks, setChunks] = useState<AudioChunk[]>([]);
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState<'select' | 'split' | 'upload' | 'transcribe' | 'complete'>('select');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>('');
  const [userId] = useState<string>('user_' + Date.now()); // 簡易的なユーザーID
  const [sessionId] = useState<string>('session_' + Date.now()); // 簡易的なセッションID
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // ファイル選択時の処理
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log('File select triggered:', event.target.files);
    const file = event.target.files?.[0];
    if (file) {
      console.log('File selected:', file.name, file.size, file.type);
      setAudioFile(file);
      setError('');
      setCurrentStep('select');
      console.log('File selected, currentStep set to:', 'select');
    }
  };

  // 音声ファイルの分割処理
  const handleSplitAudio = async () => {
    console.log('handleSplitAudio called, audioFile:', audioFile);
    if (!audioFile) {
      setError('音声ファイルを選択してください');
      return;
    }

    console.log('Starting audio splitting process...');
    setIsProcessing(true);
    setError('');
    setCurrentStep('split');
    setProgress(0);

    try {
      // 進捗コールバック関数
      const onProgress = (progressInfo: { current: number; total: number; percentage: number }) => {
        console.log(`Progress: ${progressInfo.current}/${progressInfo.total} (${progressInfo.percentage}%)`);
        setProgress(progressInfo.percentage);
      };

      // ファイルサイズに応じてチャンクサイズを動的に調整（3分ベース）
      let chunkDuration = 180; // デフォルト3分
      if (audioFile.size > 100 * 1024 * 1024) { // 100MB以上
        chunkDuration = 300; // 5分チャンク
      } else if (audioFile.size > 50 * 1024 * 1024) { // 50MB以上
        chunkDuration = 240; // 4分チャンク
      }

      console.log(`Using chunk duration: ${chunkDuration} seconds for file size: ${(audioFile.size / 1024 / 1024).toFixed(2)}MB`);

      // 音声ファイルを分割（進捗コールバック付き）
      const audioChunks = await splitAudioFile(audioFile, chunkDuration, onProgress);
      
      setChunks(audioChunks);
      setCurrentStep('upload');
      setProgress(100);
      
      // チャンク情報をコンソールに出力
      logChunkInfo(audioChunks);
      
      console.log(`Successfully split audio into ${audioChunks.length} chunks`);
      
    } catch (error) {
      console.error('Error splitting audio:', error);
      setError(error instanceof Error ? error.message : '音声ファイルの分割に失敗しました');
    } finally {
      // 処理完了後に必ずisProcessingをfalseに設定
      console.log('Setting isProcessing to false');
      setIsProcessing(false);
    }
  };

  // Cloud Storageへのアップロード処理
  const handleUploadChunks = async () => {
    console.log('=== handleUploadChunks START ===');
    console.log('handleUploadChunks called, chunks:', chunks.length);

    if (chunks.length === 0) {
      setError('分割されたチャンクがありません');
      return;
    }

    console.log('Starting upload process...');
    setIsProcessing(true);
    setError('');
    setCurrentStep('upload');
    setProgress(0);

    try {
      // 進捗コールバック関数
      const onUploadProgress = (progressInfo: { current: number; total: number; percentage: number }) => {
        console.log(`Upload Progress: ${progressInfo.current}/${progressInfo.total} (${progressInfo.percentage}%)`);
        setProgress(progressInfo.percentage);
      };

      console.log('Calling uploadChunksWithSignedUrl...');
      
      // 署名付きURL方式でアップロード
      const results = await uploadChunksWithSignedUrl(chunks, userId, sessionId, onUploadProgress);
      
      console.log('Upload results:', results);
      setUploadResults(results);
      setCurrentStep('transcribe');
      setProgress(100);
      
      console.log(`Successfully uploaded ${results.length} chunks`);
      
    } catch (error) {
      console.error('Error uploading chunks:', error);
      setError(error instanceof Error ? error.message : 'チャンクのアップロードに失敗しました');
    } finally {
      console.log('Setting isProcessing to false');
      setIsProcessing(false);
    }
  };

  // 文字起こし処理の開始
  const handleStartTranscription = async () => {
    if (uploadResults.length === 0) {
      setError('アップロードされたチャンクがありません');
      return;
    }

    console.log('Starting transcription process...');
    setIsProcessing(true);
    setError('');
    setCurrentStep('transcribe');
    setProgress(0);

    try {
      const response = await fetch('/api/transcribe-chunks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          sessionId,
          chunks: uploadResults.map(result => ({
            id: result.id,
            startTime: result.startTime,
            endTime: result.endTime,
            duration: result.duration
          }))
        })
      });

      if (!response.ok) {
        throw new Error(`文字起こしAPI呼び出しに失敗しました: ${response.status}`);
      }

      const result = await response.json();
      console.log('Transcription started:', result);
      
      setCurrentStep('complete');
      setProgress(100);
      
      // 結果ページに遷移
      router.push(`/audio-transcribe/${result.jobId}`);
      
    } catch (error) {
      console.error('Error starting transcription:', error);
      setError(error instanceof Error ? error.message : '文字起こしの開始に失敗しました');
    } finally {
      setIsProcessing(false);
    }
  };

  // リセット処理
  const handleReset = () => {
    setAudioFile(null);
    setChunks([]);
    setUploadResults([]);
    setCurrentStep('select');
    setProgress(0);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">
              音声ファイル分割・文字起こし
            </h1>

            {/* エラー表示 */}
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">
                      エラーが発生しました
                    </h3>
                    <div className="mt-2 text-sm text-red-700">
                      <pre className="whitespace-pre-wrap">{error}</pre>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ステップ1: ファイル選択 */}
            {currentStep === 'select' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    音声ファイルを選択してください
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*"
                    onChange={handleFileSelect}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                </div>

                {audioFile && (
                  <div className="bg-gray-50 p-4 rounded-md">
                    <h3 className="text-sm font-medium text-gray-900 mb-2">選択されたファイル</h3>
                    <div className="text-sm text-gray-600">
                      <p><strong>ファイル名:</strong> {audioFile.name}</p>
                      <p><strong>サイズ:</strong> {(audioFile.size / 1024 / 1024).toFixed(2)} MB</p>
                      <p><strong>タイプ:</strong> {audioFile.type}</p>
                    </div>
                    <button
                      onClick={handleSplitAudio}
                      disabled={isProcessing}
                      className="mt-4 w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isProcessing ? '分割中...' : '音声を分割'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ステップ2: 分割 */}
            {currentStep === 'split' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">音声ファイルを分割中...</h3>
                  <div className="bg-gray-200 rounded-full h-2 mb-4">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                  <p className="text-sm text-gray-600">
                    音声ファイルをチャンクに分割しています...
                  </p>
                </div>
              </div>
            )}

            {/* ステップ3: アップロード */}
            {currentStep === 'upload' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">分割完了</h3>
                  <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-4">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-green-800">
                          音声分割完了
                        </h3>
                        <div className="mt-2 text-sm text-green-700">
                          <p>{chunks.length}個のチャンクに分割されました</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleUploadChunks}
                    disabled={isProcessing}
                    className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProcessing ? 'アップロード中...' : 'Cloud Storageにアップロード'}
                  </button>
                </div>
              </div>
            )}

            {/* ステップ4: 文字起こし */}
            {currentStep === 'transcribe' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">アップロード完了</h3>
                  <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-4">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-green-800">
                          アップロード完了
                        </h3>
                        <div className="mt-2 text-sm text-green-700">
                          <p>{uploadResults.length}個のチャンクが正常にアップロードされました</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <button
                      onClick={handleStartTranscription}
                      disabled={isProcessing}
                      className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isProcessing ? '文字起こし開始中...' : '文字起こしを開始'}
                    </button>
                    
                    <button
                      onClick={handleReset}
                      className="w-full bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700"
                    >
                      最初からやり直す
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ステップ5: 完了 */}
            {currentStep === 'complete' && (
              <div className="space-y-6">
                <div className="text-center">
                  <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
                    <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="mt-2 text-lg font-medium text-gray-900">処理完了</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    文字起こしが開始されました。結果ページに移動しています...
                  </p>
                </div>
              </div>
            )}

            {/* 進捗表示 */}
            {isProcessing && (
              <div className="mt-6">
                <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                  <span>処理中...</span>
                  <span>{progress}%</span>
                </div>
                <div className="bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}