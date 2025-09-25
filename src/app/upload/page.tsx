'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
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
      const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/m4a'];
      if (!allowedTypes.includes(selectedFile.type)) {
        setError('サポートされていないファイル形式です');
        return;
      }
      
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder_path', '智の泉/01_講演録');

      const response = await fetch('/api/upload-audio', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'アップロードに失敗しました');
      }

      const result = await response.json();
      setUploadResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'アップロードエラーが発生しました');
    } finally {
      setUploading(false);
    }
  };

  const startTranscription = async () => {
    if (!uploadResult?.file_id) return;

    try {
      const response = await fetch('/api/start-transcription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ file_id: uploadResult.file_id }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '文字起こし開始に失敗しました');
      }

      const result = await response.json();
      alert(`文字起こしを開始しました。ジョブID: ${result.job_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '文字起こし開始エラーが発生しました');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">
            音声ファイルアップロード
          </h1>
          <p className="text-center text-gray-600 mb-8">
            GenSpark AIドライブに直接アップロードして、4段階の文字起こしを実行します
          </p>

          {/* ファイル選択 */}
          <div className="mb-8">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              音声ファイルを選択（最大2GB）
            </label>
            <input
              type="file"
              accept="audio/*"
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

          {/* アップロードボタン */}
          <div className="mb-8">
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {uploading ? 'アップロード中...' : 'GenSpark AIドライブにアップロード'}
            </button>
          </div>

          {/* アップロード結果 */}
          {uploadResult && (
            <div className="bg-green-50 border border-green-200 rounded-md p-6">
              <h3 className="text-lg font-semibold text-green-800 mb-4">
                ✅ アップロード完了
              </h3>
              <div className="space-y-2 text-sm">
                <p><strong>ファイル名:</strong> {uploadResult.filename}</p>
                <p><strong>ファイルID:</strong> {uploadResult.file_id}</p>
                <p><strong>保存先:</strong> {uploadResult.folder_path}</p>
                <p><strong>ファイルサイズ:</strong> {(uploadResult.file_size / 1024 / 1024).toFixed(2)} MB</p>
                <p><strong>一時URL:</strong> 
                  <a 
                    href={uploadResult.temp_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline ml-1"
                  >
                    {uploadResult.temp_url}
                  </a>
                </p>
              </div>
              
              <div className="mt-6">
                <button
                  onClick={startTranscription}
                  className="bg-green-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-green-700"
                >
                  4段階文字起こしを開始
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