'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface LectureInfo {
  theme: string;
  speaker: {
    name: string;
    title: string;
    bio: string;
  };
  description: string;
}

export default function LectureInfoPage() {
  const [lectureInfo, setLectureInfo] = useState<LectureInfo>({
    theme: '',
    speaker: {
      name: '',
      title: '',
      bio: ''
    },
    description: ''
  });
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const validateForm = (): boolean => {
    const newErrors: {[key: string]: string} = {};

    if (!lectureInfo.theme.trim()) {
      newErrors.theme = '講義テーマ名を入力してください';
    }

    if (!lectureInfo.speaker.name.trim()) {
      newErrors.speakerName = '講演者名を入力してください';
    }

    if (!lectureInfo.speaker.title.trim()) {
      newErrors.speakerTitle = '肩書きを入力してください';
    }

    if (!lectureInfo.speaker.bio.trim()) {
      newErrors.speakerBio = '略歴を入力してください';
    }

    if (!lectureInfo.description.trim()) {
      newErrors.description = '講演内容の紹介文を入力してください';
    } else if (lectureInfo.description.length < 50) {
      newErrors.description = '紹介文は50文字以上で入力してください';
    } else if (lectureInfo.description.length > 200) {
      newErrors.description = '紹介文は200文字以内で入力してください';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Firestore/Datastoreに講演メタを作成
      const res = await fetch('/api/lectures/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: lectureInfo.theme,
          date: new Date().toISOString().slice(0,10),
          speakers: [{ name: lectureInfo.speaker.name, title: lectureInfo.speaker.title, bio: lectureInfo.speaker.bio }],
          slideUris: [],
          status: 'draft'
        })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'failed');

      // 作成した lectureId をセッションへ保持
      sessionStorage.setItem('lectureId', json.id);
      sessionStorage.setItem('lectureInfo', JSON.stringify(lectureInfo));

      // 次のステップへ
      router.push('/upload');
    } catch (error) {
      console.error('Error saving lecture info:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setLectureInfo(prev => ({
      ...prev,
      [field]: value
    }));
    
    // エラーをクリア
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  const handleSpeakerChange = (field: string, value: string) => {
    setLectureInfo(prev => ({
      ...prev,
      speaker: {
        ...prev.speaker,
        [field]: value
      }
    }));
    
    // エラーをクリア
    if (errors[`speaker${field.charAt(0).toUpperCase() + field.slice(1)}`]) {
      setErrors(prev => ({
        ...prev,
        [`speaker${field.charAt(0).toUpperCase() + field.slice(1)}`]: ''
      }));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">
            講義情報の入力
          </h1>
          <p className="text-center text-gray-600 mb-8">
            より正確な文字起こしのために、講義の詳細情報を入力してください。<br />
            これらの情報は、専門用語の認識精度向上に活用されます。
          </p>

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* 講義テーマ */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                講義テーマ名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={lectureInfo.theme}
                onChange={(e) => handleInputChange('theme', e.target.value)}
                placeholder="例: 公益資本主義による経済社会システムの変革"
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.theme ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.theme && (
                <p className="text-red-500 text-sm mt-1">{errors.theme}</p>
              )}
            </div>

            {/* 講演者情報 */}
            <div className="bg-gray-50 p-6 rounded-lg">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">講演者情報</h3>
              
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    講演者名 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={lectureInfo.speaker.name}
                    onChange={(e) => handleSpeakerChange('name', e.target.value)}
                    placeholder="例: 山田太郎"
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.speakerName ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {errors.speakerName && (
                    <p className="text-red-500 text-sm mt-1">{errors.speakerName}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    肩書き <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={lectureInfo.speaker.title}
                    onChange={(e) => handleSpeakerChange('title', e.target.value)}
                    placeholder="例: 東京大学教授、経済学部長"
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.speakerTitle ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {errors.speakerTitle && (
                    <p className="text-red-500 text-sm mt-1">{errors.speakerTitle}</p>
                  )}
                </div>
              </div>

              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  略歴 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={lectureInfo.speaker.bio}
                  onChange={(e) => handleSpeakerChange('bio', e.target.value)}
                  placeholder="例: 1985年東京大学経済学部卒業。1990年同大学院博士課程修了。専門は公益資本主義論、経済システム論。著書に「公益資本主義の理論と実践」など。"
                  rows={4}
                  className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    errors.speakerBio ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {errors.speakerBio && (
                  <p className="text-red-500 text-sm mt-1">{errors.speakerBio}</p>
                )}
              </div>
            </div>

            {/* 講演内容の紹介文 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                講演内容の紹介文 <span className="text-red-500">*</span>
                <span className="text-gray-500 text-sm ml-2">(50-200文字)</span>
              </label>
              <textarea
                value={lectureInfo.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="例: 公益資本主義の理念に基づき、現代の経済社会システムをどのように変革していくべきかについて、具体的な政策提言と実践例を交えて解説します。特に、効率と公正の両立、持続可能な成長の実現方法について詳しく説明いたします。"
                rows={4}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.description ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              <div className="flex justify-between items-center mt-2">
                {errors.description ? (
                  <p className="text-red-500 text-sm">{errors.description}</p>
                ) : (
                  <p className="text-gray-500 text-sm">
                    文字数: {lectureInfo.description.length}/200
                  </p>
                )}
              </div>
            </div>

            {/* 情報の活用方法の説明 */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-blue-800 mb-3">
                📚 入力情報の活用方法
              </h3>
              <ul className="text-blue-700 space-y-2 text-sm">
                <li>• <strong>講義テーマ</strong>: 専門用語辞書の自動生成に使用</li>
                <li>• <strong>講演者情報</strong>: 固有名詞の正確な認識に活用</li>
                <li>• <strong>紹介文</strong>: 文脈に基づく高度な修正に使用</li>
                <li>• <strong>全体</strong>: Speech-to-Text APIの認識精度向上</li>
              </ul>
            </div>

            {/* 送信ボタン */}
            <div className="flex justify-center space-x-4">
              <button
                type="button"
                onClick={() => router.push('/')}
                className="bg-gray-300 text-gray-800 py-3 px-8 rounded-lg font-semibold hover:bg-gray-400 transition-colors"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="bg-blue-600 text-white py-3 px-8 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? '処理中...' : '次へ進む'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
