import { buildSpeechContexts } from '../../lib/hints.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const lectureId = req.query.lectureId || null;
    const contexts = await buildSpeechContexts({ lectureId });
    res.status(200).json({ ok: true, contexts, count: contexts.length });
  } catch (error) {
    console.error('hints error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
}


