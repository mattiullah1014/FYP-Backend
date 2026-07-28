import User from '../models/User.js';
import { verifyToken } from '../utils/tokens.js';
import asyncHandler from '../utils/asyncHandler.js';

/** Attach req.user when Bearer token is present; otherwise continue. */
const optionalProtect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next();
  }

  try {
    const token = header.split(' ')[1];
    const decoded = verifyToken(token);
    const user = await User.findById(decoded.id).select('-password');
    if (user && !user.isDeleted && user.isActive) {
      req.user = user;
    }
  } catch {
    // ignore invalid token for optional auth
  }
  next();
});

export default optionalProtect;
