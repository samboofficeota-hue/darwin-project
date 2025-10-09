import { dbUpdate, dbCreate } from '../../../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { id, scope = 'global', lectureId = null, phrases = [] } = req.body || {};
    const payload = { scope, lectureId, phrases, updatedAt: new Date().toISOString() };
    if (id) {
      await dbUpdate('dictionaries', id, payload);
      res.status(200).json({ ok: true, id });
    } else {
      const created = await dbCreate('dictionaries', null, payload);
      res.status(200).json({ ok: true, id: created.id });
    }
  } catch (error) {
    console.error('dictionaries/upsert error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
}


