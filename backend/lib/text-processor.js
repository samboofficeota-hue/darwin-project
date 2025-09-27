/**
 * 講義録テキスト処理システム（統合版）
 * 文字起こし結果の後処理、構造化、Phrase Hints生成を統合
 */

/**
 * 講義録データを処理して構造化された形式に変換
 * @param {Object} rawData - 生の文字起こしデータ
 * @returns {Object} 処理済みの講義録データ
 */
function processLectureRecord(rawData) {
  try {
    const { chunks, duration } = rawData;
    
    if (!chunks || !Array.isArray(chunks)) {
      throw new Error('無効なチャンクデータです');
    }

    // チャンクを時間順にソート
    const sortedChunks = chunks
      .filter(chunk => chunk && chunk.text && chunk.text.trim())
      .sort((a, b) => (a.startTime || 0) - (b.startTime || 0));

    // テキストの結合とクリーニング
    const processedChunks = sortedChunks.map((chunk, index) => {
      return {
        ...chunk,
        text: cleanText(chunk.text),
        chunkIndex: index,
        wordCount: countWords(chunk.text),
        confidence: chunk.confidence || 0
      };
    });

    // 統計情報の計算
    const statistics = calculateStatistics(processedChunks, duration);

    // テキストの統合
    const fullText = processedChunks
      .map(chunk => chunk.text)
      .join('\n\n')
      .trim();

    return {
      chunks: processedChunks,
      fullText,
      duration: duration || 0,
      statistics,
      processed: true,
      processedAt: new Date().toISOString()
    };

  } catch (error) {
    console.error('Text processing error:', error);
    throw new Error(`テキスト処理エラー: ${error.message}`);
  }
}

/**
 * 講義情報から動的Phrase Hintsを生成
 * @param {Object} lectureInfo - 講義情報
 * @returns {Array} Phrase Hintsの配列
 */
function generateDynamicPhraseHints(lectureInfo) {
  if (!lectureInfo) {
    return getDefaultPhraseHints();
  }

  const hints = new Set();

  // 講義テーマからキーワードを抽出
  if (lectureInfo.theme) {
    const themeHints = extractPhraseHints(lectureInfo.theme);
    themeHints.forEach(hint => hints.add(hint));
  }

  // 講演者情報からキーワードを抽出
  if (lectureInfo.speaker) {
    if (lectureInfo.speaker.name) {
      const nameHints = extractPhraseHints(lectureInfo.speaker.name);
      nameHints.forEach(hint => hints.add(hint));
    }
    if (lectureInfo.speaker.title) {
      const titleHints = extractPhraseHints(lectureInfo.speaker.title);
      titleHints.forEach(hint => hints.add(hint));
    }
    if (lectureInfo.speaker.bio) {
      const bioHints = extractPhraseHints(lectureInfo.speaker.bio);
      bioHints.forEach(hint => hints.add(hint));
    }
  }

  // 講演内容の紹介文からキーワードを抽出
  if (lectureInfo.description) {
    const descriptionHints = extractPhraseHints(lectureInfo.description);
    descriptionHints.forEach(hint => hints.add(hint));
  }

  // デフォルトのPhrase Hintsを追加
  const defaultHints = getDefaultPhraseHints();
  defaultHints.forEach(hint => hints.add(hint));

  // 配列に変換して最大100個に制限
  return Array.from(hints).slice(0, 100);
}

/**
 * テキストからPhrase Hintsを抽出
 * @param {string} text - テキスト
 * @returns {Array} 抽出されたPhrase Hints
 */
