'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface TranscriptionResult {
  fullText: string;
  averageConfidence: number;
  totalChunks: number;
  failedChunks: number;
  duration: number;
  successRate: number;
  processed: boolean;
}

interface JobStatus {
  jobId: string;
  status: string;
  progress: number;
  audioMetadata: any;
  result: TranscriptionResult;
  error: string;
}

export default function AudioTranscriptionResultPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params?.jobId as string;
  
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [showFullText, setShowFullText] = useState(false);

  useEffect(() => {
    if (jobId) {
      fetchJobStatus();
    }
  }, [jobId]);

  const fetchJobStatus = async () => {
    try {
      const response = await fetch(`/api/audio-transcription-status?jobId=${jobId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'ジョブ情報の取得に失敗しました');
      }

      setJobStatus(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching job status:', error);
      setError(error instanceof Error ? error.message : 'エラーが発生しました');
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert('テキストをクリップボードにコピーしました');
    } catch (error) {
      console.error('Copy failed:', error);
      alert('コピーに失敗しました');
    }
  };

  const downloadText = () => {
    if (!jobStatus?.result?.fullText) return;
    
    const blob = new Blob([jobStatus.result.fullText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcription_${jobId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (error || !jobStatus) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
            <h2 className="text-lg font-medium text-red-800 mb-2">エラー</h2>
            <p className="text-red-600 mb-4">{error || 'ジョブが見つかりません'}</p>
            <button
              onClick={() => router.push('/audio-transcribe')}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              戻る
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { result, audioMetadata } = jobStatus;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-lg p-8">
          {/* ヘッダー */}
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">文字起こし結果</h1>
              <p className="text-gray-600 mt-2">ジョブID: {jobId}</p>
            </div>
            <button
              onClick={() => router.push('/audio-transcribe')}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
            >
              新しい文字起こし
            </button>
          </div>

          {/* 音声ファイル情報 */}
          {audioMetadata && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
              <h2 className="text-lg font-medium text-blue-800 mb-4">音声ファイル情報</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="font-medium text-blue-700">再生時間:</span>
                  <p className="text-blue-600">{Math.floor(audioMetadata.duration / 60)}分{Math.floor(audioMetadata.duration % 60)}秒</p>
                </div>
                <div>
                  <span className="font-medium text-blue-700">サンプルレート:</span>
                  <p className="text-blue-600">{audioMetadata.sampleRate} Hz</p>
                </div>
                <div>
                  <span className="font-medium text-blue-700">チャンネル数:</span>
                  <p className="text-blue-600">{audioMetadata.channels}ch</p>
                </div>
                <div>
                  <span className="font-medium text-blue-700">ファイルサイズ:</span>
                  <p className="text-blue-600">{(audioMetadata.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>
            </div>
          )}

          {/* 処理結果統計 */}
          {result && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-8">
              <h2 className="text-lg font-medium text-green-800 mb-4">処理結果</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="font-medium text-green-700">信頼度:</span>
                  <p className="text-green-600">{(result.averageConfidence * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <span className="font-medium text-green-700">処理チャンク数:</span>
                  <p className="text-green-600">{result.totalChunks}個</p>
                </div>
                <div>
                  <span className="font-medium text-green-700">失敗チャンク数:</span>
                  <p className="text-green-600">{result.failedChunks}個</p>
                </div>
                <div>
                  <span className="font-medium text-green-700">成功率:</span>
                  <p className="text-green-600">{(result.successRate * 100).toFixed(1)}%</p>
                </div>
              </div>
            </div>
          )}

          {/* 文字起こしテキスト */}
          {result && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-medium text-gray-900">文字起こしテキスト</h2>
                <div className="space-x-2">
                  <button
                    onClick={() => copyToClipboard(result.fullText)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                  >
                    コピー
                  </button>
                  <button
                    onClick={downloadText}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                  >
                    ダウンロード
                  </button>
                </div>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                <div className="max-h-96 overflow-y-auto">
                  {showFullText ? (
                    <pre className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed">
                      {result.fullText}
                    </pre>
                  ) : (
                    <pre className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed">
                      {result.fullText.length > 1000 
                        ? result.fullText.substring(0, 1000) + '...'
                        : result.fullText
                      }
                    </pre>
                  )}
                </div>
                
                {result.fullText.length > 1000 && (
                  <div className="mt-4 text-center">
                    <button
                      onClick={() => setShowFullText(!showFullText)}
                      className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm"
                    >
                      {showFullText ? '短縮表示' : '全文表示'}
                    </button>
                  </div>
                )}
              </div>

              {/* 文字数統計 */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-gray-700">総文字数:</span>
                    <p className="text-gray-600">{result.fullText.length.toLocaleString()}文字</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">行数:</span>
                    <p className="text-gray-600">{result.fullText.split('\n').length}行</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">単語数（概算）:</span>
                    <p className="text-gray-600">{result.fullText.split(/\s+/).length}語</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* エラー表示 */}
          {jobStatus.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 mt-8">
              <h2 className="text-lg font-medium text-red-800 mb-2">エラー情報</h2>
              <p className="text-red-600">{jobStatus.error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
