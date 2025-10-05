'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function AudioTranscribeChunkedPage() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [transcriptionJobId, setTranscriptionJobId] = useState<string | null>(null);
  const [error, setError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

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

  // チャンクアップロード
  const handleChunkedUpload = async () => {
    if (!audioFile) {
      setError('音声ファイルを選択してください');
      return;
    }

    setIsUploading(true);
    setError('');
    setUploadProgress(0);

    try {
      const uploadId = generateUploadId();
      const chunkSize = 5 * 1024 * 1024; // 5MBチャンク
      const totalChunks = Math.ceil(audioFile.size / chunkSize);

      console.log(`Uploading ${audioFile.name} in ${totalChunks} chunks`);

      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, audioFile.size);
        const chunk = audioFile.slice(start, end);
        
        // チャンクをBase64に変換
        const chunkBase64 = await fileToBase64(chunk);
        
        const response = await fetch('/api/audio-upload-chunk', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chunkData: chunkBase64,
            chunkIndex: i,
            totalChunks,
            fileName: audioFile.name,
            fileSize: audioFile.size,
            uploadId,
            isLastChunk: i === totalChunks - 1
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || `チャンク ${i + 1} のアップロードに失敗しました`);
        }

        // 進捗を更新
        const progress = Math.round(((i + 1) / totalChunks) * 100);
        setUploadProgress(progress);

        // 最後のチャンクの場合、文字起こしジョブIDを取得
        if (data.transcriptionJobId) {
          setTranscriptionJobId(data.transcriptionJobId);
          // 文字起こし結果ページに遷移
          router.push(`/audio-transcribe/${data.transcriptionJobId}`);
          return;
        }
      }

    } catch (error) {
      console.error('Upload error:', error);
      setError(error instanceof Error ? error.message : 'アップロードエラーが発生しました');
      setIsUploading(false);
    }
  };

  // ファイルをBase64に変換
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  // アップロードIDを生成
  const generateUploadId = () => {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">
            音声文字起こし（チャンクアップロード）
          </h1>
          
          <div className="space-y-6">
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
                    MP3形式の音声ファイル（チャンクアップロード対応）
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
                    <p className="text-sm text-green-600">
                      チャンク数: {Math.ceil(audioFile.size / (5 * 1024 * 1024))}個（5MB/チャンク）
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

            {/* アップロードボタン */}
            <div className="text-center">
              <button
                onClick={handleChunkedUpload}
                disabled={!audioFile || isUploading}
                className={`px-8 py-3 rounded-lg font-medium ${
                  !audioFile || isUploading
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isUploading ? 'アップロード中...' : 'チャンクアップロード開始'}
              </button>
            </div>

            {/* 進捗表示 */}
            {isUploading && (
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-blue-800 font-medium">アップロード進捗</p>
                  <div className="mt-2 bg-blue-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                  <p className="text-sm text-blue-600 mt-1">{uploadProgress}% 完了</p>
                </div>
              </div>
            )}

            {/* 通常のアップロードへのリンク */}
            <div className="text-center">
              <p className="text-sm text-gray-500">
                小さいファイルの場合は{' '}
                <a href="/audio-transcribe" className="text-blue-600 hover:text-blue-800 underline">
                  通常のアップロード
                </a>
                をお試しください
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
