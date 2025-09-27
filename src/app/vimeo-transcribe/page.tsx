'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function VimeoTranscribePage() {
  const [vimeoUrl, setVimeoUrl] = useState('');
  const [jobId, setJobId] = useState('');
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [estimatedTime, setEstimatedTime] = useState<string>('');
  const [canResume, setCanResume] = useState(false);
  const router = useRouter();

  // ステータス確認のポーリング
  useEffect(() => {
    if (!jobId || !processing) return;

    const interval = setInterval(async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒タイムアウト
        
        const response = await fetch(`/api/transcription-status?job_id=${jobId}`, {
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        const data = await response.json();

        if (response.ok) {
          setStatus(data.status);
          setProgress(data.progress);
          setEstimatedTime(data.estimatedCompletion);

          if (data.status === 'completed') {
            setProcessing(false);
            setResult(data.result);
            clearInterval(interval);
          } else if (data.status === 'error') {
            setProcessing(false);
            setError(data.error || '処理中にエラーが発生しました');
            setCanResume(data.canResume);
            clearInterval(interval);
          }
        } else {
          setError(data.error || 'ステータス確認に失敗しました');
          setProcessing(false);
          clearInterval(interval);
        }
      } catch (err) {
        console.error('Status check error:', err);
        if (err.name === 'AbortError') {
          setError('タイムアウトが発生しました。ネットワーク接続を確認してください。');
        } else {
          setError('ステータス確認エラーが発生しました');
        }
        setProcessing(false);
        clearInterval(interval);
      }
    }, 2000); // 2秒間隔でポーリング

    return () => clearInterval(interval);
  }, [jobId, processing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!vimeoUrl.trim()) {
      setError('Vimeo URLを入力してください');
      return;
    }

    setProcessing(true);
    setError(null);
    setResult(null);
    setProgress(0);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒タイムアウト
      
      const response = await fetch('/api/vimeo-transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ vimeo_url: vimeoUrl }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      const data = await response.json();

      if (response.ok) {
        setJobId(data.jobId);
        setStatus('initializing');
        setEstimatedTime(data.estimatedDuration);
      } else {
        setError(data.error || '文字起こし開始に失敗しました');
        setProcessing(false);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setError('タイムアウトが発生しました。ネットワーク接続を確認してください。');
      } else {
        setError('通信エラーが発生しました');
      }
      setProcessing(false);
    }
  };

  const handleResume = async () => {
    if (!jobId) return;

    setProcessing(true);
    setError(null);

    try {
      const response = await fetch('/api/vimeo-transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ resume_job_id: jobId }),
      });

      const data = await response.json();

      if (response.ok) {
        setStatus('resuming');
      } else {
        setError(data.error || '処理再開に失敗しました');
        setProcessing(false);
      }
    } catch (err) {
      setError('通信エラーが発生しました');
      setProcessing(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h > 0 ? h + '時間' : ''}${m > 0 ? m + '分' : ''}${s}秒`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-600';
      case 'error': return 'text-red-600';
      case 'processing': return 'text-blue-600';
      case 'resuming': return 'text-yellow-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">
            Vimeo動画 文字起こし
          </h1>
          <p className="text-center text-gray-600 mb-8">
            Vimeoの動画URLを入力して、長時間の講義動画を文字起こしします。<br />
            中断・再開機能により、安定した処理が可能です。
          </p>

          {/* Vimeoライブラリへのリンク */}
          <div className="mb-8 p-4 bg-blue-50 border border-blue-200 rounded-md">
            <h3 className="text-lg font-semibold text-blue-800 mb-2">
              📚 Vimeoライブラリ
            </h3>
            <p className="text-blue-700 mb-3">
              講義動画をVimeoにアップロードして、URLを取得してください。
            </p>
            <a
              href="https://vimeo.com/library"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-blue-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Vimeoライブラリを開く →
            </a>
          </div>

          {/* URL入力フォーム */}
          <form onSubmit={handleSubmit} className="mb-8">
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Vimeo動画URL
              </label>
              <input
                type="url"
                value={vimeoUrl}
                onChange={(e) => setVimeoUrl(e.target.value)}
                placeholder="https://vimeo.com/123456789"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={processing}
              />
              <p className="text-sm text-gray-500 mt-2">
                例: https://vimeo.com/123456789
              </p>
            </div>

            <div className="flex justify-center">
              <button
                type="submit"
                disabled={processing || !vimeoUrl.trim()}
                className="bg-blue-600 text-white py-3 px-8 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {processing ? '処理中...' : '文字起こしを開始'}
              </button>
            </div>
          </form>

          {/* エラー表示 */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-800">{error}</p>
              {canResume && (
                <button
                  onClick={handleResume}
                  className="mt-2 bg-yellow-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-yellow-700"
                >
                  処理を再開
                </button>
              )}
            </div>
          )}

          {/* 処理状況表示 */}
          {processing && (
            <div className="mb-8">
              <div className="bg-blue-50 border border-blue-200 rounded-md p-6">
                <h3 className="text-lg font-semibold text-blue-800 mb-4">
                  処理状況
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm text-blue-700 mb-1">
                      <span>進捗</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="w-full bg-blue-200 rounded-full h-2.5">
                      <div
                        className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-blue-700">ステータス:</span>
                      <span className={`ml-2 ${getStatusColor(status)}`}>
                        {status === 'initializing' && '初期化中...'}
                        {status === 'processing' && '処理中...'}
                        {status === 'resuming' && '再開中...'}
                        {status === 'completed' && '完了'}
                        {status === 'error' && 'エラー'}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-blue-700">ジョブID:</span>
                      <span className="ml-2 font-mono text-xs">{jobId}</span>
                    </div>
                  </div>

                  {estimatedTime && (
                    <div className="text-sm text-blue-700">
                      <span className="font-medium">推定完了時間:</span>
                      <span className="ml-2">{new Date(estimatedTime).toLocaleString('ja-JP')}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 結果表示 */}
          {result && (
            <div className="bg-green-50 border border-green-200 rounded-md p-6">
              <h3 className="text-lg font-semibold text-green-800 mb-4">
                ✅ 文字起こし完了
              </h3>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-green-700">処理チャンク数:</span>
                    <span className="ml-2">{result.totalChunks}</span>
                  </div>
                  <div>
                    <span className="font-medium text-green-700">音声時間:</span>
                    <span className="ml-2">{formatDuration(result.duration)}</span>
                  </div>
                  <div>
                    <span className="font-medium text-green-700">平均信頼度:</span>
                    <span className="ml-2">{(result.averageConfidence * 100).toFixed(2)}%</span>
                  </div>
                </div>

                <div>
                  <h4 className="text-md font-semibold text-gray-800 mb-2">
                    文字起こしテキスト:
                  </h4>
                  <div className="bg-gray-100 p-4 rounded-md max-h-96 overflow-y-auto text-gray-800 whitespace-pre-wrap">
                    {result.fullText}
                  </div>
                </div>

                <div className="flex justify-end space-x-2">
                  <button
                    onClick={() => navigator.clipboard.writeText(result.fullText)}
                    className="bg-gray-300 text-gray-800 py-2 px-4 rounded-lg font-semibold hover:bg-gray-400"
                  >
                    テキストをコピー
                  </button>
                  <a
                    href={`data:text/plain;charset=utf-8,${encodeURIComponent(result.fullText)}`}
                    download={`vimeo-transcription-${jobId}.txt`}
                    className="bg-gray-300 text-gray-800 py-2 px-4 rounded-lg font-semibold hover:bg-gray-400"
                  >
                    ダウンロード
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* 戻るボタン */}
          <div className="mt-8 text-center">
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
  );
}
