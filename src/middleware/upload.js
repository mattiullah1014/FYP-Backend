import multer from 'multer';
import ApiError from '../utils/ApiError.js';

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new ApiError(400, 'Unsupported file type'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

const avatarMime = ['image/jpeg', 'image/png', 'image/webp'];

/** Candidate avatar: jpeg/png/webp, max 5MB */
export const avatarUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (avatarMime.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new ApiError(400, 'Avatar must be image/jpeg, image/png, or image/webp'),
        false
      );
    }
  },
});

export default upload;
