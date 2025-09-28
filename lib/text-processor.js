/**
 * 講義録テキスト処理システム（簡素化版）
 * 基本的なテキスト処理機能のみを提供
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
 * 講義情報から動的Phrase Hintsを生成（簡素化版）
 * @param {Object} lectureInfo - 講義情報
 * @returns {Array} Phrase Hintsの配列
 */
function generateDynamicPhraseHints(lectureInfo) {
  // 基本的なPhrase Hintsのみを返す
  return getDefaultPhraseHints();
}

/**
 * テキストからPhrase Hintsを抽出（簡素化版）
 * @param {string} text - テキスト
 * @returns {Array} 抽出されたPhrase Hints
 */
function extractPhraseHints(text) {
  // 簡素化版では空配列を返す
  return [];
}

/**
 * デフォルトのPhrase Hintsを取得（簡素化版）
 * @returns {Array} デフォルトのPhrase Hints
 */
function getDefaultPhraseHints() {
  return [
    '講義', '講演', 'セミナー', '発表', 'プレゼンテーション',
    '研究', '分析', '調査', 'データ', '結果', '結論',
    '経済', '社会', '政策', '制度', 'システム',
    '技術', 'テクノロジー', 'デジタル', 'AI', '人工知能',
    '今日', '現在', '今後', '将来', '日本', '世界'
  ];
}

/**
 * 講義の分野を検出（簡素化版）
 * @param {string} text - サンプルテキスト
 * @returns {Array} 検出された分野の配列
 */
function detectLectureDomain(text) {
  // 簡素化版では常に一般分野を返す
  return ['general'];
}

/**
 * 分野に応じたPhrase Hintsを生成（簡素化版）
 * @param {Array} domains - 検出された分野
 * @returns {Array} Phrase Hintsの配列
 */
function generatePhraseHints(domains) {
  // 簡素化版ではデフォルトのPhrase Hintsを返す
  return getDefaultPhraseHints();
}

/**
 * 特定分野のPhrase Hintsを取得（簡素化版）
 * @param {string} domain - 分野
 * @returns {Array} その分野のPhrase Hints
 */
function getDomainSpecificHints(domain) {
  // 簡素化版ではデフォルトのPhrase Hintsを返す
  return getDefaultPhraseHints();
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