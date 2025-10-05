import { Metadata } from 'next';

export const metadata: Metadata = {
  title: '智の泉 - 公益資本主義の知識ベース',
  description: '公益資本主義で経済社会システムをアップデートしていくための「智の泉」',
};

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">
            智の泉
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            公益資本主義で経済社会システムをアップデートしていくための知識ベースシステム
          </p>
          
          <div className="grid md:grid-cols-3 gap-8 mt-16">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">
                📚 講義録データベース
              </h2>
              <p className="text-gray-600">
                講演録、文献、論文をデータベースで管理し、高度な検索・分析機能を提供
              </p>
            </div>
            
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">
                🎬 Vimeo動画文字起こし
              </h2>
              <p className="text-gray-600">
                Vimeoの動画URLを貼り付けるだけで、長時間の講演を自動で文字起こし
              </p>
            </div>
            
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">
                🎵 音声ファイル文字起こし
              </h2>
              <p className="text-gray-600">
                MP3形式の音声ファイルをアップロードして、チャンク分割による効率的な文字起こし
              </p>
            </div>
            
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">
                📄 HTML講義録生成
              </h2>
              <p className="text-gray-600">
                文字起こし結果を美しいHTML形式で講義録として出力・保存
              </p>
            </div>
          </div>
          
          <div className="mt-16">
            <div className="bg-white rounded-lg shadow-lg p-8 max-w-4xl mx-auto">
              <h2 className="text-3xl font-semibold text-gray-800 mb-6">
                システム構成
              </h2>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-700 mb-3">フロントエンド</h3>
                  <ul className="text-gray-600 space-y-2">
                    <li>• Vercel (Next.js)</li>
                    <li>• TypeScript</li>
                    <li>• Tailwind CSS</li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-700 mb-3">AI処理・ストレージ</h3>
                  <ul className="text-gray-600 space-y-2">
                    <li>• データベース</li>
                    <li>• 256-bit AES暗号化</li>
                    <li>• プライベート環境</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

                 {/* メインアクション */}
                 <div className="mt-16 text-center">
                   <div className="bg-white rounded-lg shadow-lg p-8 max-w-2xl mx-auto">
                     <h2 className="text-2xl font-semibold text-gray-800 mb-6">
                       講義録を作成する
                     </h2>
                     <p className="text-gray-600 mb-6">
                       講義情報を入力してからVimeo動画を文字起こし、美しいHTML講義録を自動生成
                     </p>
                     <div className="space-y-4">
                       <a
                         href="/lecture-transcribe"
                         className="inline-block bg-blue-600 text-white py-4 px-12 rounded-lg font-semibold text-lg hover:bg-blue-700 transition-colors shadow-lg"
                       >
                         🚀 統合インターフェースで開始
                       </a>
                       <div className="text-sm text-gray-500">
                         または <a href="/lecture-info" className="text-blue-600 hover:text-blue-800 underline">従来の手順で進める</a>
                       </div>
                     </div>
                   </div>
                 </div>

                 {/* サブアクション */}
                 <div className="mt-8 text-center">
                   <div className="space-x-4">
                     <a
                       href="/audio-transcribe"
                       className="inline-block bg-orange-600 text-white py-2 px-6 rounded-lg font-semibold hover:bg-orange-700 transition-colors"
                     >
                       🎵 音声文字起こし
                     </a>
                     <a
                       href="/chunked-transcribe"
                       className="inline-block bg-red-600 text-white py-2 px-6 rounded-lg font-semibold hover:bg-red-700 transition-colors"
                     >
                       📁 チャンク分割文字起こし
                     </a>
                     <a
                       href="/vimeo-transcribe"
                       className="inline-block bg-green-600 text-white py-2 px-6 rounded-lg font-semibold hover:bg-green-700 transition-colors"
                     >
                       📊 進捗確認
                     </a>
                     <a
                       href="/test-vimeo"
                       className="inline-block bg-yellow-600 text-white py-2 px-6 rounded-lg font-semibold hover:bg-yellow-700 transition-colors"
                     >
                       🧪 接続テスト
                     </a>
                     <a
                       href="/search"
                       className="inline-block bg-purple-600 text-white py-2 px-6 rounded-lg font-semibold hover:bg-purple-700 transition-colors"
                     >
                       文献検索
                     </a>
                   </div>
                 </div>
        </div>
      </div>
    </main>
  );
}
