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

/**
 * テキストを高度に整形（Phase 3の主要機能）
 * @param {string} text - 生のテキスト
 * @param {Object} options - オプション設定
 * @returns {string} 整形されたテキスト
 */
function enhanceText(text, options = {}) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  const {
    removeFillers = true,        // 言い淀み除去
    fixChunkBoundaries = true,   // チャンク境界修正
    improveReadability = true,   // 読みやすさ向上
    addParagraphs = true          // 段落分け
  } = options;

  let enhancedText = text;

  // 1. 言い淀みや不要な言葉を除去
  if (removeFillers) {
    enhancedText = removeFillerWords(enhancedText);
  }

  // 2. チャンク境界での文章のつながりを修正
  if (fixChunkBoundaries) {
    enhancedText = fixChunkBoundaryIssues(enhancedText);
  }

  // 3. 読みやすさを向上
  if (improveReadability) {
    enhancedText = improveTextReadability(enhancedText);
  }

  // 4. 適切な段落分けを追加
  if (addParagraphs) {
    enhancedText = addIntelligentParagraphs(enhancedText);
  }

  return enhancedText.trim();
}

/**
 * 言い淀みや不要な言葉を除去
 * @param {string} text - テキスト
 * @returns {string} クリーニングされたテキスト
 */
function removeFillerWords(text) {
  // 日本語の一般的なフィラーワード
  const fillerPatterns = [
    // 単独のフィラー
    /\bえー+\b/gi,
    /\bあー+\b/gi,
    /\bうー+\b/gi,
    /\bあの+ー*\b/gi,
    /\bその+ー*\b/gi,
    /\bまあ+\b/gi,
    /\bなんか\b/gi,
    /\bっていうか\b/gi,
    
    // 繰り返し
    /(\b\w+\b)\s+\1\b/gi,
    
    // 余分な間投詞
    /\s+ですね、\s+ですね/gi,
    /\s+まあ、\s+まあ/gi,
  ];

  let cleaned = text;
  fillerPatterns.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '');
  });

  // 余分な空白を整理
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

/**
 * チャンク境界での文章のつながりを修正
 * @param {string} text - テキスト
 * @returns {string} 修正されたテキスト
 */
function fixChunkBoundaryIssues(text) {
  let fixed = text;

  // パターン1: 文の途中で切れた場合（句点なし → あり）
  // 「です\n\nそして」→「です。そして」
  fixed = fixed.replace(/([ですますだった])\s*\n\n\s*([そこここあそれこう次今])/g, '$1。$2');

  // パターン2: 重複した接続詞の除去
  // 「です。\n\nそして、そして」→「です。そして」
  fixed = fixed.replace(/([。、])\s*\n\n\s*(\w+)、\s*\2\b/g, '$1$2');

  // パターン3: 不自然な改行を修正
  // 「という\n\nことで」→「ということで」
  fixed = fixed.replace(/(という|その|この|あの)\s*\n\n\s*(こと|もの|点|部分)/g, '$1$2');

  // パターン4: 接続詞で始まる場合は前の文とつなげる
  // 「です。\n\nそして」→「です。そして」（改行を削除してスペースに）
  fixed = fixed.replace(/([。！？])\s*\n\n\s*(また|さらに|そして|しかし|ただし|一方|例えば)/g, '$1$2');

  return fixed;
}

/**
 * 読みやすさを向上
 * @param {string} text - テキスト
 * @returns {string} 改善されたテキスト
 */
function improveTextReadability(text) {
  let improved = text;

  // 1. 句読点の正規化
  improved = improved
    // 連続した句点を1つに
    .replace(/。+/g, '。')
    // 連続した読点を1つに
    .replace(/、+/g, '、')
    // 読点の後にスペースがない場合は追加しない（日本語では不要）
    // 句点の後は適切にスペースまたは改行
    .replace(/。(?=[^\s\n])/g, '。 ');

  // 2. カタカナの長音記号を統一
  improved = improved.replace(/ー+/g, 'ー');

  // 3. 括弧の前後のスペースを調整
  improved = improved
    .replace(/\s+（/g, '（')
    .replace(/）\s+(?=[。、！？])/g, '）');

  // 4. 数字と単位の間のスペースを調整
  improved = improved.replace(/(\d+)\s+(円|人|個|回|年|月|日|時|分|秒|％|パーセント)/g, '$1$2');

  // 5. 英数字と日本語の間に適切なスペースを入れる
  improved = improved
    .replace(/([a-zA-Z0-9]+)([\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF])/g, '$1 $2')
    .replace(/([\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF])([a-zA-Z0-9]+)/g, '$1 $2');

  return improved;
}

/**
 * 適切な段落分けを追加
 * @param {string} text - テキスト
 * @returns {string} 段落分けされたテキスト
 */
