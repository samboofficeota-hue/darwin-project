import { pingFirestore } from '../../../lib/firestore.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const data = await pingFirestore();
    res.status(200).json({ ok: true, data });
  } catch (error) {
    console.error('Firestore ping failed:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
}


