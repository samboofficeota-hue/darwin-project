'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { splitAudioFile } from '../../../lib/audio-splitter';
import { uploadChunksToCloudStorage, saveSessionInfo } from '../../../lib/cloud-storage';

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
    const file = event.target.files?.[0];
    if (file) {
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
    }
  };

  // 音声ファイルの分割処理
  const handleSplitAudio = async () => {
    if (!audioFile) {
      setError('音声ファイルを選択してください');
      return;
    }

    setIsProcessing(true);
    setError('');
    setCurrentStep('split');
    setProgress(0);

    try {
      console.log('Starting audio splitting process...');
      
      // 音声ファイルを分割
      const audioChunks = await splitAudioFile(audioFile, 300); // 5分チャンク
      
      setChunks(audioChunks);
      setCurrentStep('upload');
      setProgress(50);
      
      console.log(`Successfully split audio into ${audioChunks.length} chunks`);
      
    } catch (error) {
      console.error('Error splitting audio:', error);
      setError(error instanceof Error ? error.message : '音声ファイルの分割に失敗しました');
      setIsProcessing(false);
    }
  };

  // Cloud Storageへのアップロード処理
  const handleUploadChunks = async () => {
    if (chunks.length === 0) {
      setError('分割されたチャンクがありません');
      return;
    }

    setIsProcessing(true);
    setError('');
    setCurrentStep('upload');
    setProgress(50);

    try {
      console.log('Starting chunk upload process...');
      
      // セッション情報を保存
      const sessionData = {
        originalFileName: audioFile?.name,
        originalFileSize: audioFile?.size,
        originalFileType: audioFile?.type,
        totalChunks: chunks.length,
        chunkDuration: 300,
        createdAt: new Date().toISOString(),
        status: 'uploading'
      };
      
      await saveSessionInfo(userId, sessionId, sessionData);
      
      // チャンクをCloud Storageにアップロード
      const results = await uploadChunksToCloudStorage(chunks, userId, sessionId);
      
      setUploadResults(results);
      setCurrentStep('transcribe');
      setProgress(75);
      
      console.log(`Successfully uploaded ${results.length} chunks`);
      
    } catch (error) {
      console.error('Error uploading chunks:', error);
      setError(error instanceof Error ? error.message : 'チャンクのアップロードに失敗しました');
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
                  {chunks.length}個のチャンクに分割されました（各5分）
                </p>
                <div className="mt-2 text-xs text-green-600">
                  {chunks.map((chunk, index) => (
                    <div key={chunk.id}>
                      チャンク {index + 1}: {chunk.startTime}s - {chunk.endTime}s
                    </div>
                  ))}
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
                <button
                  onClick={handleUploadChunks}
                  disabled={isProcessing}
                  className="px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-400"
                >
                  アップロード開始
                </button>
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