function extractPhraseHints(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const hints = [];

  // 日本語の専門用語を抽出（2文字以上の連続する文字）
  const japaneseTerms = text.match(/[\u4E00-\u9FAF]{2,}/g) || [];
  hints.push(...japaneseTerms);

  // 英語の専門用語を抽出（大文字を含む単語）
  const englishTerms = text.match(/\b[A-Z][a-zA-Z]*\b/g) || [];
  hints.push(...englishTerms);

  // 数字を含む用語を抽出
  const numericTerms = text.match(/[\u4E00-\u9FAF]*\d+[\u4E00-\u9FAF]*/g) || [];
  hints.push(...numericTerms);

  // 括弧内の用語を抽出
  const parentheticalTerms = text.match(/[（(]([^）)]+)[）)]/g) || [];
  parentheticalTerms.forEach(term => {
    const cleanTerm = term.replace(/[（()）]/g, '').trim();
    if (cleanTerm.length >= 2) {
      hints.push(cleanTerm);
    }
  });

  // 重複を削除し、長さでフィルタリング
  return [...new Set(hints)]
    .filter(hint => hint.length >= 2 && hint.length <= 50)
    .map(hint => hint.trim());
}

/**
 * デフォルトのPhrase Hintsを取得
 * @returns {Array} デフォルトのPhrase Hints
 */
function getDefaultPhraseHints() {
  return [
    // 一般的な講義用語
    '講義', '講演', 'セミナー', 'ワークショップ',
    '発表', 'プレゼンテーション', 'ディスカッション',
    '質疑応答', '質問', '回答', '説明',
    
    // 学術用語
    '研究', '分析', '調査', '実験', 'データ',
    '結果', '結論', '仮説', '理論', 'モデル',
    '手法', 'アプローチ', '方法論', 'フレームワーク',
    
    // 経済・社会用語
    '経済', '社会', '政策', '制度', 'システム',
    '課題', '問題', '解決', '改善', '改革',
    '発展', '成長', '変化', '転換', '変革',
    
    // 技術用語
    '技術', 'テクノロジー', 'デジタル', 'AI', '人工知能',
    'データ', '情報', 'システム', 'プラットフォーム',
    'イノベーション', '創造', '革新', '開発',
    
    // 時間・場所の表現
    '今日', '現在', '今後', '将来', '過去',
    '日本', '世界', '国際', 'グローバル', 'ローカル',
    '地域', '地方', '都市', '農村',
    
    // 数値・統計用語
    'パーセント', '割合', '比率', '増加', '減少',
    '上昇', '下降', '改善', '悪化', '変化',
    '比較', '対比', '相関', '因果関係'
  ];
}

/**
 * 講義の分野を検出
 * @param {string} text - サンプルテキスト
 * @returns {Array} 検出された分野の配列
 */
function detectLectureDomain(text) {
  if (!text || typeof text !== 'string') {
    return ['general'];
  }

  const domains = [];
  const lowerText = text.toLowerCase();

  // 経済・金融分野
  if (lowerText.includes('経済') || lowerText.includes('金融') || 
      lowerText.includes('資本') || lowerText.includes('投資') ||
      lowerText.includes('市場') || lowerText.includes('企業')) {
    domains.push('economics');
  }

  // 政治・政策分野
  if (lowerText.includes('政治') || lowerText.includes('政策') ||
      lowerText.includes('政府') || lowerText.includes('行政') ||
      lowerText.includes('国会') || lowerText.includes('法案')) {
    domains.push('politics');
  }

  // 技術・IT分野
  if (lowerText.includes('技術') || lowerText.includes('IT') ||
      lowerText.includes('AI') || lowerText.includes('人工知能') ||
      lowerText.includes('デジタル') || lowerText.includes('システム')) {
    domains.push('technology');
  }

  // 教育分野
  if (lowerText.includes('教育') || lowerText.includes('学校') ||
      lowerText.includes('学習') || lowerText.includes('大学') ||
      lowerText.includes('研究') || lowerText.includes('学術')) {
    domains.push('education');
  }

  // 医療・健康分野
  if (lowerText.includes('医療') || lowerText.includes('健康') ||
      lowerText.includes('病院') || lowerText.includes('治療') ||
      lowerText.includes('医師') || lowerText.includes('患者')) {
    domains.push('healthcare');
  }

  // 環境分野
  if (lowerText.includes('環境') || lowerText.includes('気候') ||
      lowerText.includes('温暖化') || lowerText.includes('CO2') ||
      lowerText.includes('持続可能') || lowerText.includes('再生可能')) {
    domains.push('environment');
  }

  // デフォルトは一般分野
  if (domains.length === 0) {
    domains.push('general');
  }

  return domains;
}

