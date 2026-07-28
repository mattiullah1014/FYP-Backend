import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { verifyToken } from '../utils/tokens.js';

const protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new ApiError(401, 'Not authorized, token missing');
  }

  const token = header.split(' ')[1];
  const decoded = verifyToken(token);

  const user = await User.findById(decoded.id).select('-password');
  if (!user || user.isDeleted) {
    throw new ApiError(401, 'User not found');
  }
  if (!user.isActive) {
    throw new ApiError(403, 'Account is suspended');
  }

  req.user = user;
  next();
});

const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(
      new ApiError(403, `Role '${req.user?.role}' is not allowed for this action`)
    );
  }
  next();
};

export { protect, authorize };
