'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface TranscriptionResult {
  text: string;
  segments: Array<{
    text: string;
    confidence: number;
    words: Array<{
      word: string;
      startTime: { seconds: number };
      endTime: { seconds: number };
    }>;
  }>;
  totalConfidence: number;
  duration: number;
  wordCount: number;
}

export default function TranscribePage() {
  const [file, setFile] = useState<File | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [result, setResult] = useState<TranscriptionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const router = useRouter();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // ファイルサイズの制限（2GB）
      const maxSize = 2 * 1024 * 1024 * 1024; // 2GB
      if (selectedFile.size > maxSize) {
        setError('ファイルサイズが大きすぎます（最大2GB）');
        return;
      }
      
      // ファイル形式の検証
      const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/m4a', 'video/mp4'];
      if (!allowedTypes.includes(selectedFile.type)) {
        setError('サポートされていないファイル形式です');
        return;
      }
      
      setFile(selectedFile);
      setError(null);
      setResult(null);
    }
  };

  const handleTranscribe = async () => {
    if (!file) return;

    setTranscribing(true);
    setError(null);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append('audio', file);

      // プログレス表示のシミュレーション
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 2000);

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      setProgress(100);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '文字起こしに失敗しました');
      }

      const transcriptionResult = await response.json();
      setResult(transcriptionResult.transcription);
    } catch (err) {
      setError(err instanceof Error ? err.message : '文字起こしエラーが発生しました');
    } finally {
      setTranscribing(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">
            🎤 講演動画文字起こし
          </h1>
          <p className="text-center text-gray-600 mb-8">
            Google Speech-to-Textを使用して、1時間以上の長尺動画を高精度で文字起こしします
          </p>

          {/* ファイル選択 */}
          <div className="mb-8">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              音声・動画ファイルを選択（最大2GB）
            </label>
            <input
              type="file"
              accept="audio/*,video/mp4"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            {file && (
              <div className="mt-2 text-sm text-gray-600">
                選択されたファイル: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
              </div>
            )}
          </div>

          {/* エラー表示 */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          {/* 文字起こしボタン */}
          <div className="mb-8">
            <button
              onClick={handleTranscribe}
              disabled={!file || transcribing}
              className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {transcribing ? '文字起こし中...' : '文字起こしを開始'}
            </button>
          </div>

          {/* プログレスバー */}
          {transcribing && (
            <div className="mb-8">
              <div className="bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <p className="text-center text-sm text-gray-600 mt-2">
                文字起こし中... {progress}%
              </p>
            </div>
          )}

          {/* 結果表示 */}
          {result && (
            <div className="bg-green-50 border border-green-200 rounded-md p-6">
              <h3 className="text-lg font-semibold text-green-800 mb-4">
                ✅ 文字起こし完了
              </h3>
              
              <div className="grid md:grid-cols-3 gap-4 mb-6 text-sm">
                <div className="bg-white p-3 rounded">
                  <strong>信頼度:</strong> {(result.totalConfidence * 100).toFixed(1)}%
                </div>
                <div className="bg-white p-3 rounded">
                  <strong>文字数:</strong> {result.wordCount.toLocaleString()}語
                </div>
                <div className="bg-white p-3 rounded">
                  <strong>長さ:</strong> {formatDuration(result.duration)}
                </div>
              </div>

              <div className="bg-white p-4 rounded border">
                <h4 className="font-semibold mb-2">文字起こし結果:</h4>
                <div className="max-h-96 overflow-y-auto text-sm leading-relaxed">
                  {result.text}
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(result.text);
                    alert('テキストをクリップボードにコピーしました');
                  }}
                  className="bg-green-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-green-700"
                >
                  テキストをコピー
                </button>
                <button
                  onClick={() => {
                    const blob = new Blob([result.text], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'transcription.txt';
                    a.click();
                  }}
                  className="bg-blue-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-blue-700"
                >
                  テキストをダウンロード
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
