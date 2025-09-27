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
                📚 RAGシステム
              </h2>
              <p className="text-gray-600">
                講演録、文献、論文をデータベースで管理し、高度な検索・分析機能を提供
              </p>
            </div>
            
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">
                🎤 音声文字起こし
              </h2>
              <p className="text-gray-600">
                2時間の講演音声を4段階でテキスト化し、原文に近い状態で完全記録
              </p>
            </div>
            
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">
                ✍️ コンテンツ生成
              </h2>
              <p className="text-gray-600">
                RAGの情報を基に、講義録や政策提言書を自動生成
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

                 {/* アクションボタン */}
                 <div className="mt-16 text-center">
                   <div className="space-x-4">
                     <a
                       href="/vimeo-transcribe"
                       className="inline-block bg-blue-600 text-white py-3 px-8 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                     >
                       🎬 Vimeo動画を文字起こし
                     </a>
                     <a
                       href="/transcribe"
                       className="inline-block bg-green-600 text-white py-3 px-8 rounded-lg font-semibold hover:bg-green-700 transition-colors"
                     >
                       🎤 音声ファイルを文字起こし
                     </a>
                     <a
                       href="/search"
                       className="inline-block bg-purple-600 text-white py-3 px-8 rounded-lg font-semibold hover:bg-purple-700 transition-colors"
                     >
                       文献を検索
                     </a>
                   </div>
                 </div>
        </div>
      </div>
    </main>
  );
}
