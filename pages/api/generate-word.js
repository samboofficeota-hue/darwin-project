/**
 * WORD形式(.docx)生成API
 * テキストをMicrosoft Word形式でダウンロード
 */

import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';

export default async function handler(req, res) {
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text, jobId, metadata } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'テキストが必要です' });
    }

    console.log('Generating Word document for job:', jobId);

    // Wordドキュメントを作成
    const doc = await createWordDocument(text, metadata);

    // ドキュメントをバイナリに変換
    const buffer = await Packer.toBuffer(doc);

    // レスポンスヘッダーを設定
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="transcription_${jobId || 'export'}.docx"`);
    res.setHeader('Content-Length', buffer.length);

    // バイナリデータを送信
    res.status(200).send(buffer);

  } catch (error) {
    console.error('Error generating Word document:', error);
    res.status(500).json({
      error: 'WORD形式への変換に失敗しました',
      details: error.message
    });
  }
}

/**
 * Wordドキュメントを作成
 * @param {string} text - テキスト内容
 * @param {Object} metadata - メタデータ
 * @returns {Document} Wordドキュメント
 */
async function createWordDocument(text, metadata = {}) {
  const paragraphs = [];

  // タイトル
  paragraphs.push(
    new Paragraph({
      text: '文字起こし結果',
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: {
        after: 400
      }
    })
  );

  // メタデータ情報
  if (metadata) {
    const metadataLines = [];
    
    if (metadata.duration) {
      const minutes = Math.floor(metadata.duration / 60);
      const seconds = Math.floor(metadata.duration % 60);
      metadataLines.push(`再生時間: ${minutes}分${seconds}秒`);
    }
    
    if (metadata.confidence !== undefined) {
      metadataLines.push(`信頼度: ${(metadata.confidence * 100).toFixed(1)}%`);
    }
    
    if (metadata.totalChunks !== undefined) {
      metadataLines.push(`処理チャンク数: ${metadata.totalChunks}個`);
    }
    
    if (metadataLines.length > 0) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: metadataLines.join(' | '),
              italics: true,
              size: 20,
              color: '666666'
            })
          ],
          alignment: AlignmentType.CENTER,
          spacing: {
            after: 400
          }
        })
      );
    }
  }

  // 作成日時
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `作成日時: ${new Date().toLocaleString('ja-JP')}`,
          italics: true,
          size: 18,
          color: '999999'
        })
      ],
      alignment: AlignmentType.CENTER,
      spacing: {
        after: 600
      }
    })
  );

  // 区切り線
  paragraphs.push(
    new Paragraph({
      text: '───────────────────────────────',
      alignment: AlignmentType.CENTER,
      spacing: {
        after: 400
      }
    })
  );

  // テキスト内容を段落ごとに分割
  const textParagraphs = text.split(/\n\n+/);
  
  textParagraphs.forEach((para, index) => {
    const lines = para.split('\n');
    
    lines.forEach(line => {
      if (line.trim()) {
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: line.trim(),
                size: 24,
                font: 'MS Gothic'
              })
            ],
            spacing: {
              after: 200,
              line: 360
            },
            indent: {
              firstLine: 400
            }
          })
        );
      }
    });
    
    // 段落間にスペースを追加
    if (index < textParagraphs.length - 1) {
      paragraphs.push(
        new Paragraph({
          text: '',
          spacing: {
            after: 300
          }
        })
      );
    }
  });

  // ドキュメントを作成
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,    // 1インチ = 1440 twips
              right: 1440,
              bottom: 1440,
              left: 1440
            }
          }
        },
        children: paragraphs
      }
    ]
  });

  return doc;
}

