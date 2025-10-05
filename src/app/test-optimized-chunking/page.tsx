'use client';

import { useState } from 'react';

export default function TestOptimizedChunkingPage() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'audio/mpeg' && !file.name.endsWith('.mp3')) {
        setError('MP3ファイルのみ対応しています');
        return;
      }
      setAudioFile(file);
      setError(null);
      setResult(null);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = reader.result as string;
        resolve(base64.split(',')[1]); // data:audio/mpeg;base64, の部分を除去
      };
      reader.onerror = error => reject(error);
    });
  };

  const handleTest = async () => {
    if (!audioFile) {
      setError('音声ファイルを選択してください');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const audioData = await fileToBase64(audioFile);
      
      const response = await fetch('/api/test-optimized-chunking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audioData,
          fileName: audioFile.name
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'テスト実行に失敗しました');
      }

      setResult(data);
    } catch (error) {
      console.error('Test error:', error);
      setError(error instanceof Error ? error.message : 'テスト実行エラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">
            🎵 最適化されたチャンク分割テスト
          </h1>
          
          <div className="space-y-6">
            {/* ファイル選択 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                音声ファイルを選択
              </label>
              <input
                type="file"
                accept=".mp3,audio/mpeg"
                onChange={handleFileChange}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              {audioFile && (
                <p className="mt-2 text-sm text-gray-600">
                  選択されたファイル: {audioFile.name} ({(audioFile.size / 1024 / 1024).toFixed(2)} MB)
                </p>
              )}
            </div>

            {/* テスト実行ボタン */}
            <button
              onClick={handleTest}
              disabled={!audioFile || isLoading}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'テスト実行中...' : '最適化されたチャンク分割をテスト'}
            </button>

            {/* エラー表示 */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h3 className="text-red-800 font-medium">エラー</h3>
                <p className="text-red-700 mt-1">{error}</p>
              </div>
            )}

            {/* 結果表示 */}
            {result && (
              <div className="space-y-6">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h3 className="text-green-800 font-medium">✅ テスト完了</h3>
                  <p className="text-green-700 mt-1">{result.message}</p>
                </div>

                {/* 音声メタデータ */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">📊 音声メタデータ</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-gray-600">長さ:</span>
                      <p className="text-gray-900">{Math.round(result.metadata.duration)}秒</p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">サイズ:</span>
                      <p className="text-gray-900">{(result.metadata.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">サンプリングレート:</span>
                      <p className="text-gray-900">{result.metadata.sampleRate} Hz</p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">チャンネル:</span>
                      <p className="text-gray-900">{result.metadata.channels}</p>
                    </div>
                  </div>
                </div>

                {/* 無音検出結果 */}
                {result.chunkingResults.silenceDetection && (
                  <div className="bg-blue-50 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">
                      🔇 無音検出による分割
                    </h3>
                    {result.chunkingResults.silenceDetection.success ? (
                      <div>
                        <p className="text-blue-700 mb-3">
                          成功: {result.chunkingResults.silenceDetection.chunkCount}個のチャンクに分割
                        </p>
                        <div className="space-y-2">
                          {result.chunkingResults.silenceDetection.chunks.map((chunk: any, index: number) => (
                            <div key={index} className="bg-white rounded p-3 text-sm">
                              <div className="flex justify-between items-center">
                                <span className="font-medium">{chunk.id}</span>
                                <span className="text-gray-500">{chunk.duration.toFixed(1)}秒</span>
                              </div>
                              <div className="text-gray-600">
                                {chunk.startTime.toFixed(1)}s - {chunk.endTime.toFixed(1)}s
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-blue-700">
                        無音検出に失敗: {result.chunkingResults.silenceDetection.reason}
                      </p>
                    )}
                  </div>
                )}

                {/* 時間ベース分割結果 */}
                {result.chunkingResults.timeBasedFallback && (
                  <div className="bg-yellow-50 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">
                      ⏰ 時間ベース分割（フォールバック）
                    </h3>
                    <p className="text-yellow-700 mb-3">
                      {result.chunkingResults.timeBasedFallback.chunkCount}個のチャンクに分割
                    </p>
                    <div className="space-y-2">
                      {result.chunkingResults.timeBasedFallback.chunks.map((chunk: any, index: number) => (
                        <div key={index} className="bg-white rounded p-3 text-sm">
                          <div className="flex justify-between items-center">
                            <span className="font-medium">{chunk.id}</span>
                            <span className="text-gray-500">{chunk.duration.toFixed(1)}秒</span>
                          </div>
                          <div className="text-gray-600">
                            {chunk.startTime.toFixed(1)}s - {chunk.endTime.toFixed(1)}s
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 最終チャンク詳細 */}
                {result.chunkingResults.finalChunks && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">
                      📁 最終チャンク詳細
                    </h3>
                    <div className="space-y-2">
                      {result.chunkingResults.finalChunks.map((chunk: any, index: number) => (
                        <div key={index} className="bg-white rounded p-3 text-sm">
                          <div className="flex justify-between items-center mb-2">
                            <span className="font-medium">{chunk.id}</span>
                            <span className="text-gray-500">
                              {chunk.fileSize ? `${(chunk.fileSize / 1024).toFixed(1)} KB` : 'N/A'}
                            </span>
                          </div>
                          <div className="text-gray-600">
                            時間: {chunk.startTime.toFixed(1)}s - {chunk.endTime.toFixed(1)}s 
                            ({chunk.duration.toFixed(1)}秒)
                          </div>
                          <div className="text-gray-600">
                            分割方法: {chunk.splitMethod === 'silence' ? '🔇 無音検出' : '⏰ 時間ベース'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