/**
 * 分野に応じたPhrase Hintsを生成
 * @param {Array} domains - 検出された分野
 * @returns {Array} Phrase Hintsの配列
 */
function generatePhraseHints(domains) {
  const allHints = [];

  domains.forEach(domain => {
    const domainHints = getDomainSpecificHints(domain);
    allHints.push(...domainHints);
  });

  // 重複を削除して返す
  return [...new Set(allHints)];
}

/**
 * 特定分野のPhrase Hintsを取得
 * @param {string} domain - 分野
 * @returns {Array} その分野のPhrase Hints
 */
function getDomainSpecificHints(domain) {
  const hints = {
    economics: [
      '公益資本主義', '経済システム', '市場経済', '資本主義',
      'GDP', 'インフレ', 'デフレ', '金利', '為替',
      '株式市場', '債券', '投資', '金融政策',
      '財政政策', '税制', '社会保障', '雇用',
      '企業経営', 'コーポレートガバナンス', 'ESG',
      '持続可能な成長', '経済格差', '貧困対策'
    ],
    politics: [
      '政治制度', '民主主義', '選挙', '議会',
      '内閣', '首相', '大臣', '官僚制',
      '政策立案', '法案', '法律', '憲法',
      '地方自治', '地方分権', '行政改革',
      '外交政策', '国際関係', '安全保障',
      '人権', '自由', '平等', '正義'
    ],
    technology: [
      '人工知能', 'AI', '機械学習', 'ディープラーニング',
      'ビッグデータ', 'クラウドコンピューティング',
      'IoT', 'ブロックチェーン', '暗号通貨',
      'デジタル化', 'DX', 'デジタルトランスフォーメーション',
      'サイバーセキュリティ', 'プライバシー保護',
      'アルゴリズム', '自動化', 'ロボティクス',
      '量子コンピューティング', '5G', '6G'
    ],
    education: [
      '教育制度', '学校教育', '高等教育', '大学',
      '学習指導要領', 'カリキュラム', '教育課程',
      '教員', '教師', '学生', '生徒',
      '学習効果', '教育評価', '学力', '能力',
      '生涯学習', 'リカレント教育', '社会人教育',
      'オンライン教育', 'eラーニング', 'MOOC'
    ],
    healthcare: [
      '医療制度', '健康保険', '国民皆保険',
      '医療費', '診療報酬', '病院', '診療所',
      '医師', '看護師', '医療従事者',
      '患者', '診断', '治療', '手術',
      '薬剤', '医薬品', 'ジェネリック医薬品',
      '予防医学', '健康管理', '介護', '高齢化'
    ],
    environment: [
      '環境問題', '気候変動', '地球温暖化',
      'CO2', '二酸化炭素', '温室効果ガス',
      '再生可能エネルギー', '太陽光発電', '風力発電',
      '持続可能性', 'SDGs', 'エコロジー',
      '生物多様性', '環境保護', '環境政策',
      '循環型社会', 'ゼロエミッション', 'カーボンニュートラル'
    ],
    general: [
      '社会', '文化', '歴史', '伝統',
      '価値観', '倫理', '道徳', '哲学',
      '科学', '研究', '発見', '発明',
      'イノベーション', '創造性', '想像力',
      'コミュニケーション', '対話', '議論',
      '協力', '協調', '連携', 'パートナーシップ'
    ]
  };

  return hints[domain] || hints.general;
}

/**
 * テキストのクリーニング
 * @param {string} text - 生のテキスト
 * @returns {string} クリーニング済みテキスト
 */
function cleanText(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return text
    // 余分な空白を削除
    .replace(/\s+/g, ' ')
    // 改行の正規化
    .replace(/\n\s*\n/g, '\n\n')
    // 先頭・末尾の空白を削除
    .trim()
    // 句読点の正規化
    .replace(/[。、]/g, match => match === '。' ? '。' : '、')
    // 括弧の正規化
    .replace(/[（(]/g, '（')
    .replace(/[）)]/g, '）');
}

/**
 * 単語数のカウント
 * @param {string} text - テキスト
 * @returns {number} 単語数
 */
