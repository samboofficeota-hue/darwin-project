import { suggestSectionHeadings, insertHeadings } from '../../../lib/text-processor.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { text, style = 'bracket', maxHeadings = 10, apply = false } = req.body || {};
    const { headings, paragraphs } = suggestSectionHeadings(text || '', { maxHeadings, style });
    if (apply) {
      const applied = insertHeadings(text || '', headings, { style });
      return res.status(200).json({ ok: true, headings, text: applied, paragraphs: paragraphs.length });
    }
    res.status(200).json({ ok: true, headings, paragraphs: paragraphs.length });
  } catch (error) {
    console.error('headings/suggest error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
}


