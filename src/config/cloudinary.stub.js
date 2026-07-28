import path from 'path';
import env from './env.js';

/**
 * Cloudinary stub — replace with real SDK when credentials are ready.
 * Accepts a multer file and returns placeholder url + publicId fields.
 */
const uploadToCloudinary = async (file, folder = 'brilliance') => {
  const configured =
    env.cloudinary.cloudName &&
    env.cloudinary.apiKey &&
    env.cloudinary.apiSecret;

  if (configured) {
    // Real Cloudinary integration will go here later.
    console.warn(
      'Cloudinary credentials present but SDK not wired yet — using stub URL.'
    );
  }

  const safeName = path
    .basename(file.originalname || 'file')
    .replace(/\s+/g, '-');
  const publicId = `${folder}/${Date.now()}-${safeName}`;

  return {
    url: `https://res.cloudinary.com/stub/image/upload/${publicId}`,
    publicId,
    resourceType: file.mimetype?.startsWith('image/') ? 'image' : 'raw',
    bytes: file.size || 0,
    format: path.extname(safeName).replace('.', '') || undefined,
  };
};

export { uploadToCloudinary };
