import { dbList, dbGet } from './db.js';

function unique(array) {
  return Array.from(new Set(array.filter(Boolean)));
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

export async function buildSpeechContexts(options = {}) {
  const { lectureId = null, maxPhrasesPerContext = 300 } = options;

  // 1) Load dictionaries (global + lecture-scoped)
  const dicts = await dbList('dictionaries', 1000);
  const applicableDicts = (dicts || []).filter(d => {
    if (d.scope === 'global') return true;
    if (lectureId && d.scope === 'lecture' && d.lectureId === lectureId) return true;
    return false;
  });

  // 2) Collect phrases with boost
  const collected = [];
  for (const d of applicableDicts) {
    const boostDefault = typeof d.boost === 'number' ? d.boost : 15;
    for (const p of d.phrases || []) {
      const boost = typeof p.boost === 'number' ? p.boost : boostDefault;
      const variants = unique([p.text, ...(p.variants || [])]);
      collected.push({ phrases: variants, boost });
    }
  }

  // 3) From lecture metadata (speakers/title)
  if (lectureId) {
    const lecture = await dbGet('lectures', lectureId);
    if (lecture) {
      const speakerNames = unique((lecture.speakers || []).flatMap(s => unique([s.name, s.kana])));
      if (speakerNames.length > 0) {
        collected.push({ phrases: speakerNames, boost: 18 });
      }
      if (lecture.title) {
        collected.push({ phrases: unique([lecture.title]), boost: 10 });
      }
    }
  }

  // 4) Group into contexts with size cap
  const contexts = [];
  for (const item of collected) {
    const groups = chunkArray(item.phrases, maxPhrasesPerContext);
    groups.forEach(group => contexts.push({ phrases: group, boost: item.boost }));
  }

  // Limit total contexts for safety (API allows multiple; cap reasonably)
  return contexts.slice(0, 50);
}


