'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function AudioTranscribePage() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [result, setResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // ファイル選択時の処理
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // MP3ファイルかチェック
      if (file.type !== 'audio/mpeg' && !file.name.toLowerCase().endsWith('.mp3')) {
        setError('MP3形式の音声ファイルを選択してください');
        return;
      }
      
      // ファイルサイズチェック（50MB制限）
      if (file.size > 50 * 1024 * 1024) {
        setError('ファイルサイズが50MBを超えています');
        return;
      }
      
      setAudioFile(file);
      setError('');
    }
  };

  // 音声ファイルのアップロードと文字起こし開始
  const handleUpload = async () => {
    if (!audioFile) {
      setError('音声ファイルを選択してください');
      return;
    }

    setIsUploading(true);
    setError('');
    setStatus('音声ファイルをアップロード中...');

    try {
      // ファイルをBase64に変換
      const base64Audio = await fileToBase64(audioFile);
      
      console.log('Sending request with:', {
        audioDataLength: base64Audio?.length || 0,
        audioDataPreview: base64Audio?.substring(0, 50) + '...',
        audioInfo: {
          fileName: audioFile.name,
          fileSize: audioFile.size,
          fileType: audioFile.type
        }
      });
      
      const response = await fetch('/api/audio-transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audioData: base64Audio,
          audioInfo: {
            fileName: audioFile.name,
            fileSize: audioFile.size,
            fileType: audioFile.type
          }
        }),
      });

      const data = await response.json();
      console.log('Response received:', {
        status: response.status,
        ok: response.ok,
        data: data
      });

      if (!response.ok) {
        console.error('Upload failed:', data);
        throw new Error(data.error || 'アップロードに失敗しました');
      }

      setJobId(data.jobId);
      setStatus('文字起こし処理を開始しました');
      
      // 進捗監視を開始
      startProgressMonitoring(data.jobId);

    } catch (error) {
      console.error('Upload error:', error);
      setError(error instanceof Error ? error.message : 'アップロードエラーが発生しました');
      setIsUploading(false);
    }
  };

  // ファイルをBase64に変換
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        console.log('FileReader result:', result?.substring(0, 100) + '...');
        
        // data:audio/mpeg;base64, プレフィックスを削除して純粋なBase64文字列を返す
        const base64String = result.split(',')[1];
        console.log('Base64 string length:', base64String?.length);
        console.log('Base64 string preview:', base64String?.substring(0, 50) + '...');
        
        if (!base64String) {
          reject(new Error('Base64変換に失敗しました'));
          return;
        }
        
        resolve(base64String);
      };
      reader.onerror = error => {
        console.error('FileReader error:', error);
        reject(error);
      };
    });
  };

  // 進捗監視
  const startProgressMonitoring = (jobId: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/audio-transcription-status?jobId=${jobId}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'ステータス確認に失敗しました');
        }

        setProgress(data.progress);
        setStatus(getStatusMessage(data.status, data.progress));

        if (data.status === 'completed') {
          clearInterval(interval);
          setIsUploading(false);
          setResult(data.result);
          setStatus('文字起こしが完了しました');
        } else if (data.status === 'error') {
          clearInterval(interval);
          setIsUploading(false);
          setError(data.error || '処理中にエラーが発生しました');
        }

      } catch (error) {
        console.error('Progress monitoring error:', error);
        clearInterval(interval);
        setIsUploading(false);
        setError('進捗確認中にエラーが発生しました');
      }
    }, 2000); // 2秒ごとに確認
  };

  // ステータスメッセージを取得
  const getStatusMessage = (status: string, progress: number) => {
    switch (status) {
      case 'initializing':
        return '処理を初期化中...';
      case 'processing':
        return `文字起こし処理中... (${progress}%)`;
      case 'completed':
        return '文字起こしが完了しました';
      case 'error':
        return 'エラーが発生しました';
      case 'paused':
        return '処理が一時停止されました';
      default:
        return '処理中...';
    }
  };

  // 結果ページに遷移
  const viewResult = () => {
    if (jobId) {
      router.push(`/audio-transcribe/${jobId}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">
            音声文字起こし
          </h1>
          
          <div className="space-y-6">
            {/* ファイル選択エリア */}
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
                      accept=".mp3,audio/mpeg"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </label>
                  <p className="text-sm text-gray-500 mt-2">
                    MP3形式の音声ファイル（最大50MB）
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

            {/* エラーメッセージ */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800">{error}</p>
              </div>
            )}

            {/* アップロードボタン */}
            <div className="text-center">
              <button
                onClick={handleUpload}
                disabled={!audioFile || isUploading}
                className={`px-8 py-3 rounded-lg font-medium ${
                  !audioFile || isUploading
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isUploading ? '処理中...' : '文字起こしを開始'}
              </button>
            </div>

            {/* 進捗表示 */}
            {isUploading && (
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-blue-800 font-medium">{status}</p>
                  <div className="mt-2 bg-blue-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                  <p className="text-sm text-blue-600 mt-1">{progress}% 完了</p>
                </div>
              </div>
            )}

            {/* 結果表示 */}
            {result && (
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h3 className="text-lg font-medium text-green-800 mb-2">
                    文字起こし完了
                  </h3>
                  <div className="space-y-2 text-sm text-green-700">
                    <p>処理時間: {result.duration}秒</p>
                    <p>信頼度: {(result.averageConfidence * 100).toFixed(1)}%</p>
                    <p>処理チャンク数: {result.totalChunks}個</p>
                    <p>成功率: {(result.successRate * 100).toFixed(1)}%</p>
                  </div>
                </div>
                
                <div className="text-center">
                  <button
                    onClick={viewResult}
                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    結果を表示
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
