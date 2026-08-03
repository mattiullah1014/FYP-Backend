import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import { formatAssets } from '../utils/hrEmployeeHelpers.js';
import { ensureSelfEmployee } from './employeeProfileController.js';

/**
 * GET /api/employee/assets — self only, read-only Employee.assets
 */
const listMyAssets = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user || user.isDeleted) throw new ApiError(404, 'User not found');

  const employee = await ensureSelfEmployee(user);

  return success(res, 200, 'Assets fetched', {
    assets: formatAssets(employee.assets || []),
  });
});

export { listMyAssets };
