import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOADS_ROOT = path.join(__dirname, '..', '..', 'uploads');
export const RESUMES_DIR = path.join(UPLOADS_ROOT, 'resumes');
export const AVATARS_DIR = path.join(UPLOADS_ROOT, 'avatars');

/**
 * Persist a multer memory file under uploads/resumes and return public fields.
 */
export const saveResumeFile = async (file) => {
  if (!file?.buffer) return null;

  await fs.mkdir(RESUMES_DIR, { recursive: true });

  const safeName = path
    .basename(file.originalname || 'resume.pdf')
    .replace(/\s+/g, '-');
  const filename = `${Date.now()}-${safeName}`;
  const diskPath = path.join(RESUMES_DIR, filename);
  await fs.writeFile(diskPath, file.buffer);

  return {
    name: file.originalname || safeName,
    url: `/uploads/resumes/${filename}`,
    mimeType: file.mimetype,
    size: file.size,
  };
};

/**
 * Persist avatar under uploads/avatars/. Returns relative path `/uploads/avatars/...`.
 */
export const saveAvatarFile = async (file) => {
  if (!file?.buffer) return null;

  await fs.mkdir(AVATARS_DIR, { recursive: true });

  const ext =
    path.extname(file.originalname || '').toLowerCase() ||
    (file.mimetype === 'image/png'
      ? '.png'
      : file.mimetype === 'image/webp'
        ? '.webp'
        : '.jpg');
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  const diskPath = path.join(AVATARS_DIR, filename);
  await fs.writeFile(diskPath, file.buffer);

  return `/uploads/avatars/${filename}`;
};

/** Delete a previously stored upload if it lives under /uploads/... */
export const deleteUploadByUrl = async (relativeUrl) => {
  if (!relativeUrl || typeof relativeUrl !== 'string') return;
  if (!relativeUrl.startsWith('/uploads/')) return;

  const diskPath = path.join(UPLOADS_ROOT, relativeUrl.replace(/^\/uploads\//, ''));
  try {
    await fs.unlink(diskPath);
  } catch {
    /* already gone */
  }
};

/** Absolute public URL for a relative /uploads/... path */
export const absoluteUploadUrl = (req, relativePath) => {
  if (!relativePath) return null;
  if (/^https?:\/\//i.test(relativePath)) return relativePath;
  const host = req.get?.('host');
  if (!host) return relativePath;
  const proto = req.protocol || 'http';
  return `${proto}://${host}${relativePath.startsWith('/') ? '' : '/'}${relativePath}`;
};

/** Parse requirements from array or newline / bullet string → string[] */
export const parseRequirements = (value) => {
  if (Array.isArray(value)) {
    return value.map((r) => String(r).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/\r?\n|•|;/)
      .map((r) => r.replace(/^[-*]\s*/, '').trim())
      .filter(Boolean);
  }
  return [];
};

/** Parse types from array or JSON / comma string */
export const parseTypes = (value) => {
  if (Array.isArray(value)) {
    return value.map((t) => String(t).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((t) => String(t).trim()).filter(Boolean);
      }
    } catch {
      /* comma-separated */
    }
    return trimmed
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
};

export const formatInterviewMessage = ({ mode, datetime, location, meetingLink }) => {
  const when = new Date(datetime).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  if (mode === 'Online') {
    return `Your interview is scheduled Online on ${when}. Meeting link: ${meetingLink}`;
  }
  return `Your interview is scheduled Onsite on ${when}. Location: ${location}`;
};

export const enrichJob = (job, applicantsCount = 0) => {
  const obj = typeof job.toObject === 'function' ? job.toObject() : { ...job };
  return {
    ...obj,
    type: Array.isArray(obj.types) ? obj.types.join(', ') : obj.types,
    salaryDisplay:
      obj.salaryMin != null || obj.salaryMax != null
        ? `${obj.currency || 'USD'} ${obj.salaryMin ?? '?'} - ${obj.salaryMax ?? '?'}`
        : undefined,
    applicantsCount,
    postedAt: obj.createdAt,
  };
};
