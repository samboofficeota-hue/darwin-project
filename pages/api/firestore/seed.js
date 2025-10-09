import { seedSampleData } from '../../../lib/firestore.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const ids = await seedSampleData();
    res.status(200).json({ ok: true, ids });
  } catch (error) {
    console.error('Firestore seed failed:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
}


