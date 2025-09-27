'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

interface LectureRecord {
  jobId: string;
  title: string;
  duration: string;
  confidence: number;
  fullText: string;
  chunks: Array<{
    chunkId: string;
    startTime: number;
    endTime: number;
    text: string;
    confidence: number;
  }>;
  createdAt: string;
}

export default function LectureRecordPage() {
  const params = useParams();
  const jobId = params.jobId as string;
  const [record, setRecord] = useState<LectureRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (jobId) {
      fetchLectureRecord(jobId);
    }
  }, [jobId]);

  const fetchLectureRecord = async (jobId: string) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/lecture-record/${jobId}`);
      
      if (!response.ok) {
        throw new Error('講義録の取得に失敗しました');
      }

      const data = await response.json();
      setRecord(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h > 0 ? h + '時間' : ''}${m > 0 ? m + '分' : ''}${s}秒`;
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const downloadHTML = () => {
    if (!record) return;

    const htmlContent = generateHTML(record);
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `講義録_${record.title}_${record.jobId}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const generateHTML = (record: LectureRecord) => {
    return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>講義録 - ${record.title}</title>
    <style>
        body {
            font-family: 'Hiragino Sans', 'Yu Gothic UI', 'Meiryo UI', sans-serif;
            line-height: 1.8;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f9fa;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            border-radius: 10px;
            margin-bottom: 30px;
            text-align: center;
        }
        .title {
            font-size: 2.2em;
            margin: 0 0 10px 0;
            font-weight: bold;
        }
        .meta {
            font-size: 1.1em;
            opacity: 0.9;
        }
        .content {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .chunk {
            margin-bottom: 25px;
            padding: 15px;
            border-left: 4px solid #667eea;
            background-color: #f8f9ff;
        }
        .timestamp {
            font-size: 0.9em;
            color: #666;
            font-weight: bold;
            margin-bottom: 8px;
        }
        .text {
            font-size: 1.1em;
            line-height: 1.8;
        }
        .confidence {
            font-size: 0.8em;
            color: #888;
            margin-top: 5px;
        }
        .footer {
            text-align: center;
            margin-top: 40px;
            padding: 20px;
            color: #666;
            font-size: 0.9em;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1 class="title">${record.title}</h1>
        <div class="meta">
            講義時間: ${formatDuration(parseFloat(record.duration))} | 
            信頼度: ${(record.confidence * 100).toFixed(1)}% | 
            作成日: ${new Date(record.createdAt).toLocaleDateString('ja-JP')}
        </div>
    </div>
    
    <div class="content">
        ${record.chunks.map(chunk => `
            <div class="chunk">
                <div class="timestamp">${formatTime(chunk.startTime)} - ${formatTime(chunk.endTime)}</div>
                <div class="text">${chunk.text}</div>
                <div class="confidence">信頼度: ${(chunk.confidence * 100).toFixed(1)}%</div>
            </div>
        `).join('')}
    </div>
    
    <div class="footer">
        <p>この講義録は「智の泉」システムにより自動生成されました。</p>
        <p>生成日時: ${new Date().toLocaleString('ja-JP')}</p>
    </div>
</body>
</html>`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">講義録を読み込み中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-4">エラー</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <a
            href="/"
            className="inline-block bg-blue-600 text-white py-2 px-6 rounded-lg font-semibold hover:bg-blue-700"
          >
            ホームに戻る
          </a>
        </div>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">講義録が見つかりません</h2>
          <p className="text-gray-600 mb-6">指定された講義録が存在しないか、削除されています。</p>
          <a
            href="/"
            className="inline-block bg-blue-600 text-white py-2 px-6 rounded-lg font-semibold hover:bg-blue-700"
          >
            ホームに戻る
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          {/* ヘッダー */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-8">
            <h1 className="text-3xl font-bold mb-4">{record.title}</h1>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="font-semibold">講義時間:</span> {formatDuration(parseFloat(record.duration))}
              </div>
              <div>
                <span className="font-semibold">信頼度:</span> {(record.confidence * 100).toFixed(1)}%
              </div>
              <div>
                <span className="font-semibold">作成日:</span> {new Date(record.createdAt).toLocaleDateString('ja-JP')}
              </div>
            </div>
          </div>

          {/* アクションボタン */}
          <div className="p-6 border-b">
            <div className="flex flex-wrap gap-4">
              <button
                onClick={downloadHTML}
                className="bg-green-600 text-white py-2 px-6 rounded-lg font-semibold hover:bg-green-700 transition-colors"
              >
                📄 HTMLダウンロード
              </button>
              <button
                onClick={() => navigator.clipboard.writeText(record.fullText)}
                className="bg-blue-600 text-white py-2 px-6 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
              >
                📋 テキストコピー
              </button>
              <a
                href="/"
                className="bg-gray-600 text-white py-2 px-6 rounded-lg font-semibold hover:bg-gray-700 transition-colors"
              >
                🏠 ホームに戻る
              </a>
            </div>
          </div>

          {/* 講義録コンテンツ */}
          <div className="p-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">講義録</h2>
            <div className="space-y-6">
              {record.chunks.map((chunk, index) => (
                <div key={chunk.chunkId} className="border-l-4 border-blue-500 pl-6 py-4 bg-gray-50 rounded-r-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold text-blue-600">
                      {formatTime(chunk.startTime)} - {formatTime(chunk.endTime)}
                    </span>
                    <span className="text-xs text-gray-500">
                      信頼度: {(chunk.confidence * 100).toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-gray-800 leading-relaxed">{chunk.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
