'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// TypeScript用のwindow拡張
declare global {
  interface Window {
    urlValidationTimeout?: NodeJS.Timeout;
  }
}

interface LectureInfo {
  theme: string;
  speaker: {
    name: string;
    title: string;
    bio: string;
  };
  description: string;
}

interface TranscriptionJob {
  jobId: string;
  status: 'initializing' | 'processing' | 'completed' | 'error' | 'paused' | 'resuming';
  progress: number;
  currentStage?: string;
  estimatedCompletion?: string;
  error?: string;
  result?: any;
  canResume: boolean;
}

interface VideoPreview {
  title: string;
  duration: number;
  thumbnail: string;
  description: string;
  valid: boolean;
}

export default function LectureTranscribePage() {
  const [step, setStep] = useState<'info' | 'url' | 'processing' | 'result'>('info');
  const [lectureInfo, setLectureInfo] = useState<LectureInfo>({
    theme: '',
    speaker: { name: '', title: '', bio: '' },
    description: ''
  });
  const [vimeoUrl, setVimeoUrl] = useState('');
  const [videoPreview, setVideoPreview] = useState<VideoPreview | null>(null);
  const [validatingUrl, setValidatingUrl] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [job, setJob] = useState<TranscriptionJob | null>(null);
  const [processing, setProcessing] = useState(false);
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const router = useRouter();

  // ステータス確認のポーリング
  useEffect(() => {
    if (!job?.jobId || !processing) return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/transcription-status?job_id=${job.jobId}`);
        
        if (!response.ok) {
          console.error('Status check failed:', response.status, response.statusText);
          const errorData = await response.text();
          console.error('Error response:', errorData);
          return;
        }
        
        const data = await response.json();
        console.log('Status check response:', data);

        setJob(prev => prev ? { ...prev, ...data } : null);

        if (data.status === 'completed') {
          setProcessing(false);
          setStep('result');
        } else if (data.status === 'error') {
          setProcessing(false);
          setUrlError(data.error || '処理中にエラーが発生しました');
        }
      } catch (err) {
        console.error('Status check error:', err);
        setUrlError('ステータス確認中にエラーが発生しました');
        setProcessing(false);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [job?.jobId, processing]);

  const validateForm = (): boolean => {
    const newErrors: {[key: string]: string} = {};

    if (!lectureInfo.theme.trim()) {
      newErrors.theme = '講義テーマ名を入力してください';
    }
    if (!lectureInfo.speaker.name.trim()) {
      newErrors.speakerName = '講演者名を入力してください';
    }
    if (!lectureInfo.speaker.title.trim()) {
      newErrors.speakerTitle = '肩書きを入力してください';
    }
    if (!lectureInfo.speaker.bio.trim()) {
      newErrors.speakerBio = '略歴を入力してください';
    }
    if (!lectureInfo.description.trim()) {
      newErrors.description = '講演内容の紹介文を入力してください';
    } else if (lectureInfo.description.length < 50) {
      newErrors.description = '紹介文は50文字以上で入力してください';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInfoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      setStep('url');
    }
  };

  const validateVimeoUrl = async (url: string) => {
    setValidatingUrl(true);
    setUrlError(null);
    setVideoPreview(null);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒タイムアウト

      const response = await fetch('/api/validate-vimeo-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (response.ok) {
        setVideoPreview(data);
        if (data.valid) {
          setUrlError(null);
        } else {
          setUrlError('無効なVimeo URLです');
        }
      } else {
        setUrlError(data.error || 'URL検証に失敗しました');
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setUrlError('URL検証がタイムアウトしました。ネットワーク接続を確認してください。');
      } else {
        setUrlError('URL検証中にエラーが発生しました');
      }
    } finally {
      setValidatingUrl(false);
    }
  };

  const handleUrlChange = (url: string) => {
    setVimeoUrl(url);
    if (url.trim()) {
      // デバウンス処理（前のタイムアウトをクリア）
      if (window.urlValidationTimeout) {
        clearTimeout(window.urlValidationTimeout);
      }
      window.urlValidationTimeout = setTimeout(() => {
        validateVimeoUrl(url);
      }, 1000);
    } else {
      setVideoPreview(null);
      setUrlError(null);
    }
  };

  const handleTranscribe = async () => {
    if (!videoPreview?.valid) {
      console.error('Video preview is not valid:', videoPreview);
      return;
    }

    console.log('=== STARTING TRANSCRIPTION ===');
    console.log('Video preview:', videoPreview);
    console.log('Lecture info:', lectureInfo);
    console.log('Vimeo URL:', vimeoUrl);

    setProcessing(true);
    setStep('processing');
    setUrlError(null);

    try {
      const requestData = { 
        vimeo_url: vimeoUrl,
        lecture_info: lectureInfo
      };
      
      console.log('Sending request to /api/vimeo-transcribe:', requestData);
      
      const response = await fetch('/api/vimeo-transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Transcription error response:', errorData);
        throw new Error(`HTTP ${response.status}: ${errorData}`);
      }

      const data = await response.json();
      console.log('Transcription started successfully:', data);

      setJob({
        jobId: data.jobId,
        status: 'initializing',
        progress: 0,
        canResume: false
      });
      
      console.log('Job state set:', data.jobId);
    } catch (err) {
      console.error('Transcription error:', err);
      setUrlError(err instanceof Error ? err.message : 'エラーが発生しました');
      setProcessing(false);
      setStep('url');
    }
  };

  const handleResume = async () => {
    if (!job?.jobId) return;

    setProcessing(true);
    setStep('processing');

    try {
      const response = await fetch('/api/vimeo-transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume_job_id: job.jobId })
      });

      const data = await response.json();

      if (response.ok) {
        setJob(prev => prev ? { ...prev, status: 'resuming' } : null);
      } else {
        throw new Error(data.error || '処理再開に失敗しました');
      }
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : 'エラーが発生しました');
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 font-sans">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">
            🎤 講義録 文字起こしシステム
          </h1>
          <p className="text-center text-gray-600 mb-8">
            講義情報とVimeo URLを入力して、詳細な文字起こしデータ（HTML）を生成します
          </p>

          {/* ステップインジケーター */}
          <div className="mb-8">
            <div className="flex items-center justify-center space-x-4">
              {['講義情報', 'URL入力', '処理中', '完了'].map((label, index) => {
                const stepIndex = ['info', 'url', 'processing', 'result'].indexOf(step);
                const isActive = index <= stepIndex;
                const isCurrent = index === stepIndex;
                
                return (
                  <div key={label} className="flex items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                      isActive ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'
                    }`}>
                      {index + 1}
                    </div>
                    <span className={`ml-2 text-sm ${isCurrent ? 'font-semibold text-blue-600' : 'text-gray-600'}`}>
                      {label}
                    </span>
                    {index < 3 && (
                      <div className={`w-8 h-0.5 ml-4 ${isActive ? 'bg-blue-600' : 'bg-gray-300'}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ステップ1: 講義情報入力 */}
          {step === 'info' && (
            <form onSubmit={handleInfoSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  講義テーマ名 *
                </label>
                <input
                  type="text"
                  value={lectureInfo.theme}
                  onChange={(e) => setLectureInfo(prev => ({ ...prev, theme: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-500"
                  placeholder="例: 公益資本主義の未来像"
                />
                {errors.theme && <p className="text-red-600 text-sm mt-1">{errors.theme}</p>}
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    講演者名 *
                  </label>
                  <input
                    type="text"
                    value={lectureInfo.speaker.name}
                    onChange={(e) => setLectureInfo(prev => ({ 
                      ...prev, 
                      speaker: { ...prev.speaker, name: e.target.value }
                    }))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-500"
                    placeholder="例: 田中太郎"
                  />
                  {errors.speakerName && <p className="text-red-600 text-sm mt-1">{errors.speakerName}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    肩書き *
                  </label>
                  <input
                    type="text"
                    value={lectureInfo.speaker.title}
                    onChange={(e) => setLectureInfo(prev => ({ 
                      ...prev, 
                      speaker: { ...prev.speaker, title: e.target.value }
                    }))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-500"
                    placeholder="例: 東京大学教授"
                  />
                  {errors.speakerTitle && <p className="text-red-600 text-sm mt-1">{errors.speakerTitle}</p>}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  講演者略歴 *
                </label>
                <textarea
                  value={lectureInfo.speaker.bio}
                  onChange={(e) => setLectureInfo(prev => ({ 
                    ...prev, 
                    speaker: { ...prev.speaker, bio: e.target.value }
                  }))}
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-500"
                  placeholder="講演者の略歴を入力してください"
                />
                {errors.speakerBio && <p className="text-red-600 text-sm mt-1">{errors.speakerBio}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  講演内容の紹介文 *
                </label>
                <textarea
                  value={lectureInfo.description}
                  onChange={(e) => setLectureInfo(prev => ({ ...prev, description: e.target.value }))}
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-500"
                  placeholder="講演の内容や目的について説明してください（50文字以上）"
                />
                <p className="text-sm text-gray-500 mt-1">
                  {lectureInfo.description.length}/200文字
                </p>
                {errors.description && <p className="text-red-600 text-sm mt-1">{errors.description}</p>}
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="bg-blue-600 text-white py-3 px-8 rounded-lg font-semibold hover:bg-blue-700"
                >
                  次へ →
                </button>
              </div>
            </form>
          )}

          {/* ステップ2: URL入力 */}
          {step === 'url' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Vimeo動画URL *
                </label>
                <input
                  type="url"
                  value={vimeoUrl}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  placeholder="https://vimeo.com/123456789"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-500"
                />
                {validatingUrl && (
                  <p className="text-blue-600 text-sm mt-2">URLを検証中...</p>
                )}
                {urlError && (
                  <p className="text-red-600 text-sm mt-2">{urlError}</p>
                )}
              </div>

              {/* 動画プレビュー */}
              {videoPreview && videoPreview.valid && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-semibold text-blue-800 mb-2">動画情報</h3>
                  <div className="flex space-x-4">
                    {videoPreview.thumbnail && (
                      <img 
                        src={videoPreview.thumbnail} 
                        alt="動画サムネイル"
                        className="w-24 h-16 object-cover rounded"
                      />
                    )}
                    <div className="flex-1">
                      <p className="font-medium text-gray-800">{videoPreview.title}</p>
                      <p className="text-sm text-gray-600">長さ: {formatDuration(videoPreview.duration)}</p>
                      {videoPreview.description && (
                        <p className="text-sm text-gray-600 mt-1">{videoPreview.description}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-between">
                <button
                  onClick={() => setStep('info')}
                  className="text-gray-600 hover:text-gray-800 font-semibold"
                >
                  ← 戻る
                </button>
                <button
                  onClick={handleTranscribe}
                  disabled={!videoPreview?.valid || processing}
                  className="bg-blue-600 text-white py-3 px-8 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {processing ? '処理中...' : '文字起こしを開始'}
                </button>
              </div>
            </div>
          )}

          {/* ステップ3: 処理中 */}
          {step === 'processing' && job && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-blue-800 mb-4">
                  文字起こし処理中
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm text-blue-700 mb-1">
                      <span>進捗</span>
                      <span>{job.progress}%</span>
                    </div>
                    <div className="w-full bg-blue-200 rounded-full h-2.5">
                      <div
                        className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                        style={{ width: `${job.progress}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-blue-700">ステータス:</span>
                      <span className={`ml-2 ${getStatusColor(job.status)}`}>
                        {job.status === 'initializing' && '初期化中...'}
                        {job.status === 'processing' && '処理中...'}
                        {job.status === 'resuming' && '再開中...'}
                        {job.status === 'error' && 'エラー'}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-blue-700">ジョブID:</span>
                      <span className="ml-2 font-mono text-xs">{job.jobId}</span>
                    </div>
                  </div>

                  {job.currentStage && (
                    <div className="text-sm text-blue-700">
                      <span className="font-medium">現在の段階:</span>
                      <span className="ml-2">{job.currentStage}</span>
                    </div>
                  )}

                  {job.estimatedCompletion && (
                    <div className="text-sm text-blue-700">
                      <span className="font-medium">推定完了時間:</span>
                      <span className="ml-2">{new Date(job.estimatedCompletion).toLocaleString('ja-JP')}</span>
                    </div>
                  )}

                  {job.error && (
                    <div className="bg-red-50 border border-red-200 rounded-md p-3">
                      <p className="text-red-800 text-sm">{job.error}</p>
                      {job.canResume && (
                        <button
                          onClick={handleResume}
                          className="mt-2 bg-yellow-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-yellow-700 text-sm"
                        >
                          処理を再開
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ステップ4: 結果表示 */}
          {step === 'result' && job?.result && (
            <div className="space-y-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-green-800 mb-4">
                  ✅ 文字起こし完了
                </h3>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-green-700">処理チャンク数:</span>
                      <span className="ml-2">{job.result.totalChunks}</span>
                    </div>
                    <div>
                      <span className="font-medium text-green-700">音声時間:</span>
                      <span className="ml-2">{formatDuration(job.result.duration)}</span>
                    </div>
                    <div>
                      <span className="font-medium text-green-700">平均信頼度:</span>
                      <span className="ml-2">{(job.result.averageConfidence * 100).toFixed(2)}%</span>
                    </div>
                  </div>

                  <div className="flex justify-end space-x-2">
                    <button
                      onClick={() => {
                        const htmlContent = generateLectureHTML(lectureInfo, job.result);
                        navigator.clipboard.writeText(htmlContent);
                        alert('HTMLをクリップボードにコピーしました');
                      }}
                      className="bg-green-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-green-700"
                    >
                      HTMLをコピー
                    </button>
                    <button
                      onClick={() => {
                        const htmlContent = generateLectureHTML(lectureInfo, job.result);
                        const blob = new Blob([htmlContent], { type: 'text/html' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `lecture-${lectureInfo.theme}-${new Date().toISOString().split('T')[0]}.html`;
                        a.click();
                      }}
                      className="bg-blue-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-blue-700"
                    >
                      HTMLをダウンロード
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-center">
                <button
                  onClick={() => {
                    setStep('info');
                    setLectureInfo({ theme: '', speaker: { name: '', title: '', bio: '' }, description: '' });
                    setVimeoUrl('');
                    setVideoPreview(null);
                    setJob(null);
                    setProcessing(false);
                    setErrors({});
                    setUrlError(null);
                  }}
                  className="bg-gray-600 text-white py-3 px-8 rounded-lg font-semibold hover:bg-gray-700"
                >
                  新しい講義を処理
                </button>
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

// HTML生成関数
function generateLectureHTML(lectureInfo: LectureInfo, result: any): string {
  const timestamp = new Date().toLocaleString('ja-JP');
  
  return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${lectureInfo.theme} - 講義録</title>
    <style>
        body { font-family: 'Hiragino Sans', 'Yu Gothic', sans-serif; line-height: 1.6; margin: 0; padding: 20px; background: #f8f9fa; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { border-bottom: 2px solid #e9ecef; padding-bottom: 20px; margin-bottom: 30px; }
        .title { font-size: 2em; font-weight: bold; color: #2c3e50; margin-bottom: 10px; }
        .meta { color: #6c757d; font-size: 0.9em; }
        .speaker { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .speaker-name { font-weight: bold; color: #495057; }
        .speaker-title { color: #6c757d; font-size: 0.9em; }
        .speaker-bio { margin-top: 10px; color: #495057; }
        .transcription { background: #fff; border: 1px solid #dee2e6; border-radius: 5px; padding: 20px; }
        .transcription-text { white-space: pre-wrap; line-height: 1.8; }
        .stats { background: #e3f2fd; padding: 15px; border-radius: 5px; margin: 20px 0; font-size: 0.9em; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; color: #6c757d; font-size: 0.8em; text-align: center; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="title">${lectureInfo.theme}</h1>
            <div class="meta">
                講演者: ${lectureInfo.speaker.name} | 
                生成日時: ${timestamp}
            </div>
        </div>

        <div class="speaker">
            <div class="speaker-name">${lectureInfo.speaker.name}</div>
            <div class="speaker-title">${lectureInfo.speaker.title}</div>
            <div class="speaker-bio">${lectureInfo.speaker.bio}</div>
        </div>

        <div class="stats">
            <strong>講演統計:</strong>
            音声時間: ${Math.floor(result.duration / 60)}分${Math.floor(result.duration % 60)}秒 | 
            文字数: ${result.fullText.length.toLocaleString()}文字 | 
            平均信頼度: ${(result.averageConfidence * 100).toFixed(1)}%
        </div>

        <div class="transcription">
            <h3>文字起こし結果</h3>
            <div class="transcription-text">${result.fullText}</div>
        </div>

        <div class="footer">
            この講義録は公益資本主義「智の泉」プロジェクトにより自動生成されました。
        </div>
    </div>
</body>
</html>`;
}
