'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { splitAudioFile } from '../../../lib/audio-splitter';
import { uploadChunksToCloudStorage, uploadChunksWithSignedUrl, saveSessionInfo } from '../../../lib/cloud-storage';
import { downloadAllChunks, logChunkInfo } from '../../../lib/file-downloader';

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
  chunkId: string;
  fileName: string;
  cloudPath: string;
  status: string;
  uploadTime: string;
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
      console.log('Selected file:', file.name, file.size, file.type);
      
      // 音声ファイルかチェック
      if (!file.type.startsWith('audio/') && !file.name.toLowerCase().match(/\.(mp3|wav|m4a|aac)$/)) {
        setError('音声ファイルを選択してください');
        return;
      }
      
      // ファイルサイズチェック（500MB制限）
      if (file.size > 500 * 1024 * 1024) {
        setError('ファイルサイズが500MBを超えています');
        return;
      }
      
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
    console.log('chunks array:', chunks);
    
    if (chunks.length === 0) {
      console.log('No chunks available, returning early');
      setError('分割されたチャンクがありません');
      return;
    }

    console.log('Chunks available, proceeding to environment check');

    // ローカル環境での制限チェック
    console.log('Environment check:', {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: process.env.VERCEL,
      isDevelopment: process.env.NODE_ENV === 'development',
      isNotVercel: process.env.VERCEL !== '1',
      shouldBlock: process.env.NODE_ENV === 'development' || process.env.VERCEL !== '1'
    });
    
    // 本番環境（NODE_ENV === 'production'）では、VERCEL環境変数に関係なくアップロードを許可
    if (process.env.NODE_ENV === 'development') {
      console.log('Development environment - blocking upload');
      setError('Cloud Storageアップロードは本番環境でのみ利用可能です。\n\nローカル環境では、チャンクをダウンロードしてご利用ください。');
      setIsProcessing(false);
      return;
    }

    console.log('Environment check passed - proceeding with upload');

    console.log('Starting chunk upload process...');
    setIsProcessing(true);
    setError('');
    setCurrentStep('upload');
    setProgress(50);

    // タイムアウト設定（5分）
    const uploadTimeout = setTimeout(() => {
      console.error('Upload timeout after 5 minutes');
      setError('アップロードがタイムアウトしました。ファイルサイズが大きすぎる可能性があります。');
      setIsProcessing(false);
    }, 5 * 60 * 1000);

    try {
      // セッション情報を保存
      const sessionData = {
        originalFileName: audioFile?.name,
        originalFileSize: audioFile?.size,
        originalFileType: audioFile?.type,
        totalChunks: chunks.length,
        chunkDuration: 180, // 3分チャンクに変更
        createdAt: new Date().toISOString(),
        status: 'uploading'
      };
      
      console.log('Saving session info...', { userId, sessionId, sessionData });
      await saveSessionInfo(userId, sessionId, sessionData);
      console.log('Session info saved successfully');
      
      // チャンクをCloud Storageにアップロード
      console.log('Starting Cloud Storage upload...', { 
        chunksCount: chunks.length, 
        userId, 
        sessionId 
      });
      
      // アップロード進捗コールバック
      const onUploadProgress = (progressInfo: { current: number; total: number; percentage: number }) => {
        console.log(`Upload Progress: ${progressInfo.current}/${progressInfo.total} (${progressInfo.percentage}%)`);
        setProgress(50 + (progressInfo.percentage * 0.25)); // 50-75%の範囲で進捗を更新
      };
      
      // 署名付きURL方式でアップロード（Phase 1: シーケンシャル）
      const results = await uploadChunksWithSignedUrl(chunks, userId, sessionId, onUploadProgress);
      
      console.log('Upload results:', results);
      
      setUploadResults(results);
      setCurrentStep('transcribe');
      setProgress(75);
      
      console.log(`Successfully uploaded ${results.length} chunks`);
      
      // タイムアウトをクリア
      clearTimeout(uploadTimeout);
      
    } catch (error) {
      // タイムアウトをクリア
      clearTimeout(uploadTimeout);
      console.error('Error uploading chunks:', error);
      console.error('Error details:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // より詳細なエラーメッセージを表示
      let errorMessage = 'チャンクのアップロードに失敗しました';
      if (error instanceof Error) {
        if (error.message.includes('ENAMETOOLONG')) {
          errorMessage = 'Cloud Storage認証エラー: 環境変数の設定を確認してください';
        } else if (error.message.includes('bucket')) {
          errorMessage = 'Cloud Storageバケットエラー: バケットが存在しないか、アクセス権限がありません';
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
          errorMessage = 'ネットワークエラー: インターネット接続を確認してください';
        } else {
          errorMessage = `アップロードエラー: ${error.message}`;
        }
      }
      
      setError(errorMessage);
      setIsProcessing(false);
    }
  };

  // 文字起こし処理の開始
  const handleStartTranscription = async () => {
    if (uploadResults.length === 0) {
      setError('アップロードされたチャンクがありません');
      return;
    }

    setIsProcessing(true);
    setError('');
    setCurrentStep('transcribe');
    setProgress(75);

    try {
      console.log('Starting transcription process...');
      
      const response = await fetch('/api/transcribe-chunks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId,
          sessionId,
          chunks: uploadResults.map(result => ({
            chunkId: result.chunkId,
            cloudPath: result.cloudPath
          }))
        })
      });

      if (!response.ok) {
        throw new Error(`Transcription failed: ${response.status}`);
      }

      const data = await response.json();
      console.log('Transcription started:', data);
      
      setCurrentStep('complete');
      setProgress(100);
      
      // 結果ページに遷移
      router.push(`/transcription-result/${sessionId}`);
      
    } catch (error) {
      console.error('Error starting transcription:', error);
      setError(error instanceof Error ? error.message : '文字起こしの開始に失敗しました');
      setIsProcessing(false);
    }
  };

  // ステップ表示の取得
  const getStepTitle = () => {
    switch (currentStep) {
      case 'select': return '音声ファイルを選択';
      case 'split': return '音声ファイルを分割中...';
      case 'upload': return 'Cloud Storageにアップロード中...';
      case 'transcribe': return '文字起こし処理中...';
      case 'complete': return '処理完了';
      default: return '';
    }
  };

  // デバッグ情報をコンソールに出力
  console.log('Component render state:', {
    currentStep,
    audioFile: audioFile?.name,
    chunks: chunks.length,
    uploadResults: uploadResults.length,
    isProcessing,
    error
  });

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">
            チャンク分割文字起こし
          </h1>
          
          <div className="space-y-6">
            {/* ステップ表示 */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h2 className="text-lg font-medium text-blue-800 mb-2">
                {getStepTitle()}
              </h2>
              <div className="bg-blue-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <p className="text-sm text-blue-600 mt-1">{progress}% 完了</p>
            </div>

            {/* ファイル選択エリア */}
            {currentStep === 'select' && (
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <div className="space-y-4">
                  <div className="text-gray-500">
                    <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                      <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  
                  <div>
                    <label htmlFor="audio-file" className="cursor-pointer">
                      <span className="text-lg font-medium text-blue-600 hover:text-blue-500">
                        音声ファイルを選択
                      </span>
                      <input
                        ref={fileInputRef}
                        id="audio-file"
                        type="file"
                        accept="audio/*"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                    </label>
                    <p className="text-sm text-gray-500 mt-2">
                      音声ファイル（最大500MB）
                    </p>
                  </div>
                  
                  {audioFile && (
                    <div className="mt-4 p-4 bg-green-50 rounded-lg">
                      <p className="text-sm text-green-800">
                        <strong>選択されたファイル:</strong> {audioFile.name}
                      </p>
                      <p className="text-sm text-green-600">
                        サイズ: {(audioFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 分割結果表示 */}
            {chunks.length > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h3 className="text-lg font-medium text-green-800 mb-2">
                  分割完了
                </h3>
                <p className="text-sm text-green-700">
                  {chunks.length}個のチャンクに分割されました
                </p>
                <div className="mt-2 text-xs text-green-600">
                  {chunks.map((chunk, index) => (
                    <div key={chunk.id}>
                      チャンク {index + 1}: {chunk.startTime}s - {chunk.endTime}s
                    </div>
                  ))}
                </div>
                
                {/* ローカル環境での説明 */}
                {process.env.NODE_ENV === 'development' && (
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded">
                    <p className="text-sm text-blue-800">
                      💡 ローカル環境では、チャンクをダウンロードしてご利用ください
                    </p>
                    <p className="text-xs text-blue-600 mt-1">
                      本番環境では、これらのチャンクをCloud Storageにアップロードして文字起こしを行います
                    </p>
                  </div>
                )}
                
                <div className="mt-3">
                  <button
                    onClick={() => downloadAllChunks(chunks, audioFile?.name || 'audio')}
                    className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                  >
                    チャンクをダウンロード
                  </button>
                </div>
              </div>
            )}

            {/* アップロード結果表示 */}
            {uploadResults.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="text-lg font-medium text-blue-800 mb-2">
                  アップロード完了
                </h3>
                <p className="text-sm text-blue-700">
                  {uploadResults.length}個のチャンクがCloud Storageにアップロードされました
                </p>
              </div>
            )}

            {/* エラーメッセージ */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800">{error}</p>
              </div>
            )}

            {/* アクションボタン */}
            <div className="flex gap-4 justify-center">
              {currentStep === 'select' && audioFile && (
                <button
                  onClick={handleSplitAudio}
                  disabled={isProcessing}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400"
                >
                  音声を分割
                </button>
              )}
              
              {currentStep === 'upload' && chunks.length > 0 && (
                <div className="space-y-3">
                  {/* ローカル環境での制限表示 */}
                  {process.env.NODE_ENV === 'development' && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                      <p className="text-sm text-yellow-800">
                        ⚠️ ローカル環境ではCloud Storageアップロードは利用できません
                      </p>
                      <p className="text-xs text-yellow-700 mt-1">
                        本番環境（Vercel）にデプロイ後にご利用ください
                      </p>
                    </div>
                  )}
                  
                  <button
                    onClick={handleUploadChunks}
                    disabled={isProcessing || process.env.NODE_ENV === 'development'}
                    className={`px-6 py-3 rounded-lg font-medium ${
                      isProcessing || process.env.NODE_ENV === 'development'
                        ? 'bg-gray-400 text-gray-600 cursor-not-allowed' 
                        : 'bg-green-600 text-white hover:bg-green-700'
                    }`}
                  >
                    {process.env.NODE_ENV === 'development' 
                      ? 'ローカル環境では利用不可' 
                      : isProcessing 
                        ? '処理中...' 
                        : 'アップロード開始'
                    }
                  </button>
                </div>
              )}
              
              {currentStep === 'transcribe' && uploadResults.length > 0 && (
                <button
                  onClick={handleStartTranscription}
                  disabled={isProcessing}
                  className="px-6 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:bg-gray-400"
                >
                  文字起こし開始
                </button>
              )}
            </div>

            {/* 戻るボタン */}
            <div className="text-center">
              <button
                onClick={() => router.push('/')}
                className="text-blue-600 hover:text-blue-800 font-semibold"
              >
                ← ホームに戻る
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
