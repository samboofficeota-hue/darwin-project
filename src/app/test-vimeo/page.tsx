'use client';

import { useState } from 'react';

export default function TestVimeoPage() {
  const [testResult, setTestResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const testVimeoAPI = async () => {
    setLoading(true);
    setError(null);
    setTestResult(null);

    try {
      const response = await fetch('/api/validate-vimeo-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vimeoUrl: 'https://vimeo.com/123456789' // テスト用のダミーURL
        })
      });
      const data = await response.json();

      if (response.ok) {
        setTestResult(data);
      } else {
        setError(data.error || 'テストに失敗しました');
      }
    } catch (err) {
      setError('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">
            Vimeo API 接続テスト
          </h1>
          
          <div className="text-center mb-8">
            <button
              onClick={testVimeoAPI}
              disabled={loading}
              className="bg-blue-600 text-white py-3 px-8 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? 'テスト中...' : 'Vimeo API接続テスト'}
            </button>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
              <h3 className="text-lg font-semibold text-red-800 mb-2">❌ エラー</h3>
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {testResult && (
            <div className="bg-green-50 border border-green-200 rounded-md p-6">
              <h3 className="text-lg font-semibold text-green-800 mb-4">
                ✅ テスト成功
              </h3>
              
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-green-700 mb-2">接続状況:</h4>
                  <p className="text-green-600">{testResult.message}</p>
                </div>
                
                {testResult.user && (
                  <div>
                    <h4 className="font-medium text-green-700 mb-2">ユーザー情報:</h4>
                    <div className="bg-white p-4 rounded-md">
                      <p><strong>名前:</strong> {testResult.user.name}</p>
                      <p><strong>URI:</strong> {testResult.user.uri}</p>
                      <p><strong>アカウント:</strong> {testResult.user.account}</p>
                    </div>
                  </div>
                )}
                
                <div>
                  <h4 className="font-medium text-green-700 mb-2">テスト時刻:</h4>
                  <p className="text-green-600">{new Date(testResult.timestamp).toLocaleString('ja-JP')}</p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-8 text-center">
            <a
              href="/vimeo-transcribe"
              className="text-blue-600 hover:text-blue-800 font-semibold"
            >
              → Vimeo文字起こしページへ
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
