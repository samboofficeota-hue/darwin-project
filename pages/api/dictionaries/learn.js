import { dbCreate } from '../../../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { lectureId = null, pairs = [], scope = 'global', boost = 18 } = req.body || {};
    if (!Array.isArray(pairs) || pairs.length === 0) {
      return res.status(400).json({ ok: false, error: 'pairs is required' });
    }

    // バリデーション
    const normalized = pairs
      .filter(p => p && typeof p.from === 'string' && typeof p.to === 'string')
      .map(p => ({ from: p.from.trim(), to: p.to.trim() }))
      .filter(p => p.from.length > 0 && p.to.length > 0 && p.from !== p.to);

    if (normalized.length === 0) {
      return res.status(400).json({ ok: false, error: 'valid pairs not found' });
    }

    // 1ドキュメント＝複数フレーズとして保存
    const phrases = normalized.map(p => ({ text: p.to, variants: [p.from], boost }));
    const payload = { scope: lectureId ? 'lecture' : scope, lectureId, phrases, updatedAt: new Date().toISOString() };
    const created = await dbCreate('dictionaries', null, payload);
    res.status(200).json({ ok: true, id: created.id });
  } catch (error) {
    console.error('dictionaries/learn error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
}