function countWords(text) {
  if (!text || typeof text !== 'string') {
    return 0;
  }

  // 日本語と英語の単語をカウント
  const japaneseWords = text.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+/g) || [];
  const englishWords = text.match(/\b[a-zA-Z]+\b/g) || [];
  
  return japaneseWords.length + englishWords.length;
}

/**
 * 統計情報の計算
 * @param {Array} chunks - 処理済みチャンク
 * @param {number} duration - 音声時間（秒）
 * @returns {Object} 統計情報
 */
function calculateStatistics(chunks, duration) {
  const totalChunks = chunks.length;
  const totalWords = chunks.reduce((sum, chunk) => sum + chunk.wordCount, 0);
  const totalCharacters = chunks.reduce((sum, chunk) => sum + chunk.text.length, 0);
  
  // 平均信頼度の計算
  const totalConfidence = chunks.reduce((sum, chunk) => sum + (chunk.confidence || 0), 0);
  const averageConfidence = totalChunks > 0 ? totalConfidence / totalChunks : 0;

  // 話速の計算（文字/分）
  const speakingRate = duration > 0 ? (totalCharacters / duration) * 60 : 0;

  // チャンクあたりの平均文字数
  const avgCharsPerChunk = totalChunks > 0 ? totalCharacters / totalChunks : 0;

  // 信頼度の分布
  const confidenceDistribution = {
    high: chunks.filter(chunk => (chunk.confidence || 0) >= 0.8).length,
    medium: chunks.filter(chunk => (chunk.confidence || 0) >= 0.6 && (chunk.confidence || 0) < 0.8).length,
    low: chunks.filter(chunk => (chunk.confidence || 0) < 0.6).length
  };

  return {
    totalChunks,
    totalWords,
    totalCharacters,
    averageConfidence,
    speakingRate: Math.round(speakingRate),
    avgCharsPerChunk: Math.round(avgCharsPerChunk),
    confidenceDistribution,
    duration: duration || 0
  };
}

/**
 * テキストを段落に分割
 * @param {string} text - テキスト
 * @returns {Array} 段落の配列
 */
function splitIntoParagraphs(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  return text
    .split(/\n\s*\n/)
    .map(paragraph => paragraph.trim())
    .filter(paragraph => paragraph.length > 0);
}

/**
 * キーワードの抽出
 * @param {string} text - テキスト
 * @param {number} maxKeywords - 最大キーワード数
 * @returns {Array} キーワードの配列
 */
function extractKeywords(text, maxKeywords = 10) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  // 簡単なキーワード抽出（実際の実装ではより高度な手法を使用）
  const words = text
    .toLowerCase()
    .replace(/[^\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2);

  // 単語の出現頻度をカウント
  const wordCount = {};
  words.forEach(word => {
    wordCount[word] = (wordCount[word] || 0) + 1;
  });

  // 頻度順にソートして上位を返す
  return Object.entries(wordCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, maxKeywords)
    .map(([word, count]) => ({ word, count }));
}

/**
 * 時間スタンプ付きテキストの生成
 * @param {Array} chunks - チャンク配列
 * @returns {string} 時間スタンプ付きテキスト
 */
function generateTimestampedText(chunks) {
  if (!chunks || !Array.isArray(chunks)) {
    return '';
  }

  return chunks
    .map(chunk => {
      const startTime = formatTime(chunk.startTime || 0);
      const endTime = formatTime(chunk.endTime || 0);
      return `[${startTime} - ${endTime}] ${chunk.text}`;
    })
    .join('\n\n');
}

/**
 * 秒数を時間形式に変換
 * @param {number} seconds - 秒数
 * @returns {string} 時間形式（HH:MM:SS）
 */
function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}

module.exports = {
  processLectureRecord,
  generateDynamicPhraseHints,
  extractPhraseHints,
  getDefaultPhraseHints,
  detectLectureDomain,
  generatePhraseHints,
  getDomainSpecificHints,
  cleanText,
  countWords,
  calculateStatistics,
  splitIntoParagraphs,
  extractKeywords,
  generateTimestampedText,
  formatTime
};