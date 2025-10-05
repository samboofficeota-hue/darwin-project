'use client';

import { useState } from 'react';

export default function TestUploadPage() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string>('');

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setAudioFile(file);
      setError('');
      setResult(null);
    }
  };

  const handleTestUpload = async () => {
    if (!audioFile) {
      setError('ファイルを選択してください');
      return;
    }

    setIsUploading(true);
    setError('');
    setResult(null);

    try {
      // ファイルをBase64に変換
      const base64String = await fileToBase64(audioFile);
      
      const response = await fetch('/api/test-upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          testData: base64String,
          fileName: audioFile.name
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'アップロードテストに失敗しました');
      }

      setResult(data);

    } catch (error) {
      console.error('Test upload error:', error);
      setError(error instanceof Error ? error.message : 'アップロードテストエラーが発生しました');
    } finally {
      setIsUploading(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // data:audio/mpeg;base64, プレフィックスを削除して純粋なBase64文字列を返す
        const base64String = result.split(',')[1];
        resolve(base64String);
      };
      reader.onerror = error => reject(error);
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">
            アップロード機能テスト
          </h1>
          
          <div className="space-y-6">
            {/* ファイル選択 */}
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <div className="space-y-4">
                <div>
                  <label htmlFor="test-file" className="cursor-pointer">
                    <span className="text-lg font-medium text-blue-600 hover:text-blue-500">
                      テストファイルを選択
                    </span>
                    <input
                      id="test-file"
                      type="file"
                      accept=".mp3,audio/mpeg"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </label>
                  <p className="text-sm text-gray-500 mt-2">
                    MP3形式の音声ファイル
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

            {/* テストボタン */}
            <div className="text-center">
              <button
                onClick={handleTestUpload}
                disabled={!audioFile || isUploading}
                className={`px-8 py-3 rounded-lg font-medium ${
                  !audioFile || isUploading
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isUploading ? 'テスト中...' : 'アップロードテスト実行'}
              </button>
            </div>

            {/* 結果表示 */}
            {result && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h3 className="text-lg font-medium text-green-800 mb-2">テスト結果</h3>
                <pre className="text-sm text-green-700 whitespace-pre-wrap">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
