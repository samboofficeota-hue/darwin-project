'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface LectureInfo {
  theme: string;
  speaker: {
    name: string;
    title: string;
    bio: string;
  };
  description: string;
}

export default function UploadPage() {
  const [vimeoUrl, setVimeoUrl] = useState('');
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [lectureInfo, setLectureInfo] = useState<LectureInfo | null>(null);
  const router = useRouter();

  // 講義情報をセッションストレージから読み込み
  useEffect(() => {
    const savedLectureInfo = sessionStorage.getItem('lectureInfo');
    if (savedLectureInfo) {
      try {
        setLectureInfo(JSON.parse(savedLectureInfo));
      } catch (error) {
        console.error('Error parsing lecture info:', error);
      }
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!vimeoUrl.trim()) {
      setError('Vimeo URLを入力してください');
      return;
    }

    if (!lectureInfo) {
      setError('講義情報が設定されていません。先に講義情報を入力してください。');
      return;
    }

    setProcessing(true);
    setError(null);
    setResult(null);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒タイムアウト
      
      const response = await fetch('/api/vimeo-transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          vimeoUrl: vimeoUrl,
          lecture_info: lectureInfo
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      const data = await response.json();

      if (response.ok) {
        setResult(data);
      } else {
        setError(data.error || '文字起こし開始に失敗しました');
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('タイムアウトが発生しました。ネットワーク接続を確認してください。');
      } else {
        setError('通信エラーが発生しました');
      }
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">
            Vimeo動画 文字起こし
          </h1>
          <p className="text-center text-gray-600 mb-8">
            Vimeoの動画URLを入力して、長時間の講義動画を文字起こしします。<br />
            中断・再開機能により、安定した処理が可能です。
          </p>

          {/* 講義情報表示 */}
          {lectureInfo && (
            <div className="mb-8 p-6 bg-green-50 border border-green-200 rounded-lg">
              <h3 className="text-lg font-semibold text-green-800 mb-4">
                📚 講義情報（認識精度向上に使用）
              </h3>
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p><strong>テーマ:</strong> {lectureInfo.theme}</p>
                  <p><strong>講演者:</strong> {lectureInfo.speaker.name}</p>
                  <p><strong>肩書き:</strong> {lectureInfo.speaker.title}</p>
                </div>
                <div>
                  <p><strong>紹介文:</strong> {lectureInfo.description.substring(0, 100)}...</p>
                </div>
              </div>
              <div className="mt-4 text-center">
                <button
                  onClick={() => router.push('/lecture-info')}
                  className="text-green-600 hover:text-green-800 font-semibold text-sm"
                >
                  講義情報を編集 →
                </button>
              </div>
            </div>
          )}

          {/* 講義情報未設定の場合 */}
          {!lectureInfo && (
            <div className="mb-8 p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h3 className="text-lg font-semibold text-yellow-800 mb-2">
                ⚠️ 講義情報が未設定です
              </h3>
              <p className="text-yellow-700 mb-4">
                より正確な文字起こしのために、講義の詳細情報を入力することをお勧めします。
              </p>
              <div className="text-center">
                <button
                  onClick={() => router.push('/lecture-info')}
                  className="bg-yellow-600 text-white py-2 px-6 rounded-lg font-semibold hover:bg-yellow-700 transition-colors"
                >
                  講義情報を入力する
                </button>
              </div>
            </div>
          )}

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
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white disabled:text-gray-500 disabled:bg-gray-100"
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
            </div>
          )}

          {/* 結果表示 */}
          {result && (
            <div className="bg-green-50 border border-green-200 rounded-md p-6">
              <h3 className="text-lg font-semibold text-green-800 mb-4">
                ✅ 講義録作成開始
              </h3>
              
              <div className="space-y-2 text-sm">
                <p><strong>ジョブID:</strong> {result.jobId}</p>
                <p><strong>ステータス:</strong> {result.status}</p>
                <p><strong>推定処理時間:</strong> {result.estimatedDuration}分</p>
              </div>

              <div className="mt-6 space-x-4">
                <a
                  href="/vimeo-transcribe"
                  className="inline-block bg-blue-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                >
                  📊 進捗を確認する
                </a>
                <a
                  href={`/lecture-record/${result.jobId}`}
                  className="inline-block bg-green-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-green-700 transition-colors"
                >
                  📄 講義録を表示
                </a>
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