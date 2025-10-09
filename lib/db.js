import { Firestore } from '@google-cloud/firestore';
import { Datastore } from '@google-cloud/datastore';

function toKind(collection) {
  // e.g. 'lectures' -> 'Lectures'
  if (!collection) return '';
  return collection.charAt(0).toUpperCase() + collection.slice(1);
}

function getFirestore() {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (clientEmail && privateKey) {
    return new Firestore({ projectId, credentials: { client_email: clientEmail, private_key: privateKey } });
  }
  return new Firestore({ projectId });
}

function getDatastore() {
  return new Datastore({ projectId: process.env.GOOGLE_CLOUD_PROJECT_ID });
}

export async function dbCreate(collection, id, data) {
  // If id is null, Firestore will auto-generate. For Datastore we will use a named key with generated timestamp.
  try {
    const db = getFirestore();
    const ref = id ? getFirestore().collection(collection).doc(id) : getFirestore().collection(collection).doc();
    await ref.set(data, { merge: false });
    return { id: ref.id };
  } catch (e) {
    if (!String(e.message || '').includes('Datastore Mode')) throw e;
    const ds = getDatastore();
    const kind = toKind(collection);
    const name = id || `${kind}_${Date.now()}`;
    const key = ds.key([kind, name]);
    await ds.upsert({ key, data });
    return { id: name };
  }
}

export async function dbGet(collection, id) {
  try {
    const snap = await getFirestore().collection(collection).doc(id).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
  } catch (e) {
    if (!String(e.message || '').includes('Datastore Mode')) throw e;
    const ds = getDatastore();
    const kind = toKind(collection);
    const key = ds.key([kind, id]);
    const [entity] = await ds.get(key);
    return entity ? { id, ...entity } : null;
  }
}

export async function dbList(collection, limit = 20) {
  try {
    const qs = await getFirestore().collection(collection).limit(limit).get();
    return qs.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    if (!String(e.message || '').includes('Datastore Mode')) throw e;
    const ds = getDatastore();
    const kind = toKind(collection);
    const query = ds.createQuery(kind).limit(limit);
    const [entities] = await ds.runQuery(query);
    return (entities || []).map(ent => {
      const id = (ent[ds.KEY]?.name || ent[ds.KEY]?.id || '').toString();
      const { [ds.KEY]: _omit, ...rest } = ent;
      return { id, ...rest };
    });
  }
}

export async function dbUpdate(collection, id, data) {
  try {
    await getFirestore().collection(collection).doc(id).set(data, { merge: true });
    return { id };
  } catch (e) {
    if (!String(e.message || '').includes('Datastore Mode')) throw e;
    const ds = getDatastore();
    const kind = toKind(collection);
    const key = ds.key([kind, id]);
    const [existing] = await ds.get(key);
    const merged = { ...(existing || {}), ...data };
    await ds.upsert({ key, data: merged });
    return { id };
  }
}


