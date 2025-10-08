/**
 * FFmpeg/FFprobe path resolution
 * Prefer static binaries when available; fall back to system binaries.
 */

let ffmpegStaticPath = null;
let ffprobeStaticPath = null;

try {
  // Dynamically import to avoid bundling issues in environments without these deps
  // eslint-disable-next-line n/no-missing-require
  ffmpegStaticPath = (await import('ffmpeg-static')).default || null;
} catch (_) {
  ffmpegStaticPath = null;
}

try {
  // eslint-disable-next-line n/no-missing-require
  const ffprobePkg = await import('ffprobe-static');
  ffprobeStaticPath = ffprobePkg.path || ffprobePkg.default || null;
} catch (_) {
  ffprobeStaticPath = null;
}

export const FFMPEG_PATH = ffmpegStaticPath || 'ffmpeg';
export const FFPROBE_PATH = ffprobeStaticPath || 'ffprobe';

export function quoteForShell(input) {
  if (!input) return '';
  return `"${String(input).replace(/"/g, '\\"')}"`;
}

