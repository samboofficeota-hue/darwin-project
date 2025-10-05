'use client';

import { useState, useRef } from 'react';

export default function TestAudioPage() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [error, setError] = useState<string>('');
  const [testMode, setTestMode] = useState<'metadata' | 'chunking' | 'both'>('both');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ファイル選択時の処理
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // MP3ファイルかチェック
      if (file.type !== 'audio/mpeg' && !file.name.toLowerCase().endsWith('.mp3')) {
        setError('MP3形式の音声ファイルを選択してください');
        return;
      }
      
      setAudioFile(file);
      setError('');
    }
  };

  // テスト実行
  const handleTest = async () => {
    if (!audioFile) {
      setError('音声ファイルを選択してください');
      return;
    }

    setIsTesting(true);
    setError('');
    setTestResult(null);

    try {
      // ファイルをBase64に変換
      const base64Audio = await fileToBase64(audioFile);
      
      const response = await fetch('/api/test-audio-chunking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audioData: base64Audio,
          testMode
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'テストに失敗しました');
      }

      setTestResult(data);

    } catch (error) {
      console.error('Test error:', error);
      setError(error instanceof Error ? error.message : 'テストエラーが発生しました');
    } finally {
      setIsTesting(false);
    }
  };

  // ファイルをBase64に変換
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
      <div className="max-w-6xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">
            音声チャンク分割テスト
          </h1>
          
          <div className="space-y-6">
            {/* テストモード選択 */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h2 className="text-lg font-medium text-blue-800 mb-4">テストモード</h2>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="testMode"
                    value="metadata"
                    checked={testMode === 'metadata'}
                    onChange={(e) => setTestMode(e.target.value as any)}
                    className="mr-2"
                  />
                  <span className="text-blue-700">メタデータ取得のみ</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="testMode"
                    value="chunking"
                    checked={testMode === 'chunking'}
                    onChange={(e) => setTestMode(e.target.value as any)}
                    className="mr-2"
                  />
                  <span className="text-blue-700">チャンク分割のみ</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="testMode"
                    value="both"
                    checked={testMode === 'both'}
                    onChange={(e) => setTestMode(e.target.value as any)}
                    className="mr-2"
                  />
                  <span className="text-blue-700">メタデータ取得 + チャンク分割</span>
                </label>
              </div>
            </div>

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
                    MP3形式の音声ファイル（テスト用）
                  </p>
                </div>
                
                {audioFile && (
                  <div className="mt-4 p-4 bg-green-50 rounded-lg">
                    <p className="text-sm text-green-800">
                      <strong>選択されたファイル:</strong> {audioFile.name}
                    </p>
                    <p className="text-sm text-green-600">
                      サイズ: {(audioFile.size / 1024).toFixed(2)} KB
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
                onClick={handleTest}
                disabled={!audioFile || isTesting}
                className={`px-8 py-3 rounded-lg font-medium ${
                  !audioFile || isTesting
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isTesting ? 'テスト中...' : 'テスト実行'}
              </button>
            </div>

            {/* テスト結果表示 */}
            {testResult && (
              <div className="space-y-6">
                <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                  <h2 className="text-lg font-medium text-green-800 mb-4">テスト結果</h2>
                  
                  {/* メタデータ表示 */}
                  {testResult.result.metadata && (
                    <div className="mb-6">
                      <h3 className="text-md font-medium text-green-700 mb-2">音声メタデータ</h3>
                      <div className="bg-white rounded p-4 text-sm">
                        <div className="grid grid-cols-2 gap-2">
                          <div><strong>再生時間:</strong> {testResult.result.metadata.duration}秒</div>
                          <div><strong>サンプルレート:</strong> {testResult.result.metadata.sampleRate} Hz</div>
                          <div><strong>チャンネル数:</strong> {testResult.result.metadata.channels}ch</div>
                          <div><strong>ビットレート:</strong> {testResult.result.metadata.bitrate} bps</div>
                          <div><strong>フォーマット:</strong> {testResult.result.metadata.format}</div>
                          <div><strong>ファイルサイズ:</strong> {(testResult.result.metadata.size / 1024).toFixed(2)} KB</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* チャンク情報表示 */}
                  {testResult.result.chunks && (
                    <div>
                      <h3 className="text-md font-medium text-green-700 mb-2">チャンク分割結果</h3>
                      <div className="bg-white rounded p-4">
                        <p className="text-sm text-gray-600 mb-3">
                          総チャンク数: {testResult.result.chunks.length}個
                        </p>
                        <div className="space-y-2">
                          {testResult.result.chunks.map((chunk: any, index: number) => (
                            <div key={chunk.id} className="flex justify-between items-center p-2 bg-gray-50 rounded text-sm">
                              <span>
                                {chunk.id}: {chunk.startTime}s - {chunk.endTime}s ({chunk.duration}s)
                              </span>
                              <span className={`px-2 py-1 rounded text-xs ${
                                chunk.status === 'created' 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {chunk.status === 'created' 
                                  ? `${(chunk.fileSize / 1024).toFixed(1)}KB` 
                                  : 'Error'
                                }
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
