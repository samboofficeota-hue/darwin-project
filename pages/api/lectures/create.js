import { dbCreate } from '../../../lib/db.js';
import { normalizeLecturePayload } from '../../../lib/metadata.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const payload = normalizeLecturePayload(req.body || {});
    const { id } = await dbCreate('lectures', null, payload);
    res.status(200).json({ ok: true, id });
  } catch (error) {
    console.error('lectures/create error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
}