function addIntelligentParagraphs(text) {
  // 既存の段落（\n\n）を保持しつつ、追加の段落分けを行う
  
  // 1. 話題の転換を示すキーワードで段落分け
  const topicTransitions = [
    '次に',
    'それでは',
    'ところで',
    'さて',
    '一方で',
    '他方',
    'また',
    '続いて',
    '最後に',
    'まとめると',
    '結論として',
    '以上',
  ];

  let paragraphed = text;
  
  topicTransitions.forEach(transition => {
    // すでに段落分けされていない場合のみ追加
    const pattern = new RegExp(`([。！？])\\s*${transition}`, 'g');
    paragraphed = paragraphed.replace(pattern, `$1\n\n${transition}`);
  });

  // 2. 長すぎる段落を分割（目安：200文字以上で句点がある場合）
  const paragraphs = paragraphed.split(/\n\n+/);
  const refinedParagraphs = paragraphs.flatMap(para => {
    if (para.length > 300) {
      // 句点で分割して、適度な長さの段落に
      const sentences = para.split(/([。！？])/);
      const newParas = [];
      let current = '';
      
      for (let i = 0; i < sentences.length; i += 2) {
        const sentence = sentences[i] + (sentences[i + 1] || '');
        if (current.length + sentence.length > 200 && current.length > 0) {
          newParas.push(current.trim());
          current = sentence;
        } else {
          current += sentence;
        }
      }
      
      if (current.trim()) {
        newParas.push(current.trim());
      }
      
      return newParas;
    }
    return [para];
  });

  return refinedParagraphs.join('\n\n');
}

/**
 * 章見出し候補を生成（要約禁止: 本文は一切削除しない）
 * - 段落ごとに先頭文から短い見出しを抽出
 * - トピック転換語や段落長で優先度を付ける
 */
function suggestSectionHeadings(text, options = {}) {
  const {
    maxHeadings = 10,
    minParagraphLength = 120, // ある程度長い段落のみ対象
    style = 'bracket' // 'markdown' | 'bracket'
  } = options;

  if (!text || typeof text !== 'string') return { headings: [], paragraphs: [] };

  // 段落を用意（なければ賢い段落分けを適用）
  const paragraphed = text.includes('\n\n') ? text : addIntelligentParagraphs(text);
  const paragraphs = paragraphed.split(/\n\n+/).map(p => p.trim()).filter(Boolean);

  const topicTransitions = [
    '次に','それでは','ところで','さて','一方で','他方','また','続いて','最後に','まとめると','結論として','以上'
  ];

  const candidates = [];
  paragraphs.forEach((para, idx) => {
    const scoreLength = Math.min(para.length / 200, 1); // 長いほどスコア
    const hasTransition = topicTransitions.some(t => para.startsWith(t) || para.includes('。' + t));
    const scoreTransition = hasTransition ? 1 : 0;

    if (para.length < minParagraphLength && !hasTransition) return;

    // 先頭文を抽出して短縮
    const firstSentence = para.split(/。|！|？/)[0] || para.slice(0, 40);
    const title = firstSentence
      .replace(/[\s\u3000]+/g, ' ')
      .replace(/[「」『』【】\[\]()（）]/g, '')
      .slice(0, 28)
      .trim();

    if (!title) return;

    const score = scoreLength * 0.6 + scoreTransition * 0.4;
    candidates.push({ index: idx, title, score, style });
  });

  const headings = candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, maxHeadings)
    .sort((a, b) => a.index - b.index); // 表示順を元に戻す

  return { headings, paragraphs };
}

/**
 * 見出しを本文に挿入（本文は保持し、見出しのみ追加）
 */
function insertHeadings(text, headings, options = {}) {
  if (!text || typeof text !== 'string' || !Array.isArray(headings)) return text;
  const style = options.style || 'bracket';
  const paragraphed = text.includes('\n\n') ? text : addIntelligentParagraphs(text);
  const paragraphs = paragraphed.split(/\n\n+/);

  // 上から順に挿入
  const resultParas = [];
  headings.sort((a, b) => a.index - b.index);
  paragraphs.forEach((para, idx) => {
    const h = headings.find(x => x.index === idx);
    if (h) {
      const headingText = style === 'markdown' ? `## ${h.title}` : `【${h.title}】`;
      resultParas.push(headingText);
    }
    resultParas.push(para);
  });

  return resultParas.join('\n\n');
}

/**
 * チャンク配列から高度に整形されたテキストを生成
 * @param {Array} chunks - チャンク配列
 * @param {Object} options - オプション
 * @returns {string} 整形されたテキスト
 */
function enhanceChunkedText(chunks, options = {}) {
  if (!chunks || !Array.isArray(chunks)) {
    return '';
  }

  // チャンクを結合
  const rawText = chunks
    .map(chunk => chunk.text || '')
    .filter(text => text.trim().length > 0)
    .join('\n\n');

  // 高度な整形を適用
  return enhanceText(rawText, options);
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
  formatTime,
  // Phase 3の新機能
  enhanceText,
  removeFillerWords,
  fixChunkBoundaryIssues,
  improveTextReadability,
  addIntelligentParagraphs,
  enhanceChunkedText
};

// 追加エクスポート
module.exports.suggestSectionHeadings = suggestSectionHeadings;
module.exports.insertHeadings = insertHeadings;