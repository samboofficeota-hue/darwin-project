'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface TranscriptionResult {
  fullText: string;
  rawText?: string;
  enhanced?: boolean;
  averageConfidence: number;
  totalChunks: number;
  failedChunks: number;
  duration: number;
  successRate: number;
  processed: boolean;
}

interface JobStatus {
  jobId: string;
  status: string;
  progress: number;
  audioMetadata: any;
  result: TranscriptionResult;
  error: string;
  completedChunks?: number;
  totalChunks?: number;
  lastUpdate?: string;
}

export default function AudioTranscriptionResultPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params?.jobId as string;
  
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [showFullText, setShowFullText] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState('');
  const [showRawText, setShowRawText] = useState(false);
  const [speakerMap, setSpeakerMap] = useState<{[key: string]: string}>({});
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.75);
  const [headingCandidates, setHeadingCandidates] = useState<Array<{index:number,title:string}>>([]);
  const [replaceFrom, setReplaceFrom] = useState('');
  const [replaceTo, setReplaceTo] = useState('');

  useEffect(() => {
    if (jobId) {
      fetchJobStatus();
    }
  }, [jobId]);

  useEffect(() => {
    if (jobStatus?.result?.fullText && !editedText) {
      setEditedText(jobStatus.result.fullText);
    }
  }, [jobStatus]);

  // ポーリング: 処理中の場合は定期的にステータスを確認
  useEffect(() => {
    if (!jobStatus) return;

    const isProcessing = jobStatus.status === 'initializing' || 
                        jobStatus.status === 'processing';

    if (isProcessing) {
      console.log(`Job is ${jobStatus.status}, polling in 3 seconds...`);
      const pollTimer = setTimeout(() => {
        fetchJobStatus();
      }, 3000); // 3秒ごとにポーリング

      return () => clearTimeout(pollTimer);
    }
  }, [jobStatus]);

  const fetchJobStatus = async () => {
    try {
      // Cloud Run のエンドポイントを使用してジョブステータスを取得
      const CLOUD_RUN_URL = 'https://darwin-project-574364248563.asia-northeast1.run.app';
      const response = await fetch(`${CLOUD_RUN_URL}/api/audio-transcription-status?jobId=${jobId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'ジョブ情報の取得に失敗しました');
      }

      console.log('Job status fetched from Cloud Run:', {
        jobId,
        status: data.status,
        progress: data.progress,
        completedChunks: data.completedChunks,
        totalChunks: data.totalChunks
      });

      setJobStatus(data);
      // Initialize speaker map from detected speaker tags if present
      const detected = new Set<string>();
      data?.result?.chunks?.forEach((c: any) => {
        c?.segments?.forEach((s: any) => {
          if (s.speakerTag) detected.add(`S${s.speakerTag}`);
        });
      });
      if (detected.size > 0 && Object.keys(speakerMap).length === 0) {
        const initial: {[k: string]: string} = {};
        Array.from(detected).forEach(k => initial[k] = '');
        setSpeakerMap(initial);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error fetching job status:', error);
      setError(error instanceof Error ? error.message : 'エラーが発生しました');
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert('テキストをクリップボードにコピーしました');
    } catch (error) {
      console.error('Copy failed:', error);
      alert('コピーに失敗しました');
    }
  };

  const downloadText = () => {
    const textToDownload = isEditing ? editedText : jobStatus?.result?.fullText;
    if (!textToDownload) return;
    
    const blob = new Blob([textToDownload], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcription_${jobId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadWord = async () => {
    const textToDownload = isEditing ? editedText : jobStatus?.result?.fullText;
    if (!textToDownload) return;

    try {
      const response = await fetch('/api/generate-word', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: textToDownload,
          jobId: jobId,
          metadata: {
            duration: jobStatus?.result?.duration,
            confidence: jobStatus?.result?.averageConfidence,
            totalChunks: jobStatus?.result?.totalChunks
          }
        })
      });

      if (!response.ok) {
        throw new Error('WORD形式への変換に失敗しました');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transcription_${jobId}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading Word:', error);
      alert('WORD形式のダウンロードに失敗しました');
    }
  };

  const handleSaveEdit = () => {
    if (jobStatus?.result) {
      jobStatus.result.fullText = editedText;
    }
    setIsEditing(false);
    alert('編集内容が保存されました');
  };

  const handleCancelEdit = () => {
    setEditedText(jobStatus?.result?.fullText || '');
    setIsEditing(false);
  };

  function renderTranscriptView() {
    const r = jobStatus?.result;
    if (!r) return null;

    // If we don't have detailed segments, fallback to raw/full toggle
    const hasSegments = Array.isArray((r as any).chunks);
    if (!hasSegments) {
      return (
        <pre className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed">
          {showRawText && r.rawText ? r.rawText : r.fullText}
        </pre>
      );
    }

    // Build a simple paragraph view combining segments; highlight low-confidence words;
    // prepend speaker names if mapped.
    const elements: any[] = [];
    (r as any).chunks.forEach((chunk: any, ci: number) => {
      const segs = chunk.segments || [];
      segs.forEach((seg: any, si: number) => {
        const speakerTag = seg.speakerTag ? `S${seg.speakerTag}` : '';
        const speakerLabel = speakerTag && speakerMap[speakerTag] ? speakerMap[speakerTag] : speakerTag;
        const words = (seg.words || []).map((w: any, wi: number) => {
          const conf = typeof w.confidence === 'number' ? w.confidence : 1;
          const isLow = conf < confidenceThreshold;
          return (
            <span key={`w-${ci}-${si}-${wi}`} className={isLow ? 'bg-yellow-200' : ''}>{w.word || w.text || ''}</span>
          );
        });

        elements.push(
          <div key={`seg-${ci}-${si}`} className="mb-2">
            {speakerLabel && (
              <span className="mr-2 text-xs px-2 py-1 bg-gray-200 rounded text-gray-700">{speakerLabel}</span>
            )}
            <span className="text-sm text-gray-800 leading-relaxed">{words}</span>
          </div>
        );
      });
    });

    return <div className="text-sm">{elements}</div>;
  }

  async function handleSuggestHeadings() {
    try {
      const baseText = showRawText && jobStatus?.result?.rawText ? jobStatus.result.rawText : (jobStatus?.result?.fullText || '');
      const res = await fetch('/api/headings/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: baseText, style: 'bracket', maxHeadings: 12, apply: false })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'failed');
      setHeadingCandidates(json.headings || []);
    } catch (e) {
      alert('見出し候補の生成に失敗しました');
    }
  }

  async function handleApplyHeadings() {
    try {
      const baseText = showRawText && jobStatus?.result?.rawText ? jobStatus.result.rawText : (jobStatus?.result?.fullText || '');
      const res = await fetch('/api/headings/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: baseText, style: 'bracket', maxHeadings: 12, apply: true })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'failed');
      setEditedText(json.text);
      setIsEditing(true);
    } catch (e) {
      alert('見出しの挿入に失敗しました');
    }
  }

  async function handlePersistFinal() {
    try {
      const lectureId = sessionStorage.getItem('lectureId') || '';
      const res = await fetch('/api/transcripts/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lectureId,
          rawText: jobStatus?.result?.rawText || '',
          finalText: editedText || jobStatus?.result?.fullText || '',
          version: 1,
          stats: {
            avgConfidence: jobStatus?.result?.averageConfidence || 0
          },
          sttConfig: {}
        })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'failed');
      alert('クラウドへ確定版を保存しました');
    } catch (e) {
      alert('保存に失敗しました');
    }
  }

  async function handleReplaceAndLearn() {
    if (!replaceFrom || !replaceTo) return;
    const newText = (editedText || '').split(replaceFrom).join(replaceTo);
    setEditedText(newText);
    try {
      const lectureId = sessionStorage.getItem('lectureId') || null;
      const res = await fetch('/api/dictionaries/learn', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lectureId, pairs: [{ from: replaceFrom, to: replaceTo }], scope: lectureId ? 'lecture' : 'global' })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'failed');
      alert('置換と学習を完了しました（次回以降にヒント適用）');
      setReplaceFrom(''); setReplaceTo('');
    } catch (e) {
      alert('学習の保存に失敗しました');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (error || !jobStatus) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
            <h2 className="text-lg font-medium text-red-800 mb-2">エラー</h2>
            <p className="text-red-600 mb-4">{error || 'ジョブが見つかりません'}</p>
            <button
              onClick={() => router.push('/audio-transcribe')}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              戻る
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 処理中の表示
  if (jobStatus.status === 'initializing' || jobStatus.status === 'processing') {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="text-center">
              <h1 className="text-3xl font-bold text-gray-900 mb-4">文字起こし処理中</h1>
              <p className="text-gray-600 mb-2">ジョブID: {jobId}</p>
              <p className="text-gray-500 text-sm mb-8">処理が完了するまでお待ちください...</p>

              {/* ステータス表示 */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
                <div className="flex items-center justify-center mb-4">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                </div>
                <p className="text-blue-800 font-medium mb-2">
                  {jobStatus.status === 'initializing' ? '初期化中...' : '文字起こし処理中...'}
                </p>
                <p className="text-blue-600 text-sm">
                  {jobStatus.progress !== undefined ? `進捗: ${jobStatus.progress}%` : '処理中...'}
                </p>
              </div>

              {/* 進捗バー */}
              {jobStatus.progress !== undefined && (
                <div className="mb-6">
                  <div className="bg-gray-200 rounded-full h-4 overflow-hidden">
                    <div 
                      className="bg-blue-600 h-4 rounded-full transition-all duration-500"
                      style={{ width: `${jobStatus.progress}%` }}
                    ></div>
                  </div>
                  <p className="text-sm text-gray-600 mt-2">
                    {jobStatus.completedChunks || 0} / {jobStatus.totalChunks || 0} チャンク完了
                  </p>
                </div>
              )}

              {/* 処理情報 */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-left">
                <h3 className="text-sm font-medium text-gray-700 mb-2">処理情報</h3>
                <div className="space-y-1 text-sm text-gray-600">
                  <p>• ステータス: {jobStatus.status}</p>
                  {jobStatus.totalChunks && (
                    <p>• 総チャンク数: {jobStatus.totalChunks}個</p>
                  )}
                  {jobStatus.lastUpdate && (
                    <p>• 最終更新: {new Date(jobStatus.lastUpdate).toLocaleString('ja-JP')}</p>
                  )}
                </div>
              </div>

              <div className="mt-8 text-sm text-gray-500">
                <p>このページは自動的に更新されます。</p>
                <p>処理が完了するまで、このページを閉じないでください。</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { result, audioMetadata } = jobStatus;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-lg p-8">
          {/* ヘッダー */}
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">文字起こし結果</h1>
              <p className="text-gray-600 mt-2">ジョブID: {jobId}</p>
            </div>
            <button
              onClick={() => router.push('/audio-transcribe')}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
            >
              新しい文字起こし
            </button>
          </div>

          {/* 音声ファイル情報 */}
          {audioMetadata && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
              <h2 className="text-lg font-medium text-blue-800 mb-4">音声ファイル情報</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="font-medium text-blue-700">再生時間:</span>
                  <p className="text-blue-600">{Math.floor(audioMetadata.duration / 60)}分{Math.floor(audioMetadata.duration % 60)}秒</p>
                </div>
                <div>
                  <span className="font-medium text-blue-700">サンプルレート:</span>
                  <p className="text-blue-600">{audioMetadata.sampleRate} Hz</p>
                </div>
                <div>
                  <span className="font-medium text-blue-700">チャンネル数:</span>
                  <p className="text-blue-600">{audioMetadata.channels}ch</p>
                </div>
                <div>
                  <span className="font-medium text-blue-700">ファイルサイズ:</span>
                  <p className="text-blue-600">{(audioMetadata.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>
            </div>
          )}

          {/* 処理結果統計 */}
          {result && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-8">
              <h2 className="text-lg font-medium text-green-800 mb-4">処理結果</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="font-medium text-green-700">信頼度:</span>
                  <p className="text-green-600">{(result.averageConfidence * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <span className="font-medium text-green-700">処理チャンク数:</span>
                  <p className="text-green-600">{result.totalChunks}個</p>
                </div>
                <div>
                  <span className="font-medium text-green-700">失敗チャンク数:</span>
                  <p className="text-green-600">{result.failedChunks}個</p>
                </div>
                <div>
                  <span className="font-medium text-green-700">成功率:</span>
                  <p className="text-green-600">{(result.successRate * 100).toFixed(1)}%</p>
                </div>
              </div>
            </div>
          )}

          {/* 文字起こしテキスト */}
          {result && (
              <div className="space-y-6">
                {/* 話者名マッピング */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-yellow-800 mb-2">話者名マッピング（任意）</h3>
                  <div className="flex flex-wrap gap-3">
                    {Object.keys(speakerMap).length === 0 ? (
                      <p className="text-yellow-700 text-sm">話者タグが検出されるとここに表示されます。</p>
                    ) : (
                      Object.entries(speakerMap).map(([tag, name]) => (
                        <div key={tag} className="flex items-center gap-2">
                          <span className="px-2 py-1 text-xs bg-yellow-200 text-yellow-900 rounded">{tag}</span>
                          <input
                            className="px-2 py-1 border rounded text-sm"
                            placeholder="例: 上村さん"
                            value={name}
                            onChange={(e) => setSpeakerMap(prev => ({ ...prev, [tag]: e.target.value }))}
                          />
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* 低信頼語ハイライト設定 */}
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-purple-800 mb-2">低信頼語のハイライト</h3>
                  <div className="flex items-center gap-3 text-sm text-purple-700">
                    <span>しきい値:</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={confidenceThreshold}
                      onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
                    />
                    <span>{Math.round(confidenceThreshold * 100)}%</span>
                  </div>
                </div>
              <div className="flex justify-between items-center flex-wrap gap-4">
                <h2 className="text-xl font-medium text-gray-900">
                  文字起こしテキスト
                  {result.enhanced && (
                    <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                      ✨ 整形済み
                    </span>
                  )}
                </h2>
                <div className="flex gap-2 flex-wrap">
                  {!isEditing && (
                    <>
                      <button
                        onClick={() => setIsEditing(true)}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm"
                      >
                        ✏️ 編集
                      </button>
                      <button
                        onClick={() => copyToClipboard(result.fullText)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                      >
                        📋 コピー
                      </button>
                      <div className="relative inline-block">
                        <button
                          onClick={downloadText}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                          title="編集後テキストをTXTで保存"
                        >
                          📄 TXT
                        </button>
                      </div>
                      <button
                        onClick={downloadWord}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
                        title="編集後テキストをWordで保存（要約なし）"
                      >
                        📝 WORD
                      </button>
                      <button
                        onClick={handleSuggestHeadings}
                        className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm"
                      >
                        章見出しを提案
                      </button>
                      {headingCandidates.length > 0 && (
                        <button
                          onClick={handleApplyHeadings}
                          className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 text-sm"
                        >
                          章見出しを挿入
                        </button>
                      )}
                    </>
                  )}
                  {isEditing && (
                    <>
                      <button
                        onClick={handleSaveEdit}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                      >
                        💾 保存
                      </button>
                      <button
                        onClick={handlePersistFinal}
                        className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm"
                      >
                        ☁️ クラウドへ確定保存
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm"
                      >
                        ❌ キャンセル
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* 元のテキストと整形後の比較 */}
              {result.rawText && result.enhanced && !isEditing && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowRawText(!showRawText)}
                    className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
                  >
                    {showRawText ? '整形後を表示' : '元のテキストを表示'}
                  </button>
                </div>
              )}

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                {isEditing ? (
                  <div className="space-y-4">
                    <div className="text-sm text-gray-600 mb-2">
                      テキストを自由に編集できます。編集後は「保存」ボタンをクリックしてください。
                    </div>
                    <div className="flex flex-wrap items-end gap-2 bg-yellow-50 border border-yellow-200 p-3 rounded">
                      <div className="text-sm text-yellow-800 font-medium mr-2">置換（辞書へ学習）</div>
                      <input className="border rounded px-2 py-1 text-sm" placeholder="誤: 植村" value={replaceFrom} onChange={e=>setReplaceFrom(e.target.value)} />
                      <span className="text-gray-500">→</span>
                      <input className="border rounded px-2 py-1 text-sm" placeholder="正: 上村" value={replaceTo} onChange={e=>setReplaceTo(e.target.value)} />
                      <button onClick={handleReplaceAndLearn} className="px-3 py-1 bg-yellow-600 text-white rounded text-sm">実行</button>
                    </div>
                    <textarea
                      value={editedText}
                      onChange={(e) => setEditedText(e.target.value)}
                      className="w-full h-96 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm leading-relaxed font-mono whitespace-pre-wrap"
                      style={{ resize: 'vertical' }}
                    />
                    <div className="text-sm text-gray-600">
                      文字数: {editedText.length.toLocaleString()}文字
                    </div>
                  </div>
                ) : (
                  <div className="max-h-[600px] overflow-y-auto">
                    <div className="whitespace-pre-wrap leading-relaxed text-sm">
                      {renderTranscriptView()}
                    </div>
                  </div>
                )}
              </div>

              {/* 見出し候補の一覧 */}
              {headingCandidates.length > 0 && !isEditing && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-orange-800 mb-2">見出し候補（本文は変更しません）</h3>
                  <ol className="list-decimal pl-6 text-sm text-orange-900 space-y-1">
                    {headingCandidates.map((h, i) => (
                      <li key={i}>{h.title}</li>
                    ))}
                  </ol>
                </div>
              )}

              {/* 文字数統計 */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-gray-700">総文字数:</span>
                    <p className="text-gray-600">{result.fullText.length.toLocaleString()}文字</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">行数:</span>
                    <p className="text-gray-600">{result.fullText.split('\n').length}行</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">単語数（概算）:</span>
                    <p className="text-gray-600">{result.fullText.split(/\s+/).length}語</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* エラー表示 */}
          {jobStatus.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 mt-8">
              <h2 className="text-lg font-medium text-red-800 mb-2">エラー情報</h2>
              <p className="text-red-600">{jobStatus.error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

