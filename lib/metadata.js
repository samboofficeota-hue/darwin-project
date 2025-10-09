export function normalizeLecturePayload(input) {
  const now = new Date().toISOString();
  return {
    title: input.title || '',
    date: input.date || now.slice(0, 10),
    speakers: (input.speakers || []).map(s => ({
      name: s.name || '',
      kana: s.kana || '',
      title: s.title || '',
      bio: s.bio || '',
      affiliation: s.affiliation || ''
    })),
    slideUris: input.slideUris || [],
    status: input.status || 'draft',
    createdAt: input.createdAt || now,
    updatedAt: now
  };
}

export function gcsLecturePrefix(lectureId) {
  const bucket = process.env.GCS_BUCKET_NAME || 'darwin-project-audio-files';
  return {
    bucket,
    base: `lectures/${lectureId}`,
    audioDir: `lectures/${lectureId}/audio/`,
    slidesDir: `lectures/${lectureId}/slides/`,
    transcriptsDir: `lectures/${lectureId}/transcripts/`
  };
}


