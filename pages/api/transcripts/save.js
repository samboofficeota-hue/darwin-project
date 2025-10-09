import { Storage } from '@google-cloud/storage';
import { dbCreate } from '../../../lib/db.js';
import { gcsLecturePrefix } from '../../../lib/metadata.js';

const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  credentials: process.env.GOOGLE_PRIVATE_KEY ? {
    type: 'service_account',
    project_id: process.env.GOOGLE_CLOUD_PROJECT_ID,
    private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
    private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    client_id: process.env.GOOGLE_CLIENT_ID,
    universe_domain: 'googleapis.com'
  } : undefined,
  fallback: true
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { lectureId, rawText, finalText, version = 1, stats = {}, sttConfig = {} } = req.body || {};
    if (!lectureId || !finalText) return res.status(400).json({ ok: false, error: 'lectureId and finalText are required' });

    const { bucket, transcriptsDir } = gcsLecturePrefix(lectureId);
    const b = storage.bucket(bucket);

    // バケット存在確認（わかりやすいエラーを返す）
    const [bucketExists] = await b.exists();
    if (!bucketExists) {
      return res.status(400).json({
        ok: false,
        error: `GCSバケット ${bucket} が存在しません。GCS_BUCKET_NAME を正しいバケット名に設定するか、バケットを作成してください。`
      });
    }

    const now = new Date().toISOString();
    const rawPath = rawText ? `${transcriptsDir}raw/v${version}.txt` : null;
    const finalPath = `${transcriptsDir}final/v${version}.txt`;

    if (rawPath) await b.file(rawPath).save(rawText, { contentType: 'text/plain; charset=utf-8' });
    await b.file(finalPath).save(finalText, { contentType: 'text/plain; charset=utf-8' });

    const doc = await dbCreate('transcripts', null, {
      lectureId,
      version,
      status: 'finalized',
      files: { rawUri: rawPath ? `gs://${bucket}/${rawPath}` : '', finalUri: `gs://${bucket}/${finalPath}` },
      stats,
      sttConfig,
      createdAt: now
    });

    res.status(200).json({ ok: true, id: doc.id, files: { rawPath, finalPath, bucket } });
  } catch (error) {
    console.error('transcripts/save error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
}


