'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface TranscriptionResult {
  fullText: string;
  rawText?: string;
  enhanced?: boolean;
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
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState('');
  const [showRawText, setShowRawText] = useState(false);

  useEffect(() => {
    if (jobId) {
      fetchJobStatus();
    }
  }, [jobId]);

  useEffect(() => {
    if (jobStatus?.result?.fullText && !editedText) {
      setEditedText(jobStatus.result.fullText);
    }
  }, [jobStatus]);

  // ポーリング: 処理中の場合は定期的にステータスを確認
  useEffect(() => {
    if (!jobStatus) return;

    const isProcessing = jobStatus.status === 'initializing' || 
                        jobStatus.status === 'processing';

    if (isProcessing) {
      console.log(`Job is ${jobStatus.status}, polling in 3 seconds...`);
      const pollTimer = setTimeout(() => {
        fetchJobStatus();
      }, 3000); // 3秒ごとにポーリング

      return () => clearTimeout(pollTimer);
    }
  }, [jobStatus]);

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
    const textToDownload = isEditing ? editedText : jobStatus?.result?.fullText;
    if (!textToDownload) return;
    
    const blob = new Blob([textToDownload], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcription_${jobId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadWord = async () => {
    const textToDownload = isEditing ? editedText : jobStatus?.result?.fullText;
    if (!textToDownload) return;

    try {
      const response = await fetch('/api/generate-word', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: textToDownload,
          jobId: jobId,
          metadata: {
            duration: jobStatus?.result?.duration,
            confidence: jobStatus?.result?.averageConfidence,
            totalChunks: jobStatus?.result?.totalChunks
          }
        })
      });

      if (!response.ok) {
        throw new Error('WORD形式への変換に失敗しました');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transcription_${jobId}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading Word:', error);
      alert('WORD形式のダウンロードに失敗しました');
    }
  };

  const handleSaveEdit = () => {
    if (jobStatus?.result) {
      jobStatus.result.fullText = editedText;
    }
    setIsEditing(false);
    alert('編集内容が保存されました');
  };

  const handleCancelEdit = () => {
    setEditedText(jobStatus?.result?.fullText || '');
    setIsEditing(false);
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

  // 処理中の表示
  if (jobStatus.status === 'initializing' || jobStatus.status === 'processing') {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="text-center">
              <h1 className="text-3xl font-bold text-gray-900 mb-4">文字起こし処理中</h1>
              <p className="text-gray-600 mb-2">ジョブID: {jobId}</p>
              <p className="text-gray-500 text-sm mb-8">処理が完了するまでお待ちください...</p>

              {/* ステータス表示 */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
                <div className="flex items-center justify-center mb-4">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                </div>
                <p className="text-blue-800 font-medium mb-2">
                  {jobStatus.status === 'initializing' ? '初期化中...' : '文字起こし処理中...'}
                </p>
                <p className="text-blue-600 text-sm">
                  {jobStatus.progress !== undefined ? `進捗: ${jobStatus.progress}%` : '処理中...'}
                </p>
              </div>

              {/* 進捗バー */}
              {jobStatus.progress !== undefined && (
                <div className="mb-6">
                  <div className="bg-gray-200 rounded-full h-4 overflow-hidden">
                    <div 
                      className="bg-blue-600 h-4 rounded-full transition-all duration-500"
                      style={{ width: `${jobStatus.progress}%` }}
                    ></div>
                  </div>
                  <p className="text-sm text-gray-600 mt-2">
                    {jobStatus.completedChunks || 0} / {jobStatus.totalChunks || 0} チャンク完了
                  </p>
                </div>
              )}

              {/* 処理情報 */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-left">
                <h3 className="text-sm font-medium text-gray-700 mb-2">処理情報</h3>
                <div className="space-y-1 text-sm text-gray-600">
                  <p>• ステータス: {jobStatus.status}</p>
                  {jobStatus.totalChunks && (
                    <p>• 総チャンク数: {jobStatus.totalChunks}個</p>
                  )}
                  {jobStatus.lastUpdate && (
                    <p>• 最終更新: {new Date(jobStatus.lastUpdate).toLocaleString('ja-JP')}</p>
                  )}
                </div>
              </div>

              <div className="mt-8 text-sm text-gray-500">
                <p>このページは自動的に更新されます。</p>
                <p>処理が完了するまで、このページを閉じないでください。</p>
              </div>
            </div>
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
              <div className="flex justify-between items-center flex-wrap gap-4">
                <h2 className="text-xl font-medium text-gray-900">
                  文字起こしテキスト
                  {result.enhanced && (
                    <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                      ✨ 整形済み
                    </span>
                  )}
                </h2>
                <div className="flex gap-2 flex-wrap">
                  {!isEditing && (
                    <>
                      <button
                        onClick={() => setIsEditing(true)}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm"
                      >
                        ✏️ 編集
                      </button>
                      <button
                        onClick={() => copyToClipboard(result.fullText)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                      >
                        📋 コピー
                      </button>
                      <button
                        onClick={downloadText}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                      >
                        📄 TXT
                      </button>
                      <button
                        onClick={downloadWord}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
                      >
                        📝 WORD
                      </button>
                    </>
                  )}
                  {isEditing && (
                    <>
                      <button
                        onClick={handleSaveEdit}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                      >
                        💾 保存
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm"
                      >
                        ❌ キャンセル
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* 元のテキストと整形後の比較 */}
              {result.rawText && result.enhanced && !isEditing && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowRawText(!showRawText)}
                    className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
                  >
                    {showRawText ? '整形後を表示' : '元のテキストを表示'}
                  </button>
                </div>
              )}

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                {isEditing ? (
                  <div className="space-y-4">
                    <div className="text-sm text-gray-600 mb-2">
                      テキストを自由に編集できます。編集後は「保存」ボタンをクリックしてください。
                    </div>
                    <textarea
                      value={editedText}
                      onChange={(e) => setEditedText(e.target.value)}
                      className="w-full h-96 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm leading-relaxed"
                      style={{ resize: 'vertical' }}
                    />
                    <div className="text-sm text-gray-600">
                      文字数: {editedText.length.toLocaleString()}文字
                    </div>
                  </div>
                ) : (
                  <div className="max-h-[600px] overflow-y-auto">
                    <pre className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed">
                      {showRawText && result.rawText ? result.rawText : result.fullText}
                    </pre>
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

