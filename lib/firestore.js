import { Firestore } from '@google-cloud/firestore';
import { Datastore } from '@google-cloud/datastore';

export function getFirestoreClient() {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;

  // Prefer Application Default Credentials (Cloud Run/ADC). If explicit
  // credentials are provided via env, use them for local/CI.
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (clientEmail && privateKey) {
    return new Firestore({
      projectId,
      credentials: { client_email: clientEmail, private_key: privateKey }
    });
  }

  return new Firestore({ projectId });
}

export async function pingFirestore() {
  try {
    const db = getFirestoreClient();
    const docRef = db.collection('health').doc('firestore');
    const ts = Date.now();
    await docRef.set({ ts }, { merge: true });
    const snap = await docRef.get();
    return snap.exists ? snap.data() : null;
  } catch (e) {
    // If Firestore (native) API is unavailable (Datastore mode), fallback to Datastore
    if (String(e.message || '').includes('Datastore Mode')) {
      const datastore = new Datastore({ projectId: process.env.GOOGLE_CLOUD_PROJECT_ID });
      const key = datastore.key(['Health', 'firestore']);
      const entity = { key, data: { ts: Date.now() } };
      await datastore.upsert(entity);
      const [got] = await datastore.get(key);
      return got || null;
    }
    throw e;
  }
}

export async function seedSampleData() {
  try {
    const db = getFirestoreClient();

    // 1) lectures
    const lectureRef = db.collection('lectures').doc();
    await lectureRef.set({
      title: '生成AIの現在と未来',
      date: new Date().toISOString().slice(0, 10),
      speakers: [
        { name: '上村 太郎', kana: 'カミムラ タロウ', affiliation: 'ABC大学' }
      ],
      slideUris: [],
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // 2) dictionaries (global)
    const dictRef = db.collection('dictionaries').doc();
    await dictRef.set({
      scope: 'global',
      phrases: [
        { text: '上村', variants: ['かみむら', '植村'], boost: 20 }
      ],
      updatedAt: new Date().toISOString()
    });

    // 3) transcripts placeholder
    const transcriptRef = db.collection('transcripts').doc();
    await transcriptRef.set({
      lectureId: lectureRef.id,
      version: 1,
      status: 'created',
      files: { rawUri: '', finalUri: '' },
      stats: { avgConfidence: 0 },
      sttConfig: { languageCode: 'ja-JP', contexts: [] },
      createdAt: new Date().toISOString()
    });

    return {
      lectureId: lectureRef.id,
      dictionaryId: dictRef.id,
      transcriptId: transcriptRef.id
    };
  } catch (e) {
    if (!String(e.message || '').includes('Datastore Mode')) throw e;

    // Datastore mode fallback
    const datastore = new Datastore({ projectId: process.env.GOOGLE_CLOUD_PROJECT_ID });

    // Allocate IDs
    const [lectureKeys] = await datastore.allocateIds(datastore.key(['Lectures']), 1);
    const [dictKeys] = await datastore.allocateIds(datastore.key(['Dictionaries']), 1);
    const [transcriptKeys] = await datastore.allocateIds(datastore.key(['Transcripts']), 1);
    const lectureKey = lectureKeys[0];
    const dictKey = dictKeys[0];
    const transcriptKey = transcriptKeys[0];

    const nowIso = new Date().toISOString();

    await datastore.save({
      key: lectureKey,
      data: {
        title: '生成AIの現在と未来',
        date: nowIso.slice(0, 10),
        speakers: [
          { name: '上村 太郎', kana: 'カミムラ タロウ', affiliation: 'ABC大学' }
        ],
        slideUris: [],
        status: 'draft',
        createdAt: nowIso,
        updatedAt: nowIso
      }
    });

    await datastore.save({
      key: dictKey,
      data: {
        scope: 'global',
        phrases: [
          { text: '上村', variants: ['かみむら', '植村'], boost: 20 }
        ],
        updatedAt: nowIso
      }
    });

    await datastore.save({
      key: transcriptKey,
      data: {
        lectureId: String(lectureKey.id || lectureKey.name || ''),
        version: 1,
        status: 'created',
        files: { rawUri: '', finalUri: '' },
        stats: { avgConfidence: 0 },
        sttConfig: { languageCode: 'ja-JP', contexts: [] },
        createdAt: nowIso
      }
    });

    return {
      lectureId: String(lectureKey.id || lectureKey.name || ''),
      dictionaryId: String(dictKey.id || dictKey.name || ''),
      transcriptId: String(transcriptKey.id || transcriptKey.name || '')
    };
  }
}


