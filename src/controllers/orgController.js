import Department from '../models/Department.js';
import Branch from '../models/Branch.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';

const listDepartments = asyncHandler(async (req, res) => {
  const departments = await Department.find({ isActive: true }).populate(
    'head',
    'name email'
  );
  return success(res, 200, 'Departments fetched', { departments });
});

const createDepartment = asyncHandler(async (req, res) => {
  const department = await Department.create(req.body);
  return success(res, 201, 'Department created', { department });
});

const updateDepartment = asyncHandler(async (req, res) => {
  const department = await Department.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!department) throw new ApiError(404, 'Department not found');
  return success(res, 200, 'Department updated', { department });
});

const deleteDepartment = asyncHandler(async (req, res) => {
  const department = await Department.findByIdAndUpdate(
    req.params.id,
    { isActive: false },
    { new: true }
  );
  if (!department) throw new ApiError(404, 'Department not found');
  return success(res, 200, 'Department deactivated');
});

const listBranches = asyncHandler(async (req, res) => {
  const branches = await Branch.find({ isActive: true });
  return success(res, 200, 'Branches fetched', { branches });
});

const createBranch = asyncHandler(async (req, res) => {
  const branch = await Branch.create(req.body);
  return success(res, 201, 'Branch created', { branch });
});

const updateBranch = asyncHandler(async (req, res) => {
  const branch = await Branch.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!branch) throw new ApiError(404, 'Branch not found');
  return success(res, 200, 'Branch updated', { branch });
});

const deleteBranch = asyncHandler(async (req, res) => {
  const branch = await Branch.findByIdAndUpdate(
    req.params.id,
    { isActive: false },
    { new: true }
  );
  if (!branch) throw new ApiError(404, 'Branch not found');
  return success(res, 200, 'Branch deactivated');
});

export { listDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  listBranches,
  createBranch,
  updateBranch,
  deleteBranch, };
