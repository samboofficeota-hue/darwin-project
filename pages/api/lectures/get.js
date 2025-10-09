import { dbGet } from '../../../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const id = req.query.id;
    if (!id) return res.status(400).json({ ok: false, error: 'id is required' });
    const doc = await dbGet('lectures', id);
    if (!doc) return res.status(404).json({ ok: false, error: 'not found' });
    res.status(200).json({ ok: true, item: doc });
  } catch (error) {
    console.error('lectures/get error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
}


