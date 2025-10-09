import { Metadata } from 'next';

export const metadata: Metadata = {
  title: '公益資本主義 実装部門専用 - 講演録文字起こし',
  description: '公益資本主義実装部門の講演録文字起こしシステム',
};

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            公益資本主義 実装部門専用
          </h1>
          <h2 className="text-3xl font-semibold text-gray-700 mb-12">
            講演録文字起こし
          </h2>
          
          {/* 文字起こし用の2つのカード */}
          <div className="grid md:grid-cols-2 gap-8 mt-12 max-w-4xl mx-auto">
            <div className="bg-white rounded-lg shadow-lg p-8 hover:shadow-xl transition-shadow">
              <div className="text-5xl mb-4">🎵</div>
              <h3 className="text-2xl font-semibold text-gray-800 mb-4">
                音声ファイルをアップロード
              </h3>
              <p className="text-gray-600 mb-6">
                MP3形式の音声ファイルをアップロードして、チャンク分割による効率的な文字起こしを行います
              </p>
              <a
                href="/chunked-transcribe"
                className="inline-block bg-blue-600 text-white py-3 px-8 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
              >
                音声アップロード
              </a>
            </div>
            
            <div className="bg-white rounded-lg shadow-lg p-8 hover:shadow-xl transition-shadow">
              <div className="text-5xl mb-4">🎬</div>
              <h3 className="text-2xl font-semibold text-gray-800 mb-4">
                Vimeoから読み取る
              </h3>
              <p className="text-gray-600 mb-6">
                VimeoのURLを入力するだけで、動画から音声を抽出し、自動で文字起こしを行います
              </p>
              <a
                href="/lecture-transcribe"
                className="inline-block bg-green-600 text-white py-3 px-8 rounded-lg font-semibold hover:bg-green-700 transition-colors"
              >
                Vimeo文字起こし
              </a>
            </div>
          </div>
          
          {/* 注意事項 */}
          <div className="mt-16 max-w-4xl mx-auto">
            <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-8 text-left">
              <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
                <span className="text-2xl mr-2">⚠️</span>
                システム使用上の注意事項
              </h3>
              <ul className="space-y-3 text-gray-700">
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>音声ファイルは<strong>MP3形式</strong>でアップロードしてください</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>大容量ファイルの場合、処理に時間がかかることがあります（自動的にチャンク分割されます）</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>Vimeo動画は<strong>ダウンロード可能な設定</strong>になっている必要があります</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>文字起こし処理中はブラウザを閉じないでください</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>処理が完了すると、結果がテキスト形式で表示されます</span>
                </li>
              </ul>
            </div>
          </div>

          {/* 講演録データベースへのボタン */}
          <div className="mt-12">
            <a
              href="/lecture-database"
              className="inline-block bg-purple-600 text-white py-4 px-12 rounded-lg font-semibold text-lg hover:bg-purple-700 transition-colors shadow-lg"
            >
              📚 講演録データベースへ
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
