'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { splitAudioFile, analyzeAudioFile, splitIntoHourlyFiles } from '../../../lib/audio-splitter';
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
  const [currentStep, setCurrentStep] = useState<'select' | 'analyze' | 'hourly-split' | 'split' | 'upload' | 'transcribe' | 'complete'>('select');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>('');
  const [userId] = useState<string>('user_' + Date.now()); // 簡易的なユーザーID
  const [sessionId] = useState<string>('session_' + Date.now()); // 簡易的なセッションID
  const [fileAnalysis, setFileAnalysis] = useState<{
    duration: number;
    durationHours: number;
    fileSize: number;
    needsHourlySplit: boolean;
    recommendedChunkDuration: number;
    metadata: any;
  } | null>(null);
  const [hourlyFiles, setHourlyFiles] = useState<any[]>([]);
  const [currentHourlyFile, setCurrentHourlyFile] = useState<number>(0);
  const [isCancelled, setIsCancelled] = useState<boolean>(false);
  const [fileProcessingStates, setFileProcessingStates] = useState<{[key: string]: {
    isProcessing: boolean;
    progress: number;
    status: 'idle' | 'splitting' | 'uploading' | 'transcribing' | 'completed' | 'error';
    error?: string;
    jobId?: string;
  }}>({});
  const [completedJobIds, setCompletedJobIds] = useState<string[]>([]);
  const [isStartingTranscription, setIsStartingTranscription] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // すべてのファイルのアップロードが完了したかを確認
  const allFilesUploaded = hourlyFiles.length > 0 && 
    hourlyFiles.every(file => {
      const fileId = `${file.sessionId}_segment_${file.segmentIndex}`;
      const state = fileProcessingStates[fileId];
      return state?.status === 'completed';
    });

  // ファイル選択時の処理
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log('File select triggered:', event.target.files);
    const file = event.target.files?.[0];
    if (file) {
      console.log('File selected:', file.name, file.size, file.type);
      setAudioFile(file);
      setError('');
      
      // ファイル分析を実行
      try {
        setIsProcessing(true);
        setCurrentStep('analyze');
        const analysis = await analyzeAudioFile(file);
        setFileAnalysis(analysis as any);
        console.log('File analysis:', analysis);
        
        if ((analysis as any).needsHourlySplit) {
          setCurrentStep('hourly-split');
        } else {
          setCurrentStep('split');
        }
      } catch (error) {
        console.error('File analysis failed:', error);
        setError('ファイルの分析に失敗しました');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  // 1時間ごとの分割処理
  const handleHourlySplit = async () => {
    if (!audioFile) return;
    
    try {
      setIsProcessing(true);
      setIsCancelled(false);
      setCurrentStep('hourly-split');
      setError('');
      
      const onProgress = (progressInfo: { current: number; total: number; percentage: number; message: string }) => {
        if (isCancelled) return; // キャンセルされた場合は処理を停止
        console.log(`Hourly Split Progress: ${progressInfo.message} (${progressInfo.percentage}%)`);
        setProgress(progressInfo.percentage);
      };
      
      const files = await splitIntoHourlyFiles(audioFile, onProgress, sessionId);
      
      if (isCancelled) {
        console.log('Hourly split cancelled by user');
        return;
      }
      
      if (files.length === 0) {
        throw new Error('分割されたファイルがありません。ファイルが大きすぎる可能性があります。');
      }
      
      setHourlyFiles(files);
      setCurrentStep('split');
      setProgress(100);
      
      console.log(`Successfully created ${files.length} hourly files`);
    } catch (error) {
      console.error('Hourly split failed:', error);
      setError(`時間分割に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
      setCurrentStep('hourly-split'); // エラー時は元のステップに戻す
    } finally {
      setIsProcessing(false);
    }
  };

  // キャンセル処理
  const handleCancel = () => {
    setIsCancelled(true);
    setIsProcessing(false);
    setError('処理がキャンセルされました');
  };

  // 時間分割ファイルのダウンロード
  const downloadHourlyFile = (file: any) => {
    const url = URL.createObjectURL(file.file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 時間分割ファイルを選択してチャンク分割
  const handleSelectHourlyFile = (file: any, index: number) => {
    setCurrentHourlyFile(index);
    setAudioFile(file.file);
    setCurrentStep('split');
  };

  // ダウンロードしたファイルをアップロードして文字起こし
  const handleDownloadedFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    console.log('Downloaded file uploaded:', file.name, file.size, file.type);
    
    // ファイルを設定してチャンク分割ステップに移行
    setAudioFile(file);
    setHourlyFiles([]); // 時間分割ファイルリストをクリア
    setCurrentStep('split');
    setError('');
    
    // 成功メッセージを表示
    console.log('File ready for chunk splitting:', file.name);
  };

  // すべてのチャンクを統合して文字起こしを開始
  const handleStartIntegratedTranscription = async () => {
    console.log('=== handleStartIntegratedTranscription START ===');
    setIsStartingTranscription(true);

    try {
      // 完了したすべてのjobIdを取得
      const allJobIds = completedJobIds.filter(id => id);
      
      if (allJobIds.length === 0) {
        throw new Error('完了したジョブが見つかりません');
      }

      console.log(`Starting integrated transcription with ${allJobIds.length} job IDs:`, allJobIds);

      // 最初のjobIdの結果ページに遷移（すべてのチャンクが含まれる）
      // または、新しいAPIエンドポイントで複数のjobIdを統合する
      if (allJobIds.length === 1) {
        // 単一のジョブの場合はそのまま結果ページへ
        router.push(`/audio-transcribe/${allJobIds[0]}`);
      } else {
        // 複数のジョブの場合は最初のジョブに遷移
        // TODO: 将来的には複数ジョブを統合するAPIを作成
        console.log('Multiple jobs detected, redirecting to first job result');
        router.push(`/audio-transcribe/${allJobIds[0]}`);
      }
    } catch (error) {
      console.error('Error starting integrated transcription:', error);
      setError(error instanceof Error ? error.message : '統合文字起こしの開始に失敗しました');
      setIsStartingTranscription(false);
    }
  };

  // 個別ファイルをクラウドに送る処理
  const handleSendToCloud = async (file: any, fileId: string) => {
    console.log(`=== handleSendToCloud START for ${fileId} ===`);
    
    // 処理状態を初期化
    setFileProcessingStates(prev => ({
      ...prev,
      [fileId]: {
        isProcessing: true,
        progress: 0,
        status: 'splitting',
        error: undefined
      }
    }));

    try {
      // ステップ1: チャンク分割
      console.log(`Step 1: Splitting audio for ${fileId}`);
      const onSplitProgress = (progressInfo: { current: number; total: number; percentage: number }) => {
        setFileProcessingStates(prev => ({
          ...prev,
          [fileId]: {
            ...prev[fileId],
            progress: Math.round(progressInfo.percentage * 0.5), // 分割は全体の50%
            status: 'splitting'
          }
        }));
      };

      const audioChunks = await splitAudioFile(file.file, 180, onSplitProgress);
      
      // ステップ2: クラウドアップロード
      console.log(`Step 2: Uploading to cloud for ${fileId}`);
      setFileProcessingStates(prev => ({
        ...prev,
        [fileId]: {
          ...prev[fileId],
          progress: 50,
          status: 'uploading'
        }
      }));

      const onUploadProgress = (progressInfo: { current: number; total: number; percentage: number }) => {
        setFileProcessingStates(prev => ({
          ...prev,
          [fileId]: {
            ...prev[fileId],
            progress: 50 + Math.round(progressInfo.percentage * 0.3), // アップロードは30%
            status: 'uploading'
          }
        }));
      };

      const uploadResults = await uploadChunksWithSignedUrl(audioChunks, userId, sessionId, onUploadProgress);
      
      // ステップ3: 文字起こし開始
      console.log(`Step 3: Starting transcription for ${fileId}`);
      setFileProcessingStates(prev => ({
        ...prev,
        [fileId]: {
          ...prev[fileId],
          progress: 80,
          status: 'transcribing'
        }
      }));

      const transcriptionResponse = await fetch('/api/transcribe-chunks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          sessionId: `${sessionId}_${fileId}`,
          chunks: uploadResults.map(result => ({
            id: result.id,
            chunkId: result.chunkId,
            cloudPath: result.cloudPath,
            startTime: result.startTime,
            endTime: result.endTime,
            duration: result.duration
          }))
        })
      });

      if (!transcriptionResponse.ok) {
        throw new Error(`文字起こしAPI呼び出しに失敗しました: ${transcriptionResponse.status}`);
      }

      const transcriptionResult = await transcriptionResponse.json();
      
      // 完了
      setFileProcessingStates(prev => ({
        ...prev,
        [fileId]: {
          ...prev[fileId],
          progress: 100,
          status: 'completed',
          isProcessing: false,
          jobId: transcriptionResult.jobId
        }
      }));

      // jobIdを保存
      setCompletedJobIds(prev => [...prev, transcriptionResult.jobId]);

      console.log(`Successfully processed ${fileId}:`, transcriptionResult);
      
    } catch (error) {
      console.error(`Error processing ${fileId}:`, error);
      setFileProcessingStates(prev => ({
        ...prev,
        [fileId]: {
          ...prev[fileId],
          progress: 0,
          status: 'error',
          isProcessing: false,
          error: error instanceof Error ? error.message : '処理に失敗しました'
        }
      }));
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
      const errorMessage = error instanceof Error ? error.message : '音声ファイルの分割に失敗しました';
      setError(errorMessage);
      
      // エラーの種類に応じて適切なアドバイスを提供
      if (errorMessage.includes('ファイルサイズが大きすぎます')) {
        setError(errorMessage + '\n\n推奨: 「15分ごとに自動分割してダウンロード」ボタンを使用してください。');
      } else if (errorMessage.includes('チャンク数が多すぎます')) {
        setError(errorMessage + '\n\n推奨: より長いチャンクサイズを使用するか、先に時間分割を実行してください。');
      } else if (errorMessage.includes('メモリ')) {
        setError(errorMessage + '\n\n推奨: ブラウザを再起動するか、より小さなファイルで試してください。');
      }
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
            chunkId: result.chunkId,
            cloudPath: result.cloudPath,
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

            {/* ワークフロー説明 */}
            <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-md">
              <h2 className="text-lg font-semibold text-gray-800 mb-3">📋 処理の流れ</h2>
              <div className="space-y-2 text-sm text-gray-700">
                <div className="flex items-center space-x-2">
                  <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
                  <span><strong>大きなファイル（1時間以上）:</strong> 「15分ごとに自動分割してダウンロード」→ ダウンロードしたファイルを再アップロード</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
                  <span><strong>小さなファイル（1時間未満）:</strong> 直接「クラウドへ送る」→ Cloud Storageにアップロード → 文字起こし</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
                  <span><strong>「クラウドへ送る」ボタンの用途:</strong> ファイルを小さなチャンクに分割してクラウドに送信し、文字起こしを実行</span>
                </div>
              </div>
            </div>

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

              </div>
            )}

            {/* ステップ2: ファイル分析 */}
            {currentStep === 'analyze' && (
              <div className="space-y-6">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-2 text-sm text-gray-600">ファイルを分析中...</p>
                </div>
              </div>
            )}

            {/* ステップ3: 時間分割が必要な場合 */}
            {currentStep === 'hourly-split' && fileAnalysis && (
              <div className="space-y-6">
                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-yellow-800">
                        長時間ファイルが検出されました
                      </h3>
                      <div className="mt-2 text-sm text-yellow-700">
                        <p>ファイルの長さ: <strong>{fileAnalysis.durationHours.toFixed(1)}時間</strong></p>
                        <p>メモリ制限を回避するため、1時間ごとに分割することをお勧めします。</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <button
                    onClick={handleHourlySplit}
                    disabled={isProcessing}
                    className="w-full bg-yellow-600 text-white py-2 px-4 rounded-md hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProcessing ? '分割中...' : '15分ごとに自動分割してダウンロード'}
                  </button>
                  
                  {isProcessing && (
                    <button
                      onClick={handleCancel}
                      className="w-full bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700"
                    >
                      キャンセル
                    </button>
                  )}
                  
                  <button
                    onClick={() => setCurrentStep('split')}
                    className="w-full bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700"
                  >
                    そのままチャンク分割を実行（メモリ不足の可能性あり）
                  </button>
                </div>
              </div>
            )}

            {/* ステップ4: 自動分割完了 */}
            {currentStep === 'split' && hourlyFiles.length > 0 && (
              <div className="space-y-6">
                <div className="bg-green-50 border border-green-200 rounded-md p-4">
                  <h3 className="text-sm font-medium text-green-800 mb-2">
                    自動分割が完了しました
                  </h3>
                  <p className="text-sm text-green-700">
                    {hourlyFiles.length}個のファイルが作成されました。各ファイルを個別にチャンク分割してアップロードしてください。
                  </p>
                </div>

                {/* ダウンロード済みファイルの再アップロード機能 */}
                <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                  <h3 className="text-sm font-medium text-blue-800 mb-2">
                    💡 ダウンロードしたファイルを文字起こしする場合
                  </h3>
                  <p className="text-sm text-blue-700 mb-3">
                    ダウンロードしたファイルを再度アップロードして文字起こしを実行できます。
                  </p>
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={handleDownloadedFileUpload}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                </div>

                <div className="space-y-4">
                  {hourlyFiles
                    .sort((a, b) => a.segmentIndex - b.segmentIndex) // 連番順にソート
                    .map((file, index) => {
                      const fileId = `${file.sessionId}_segment_${file.segmentIndex}`;
                      const processingState = fileProcessingStates[fileId];
                      
                      return (
                        <div key={index} className="bg-gray-50 p-4 rounded-md">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <h4 className="text-sm font-medium text-gray-900">{file.file.name}</h4>
                              <div className="text-sm text-gray-600 space-y-1">
                                <p>
                                  <strong>セグメント:</strong> {file.segmentIndex}/{file.totalSegments}
                                </p>
                                <p>
                                  <strong>時間:</strong> {Math.floor(file.startTime / 60)}分 - {Math.floor(file.endTime / 60)}分
                                </p>
                                <p>
                                  <strong>セッションID:</strong> {file.sessionId}
                                </p>
                                <p>
                                  <strong>元ファイル:</strong> {file.originalFileName}
                                </p>
                              </div>
                              
                              {/* 個別進行状況表示 */}
                              {processingState?.isProcessing && (
                                <div className="mt-3">
                                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                                    <span>
                                      {processingState.status === 'splitting' && '🔄 チャンク分割中...'}
                                      {processingState.status === 'uploading' && '☁️ クラウドアップロード中...'}
                                      {processingState.status === 'transcribing' && '🎤 文字起こし開始中...'}
                                    </span>
                                    <span>{processingState.progress}%</span>
                                  </div>
                                  <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div
                                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                      style={{ width: `${processingState.progress}%` }}
                                    ></div>
                                  </div>
                                </div>
                              )}
                              
                              {/* 完了・エラー状態表示 */}
                              {processingState?.status === 'completed' && (
                                <div className="mt-2 text-xs text-green-600 font-medium">
                                  ✅ アップロード完了
                                </div>
                              )}
                              {processingState?.status === 'error' && (
                                <div className="mt-2 text-xs text-red-600">
                                  ❌ エラー: {processingState.error}
                                </div>
                              )}
                            </div>
                            <div className="flex space-x-2 ml-4">
                              <button
                                onClick={() => downloadHourlyFile(file)}
                                disabled={processingState?.isProcessing}
                                className="text-sm bg-blue-600 text-white py-1 px-3 rounded hover:bg-blue-700 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                ダウンロード
                              </button>
                              <button
                                onClick={() => handleSendToCloud(file, fileId)}
                                disabled={processingState?.isProcessing || processingState?.status === 'completed'}
                                className="text-sm bg-green-600 text-white py-1 px-3 rounded hover:bg-green-700 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                                title="このファイルをクラウドに送信して文字起こしを実行"
                              >
                                {processingState?.isProcessing ? '送信中...' : 
                                 processingState?.status === 'completed' ? '完了' : 
                                 'クラウドへ送る'}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>

                {/* すべてのファイルがアップロード完了したら文字起こしスタートボタンを表示 */}
                {allFilesUploaded && (
                  <div className="mt-6 bg-green-50 border-2 border-green-300 rounded-md p-6">
                    <div className="text-center">
                      <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
                        <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-semibold text-green-800 mb-2">
                        ✅ すべてのファイルのアップロードが完了しました！
                      </h3>
                      <p className="text-sm text-green-700 mb-4">
                        {hourlyFiles.length}個のファイルすべてのチャンクがクラウドにアップロードされました。<br />
                        文字起こしを開始する準備が整いました。
                      </p>
                      <button
                        onClick={handleStartIntegratedTranscription}
                        disabled={isStartingTranscription}
                        className="px-8 py-3 bg-green-600 text-white rounded-lg font-semibold text-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {isStartingTranscription ? '開始中...' : '🎤 文字起こしスタート'}
                      </button>
                      <p className="mt-3 text-xs text-green-600">
                        ※ クリックすると文字起こし結果ページに移動します
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ステップ5: 通常のチャンク分割 */}
            {currentStep === 'split' && hourlyFiles.length === 0 && audioFile && (
              <div className="space-y-6">
                <div className="bg-gray-50 p-4 rounded-md">
                  <h3 className="text-sm font-medium text-gray-900 mb-2">選択されたファイル</h3>
                  <div className="text-sm text-gray-600">
                    <p><strong>ファイル名:</strong> {audioFile.name}</p>
                    <p><strong>サイズ:</strong> {(audioFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    <p><strong>タイプ:</strong> {audioFile.type}</p>
                  </div>
                  
                  {/* クラウド送信の説明 */}
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded text-sm">
                    <p className="text-blue-800 font-medium mb-1">☁️ クラウドへ送るについて</p>
                    <p className="text-blue-700">
                      このボタンを押すと、音声ファイルを小さなチャンク（3-5分）に分割し、
                      クラウドにアップロードして文字起こしを実行します。
                    </p>
                  </div>
                  
                  <button
                    onClick={handleSplitAudio}
                    disabled={isProcessing}
                    className="mt-4 w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProcessing ? 'クラウドに送信中...' : 'クラウドへ送る'}
                  </button>
                  
                  {/* ファイルサイズが大きい場合の警告 */}
                  {audioFile.size > 50 * 1024 * 1024 && (
                    <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                      ⚠️ ファイルサイズが大きいため、処理に時間がかかったりメモリ不足が発生する可能性があります。
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ステップ6: クラウド送信処理中 */}
            {currentStep === 'split' && isProcessing && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">クラウドに送信中...</h3>
                  <div className="bg-gray-200 rounded-full h-2 mb-4">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                  <p className="text-sm text-gray-600">
                    音声ファイルをチャンクに分割してクラウドに送信しています...
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