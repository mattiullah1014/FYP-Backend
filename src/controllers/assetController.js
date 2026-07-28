import { Asset, AssetAssignment } from '../models/Asset.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import { ROLES, HR_ADMIN } from '../constants/roles.js';

const listAssets = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  const assets = await Asset.find(filter).sort({ createdAt: -1 });
  return success(res, 200, 'Assets fetched', { assets });
});

const createAsset = asyncHandler(async (req, res) => {
  const asset = await Asset.create(req.body);
  return success(res, 201, 'Asset created', { asset });
});

const updateAsset = asyncHandler(async (req, res) => {
  const asset = await Asset.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!asset) throw new ApiError(404, 'Asset not found');
  return success(res, 200, 'Asset updated', { asset });
});

const assignAsset = asyncHandler(async (req, res) => {
  const asset = await Asset.findById(req.body.asset);
  if (!asset) throw new ApiError(404, 'Asset not found');
  if (asset.status !== 'available') {
    throw new ApiError(400, 'Asset is not available');
  }

  const assignment = await AssetAssignment.create({
    asset: asset._id,
    employee: req.body.employee,
    assignedBy: req.user._id,
    notes: req.body.notes,
  });

  asset.status = 'assigned';
  await asset.save();

  return success(res, 201, 'Asset assigned', { assignment });
});

const myAssets = asyncHandler(async (req, res) => {
  const assignments = await AssetAssignment.find({
    employee: req.user._id,
    status: { $in: ['assigned', 'return-requested'] },
  }).populate('asset');
  return success(res, 200, 'Assigned assets fetched', { assignments });
});

const requestReturn = asyncHandler(async (req, res) => {
  const assignment = await AssetAssignment.findById(req.params.id);
  if (!assignment) throw new ApiError(404, 'Assignment not found');
  if (String(assignment.employee) !== String(req.user._id)) {
    throw new ApiError(403, 'Not your asset');
  }
  assignment.returnRequested = true;
  assignment.status = 'return-requested';
  await assignment.save();
  return success(res, 200, 'Return requested', { assignment });
});

const confirmReturn = asyncHandler(async (req, res) => {
  const assignment = await AssetAssignment.findById(req.params.id);
  if (!assignment) throw new ApiError(404, 'Assignment not found');

  assignment.status = 'returned';
  assignment.returnedAt = new Date();
  await assignment.save();

  await Asset.findByIdAndUpdate(assignment.asset, { status: 'available' });
  return success(res, 200, 'Asset returned', { assignment });
});

const teamAssets = asyncHandler(async (req, res) => {
  const team = await User.find({ manager: req.user._id }).select('_id');
  const assignments = await AssetAssignment.find({
    employee: { $in: team.map((t) => t._id) },
    status: { $ne: 'returned' },
  })
    .populate('asset')
    .populate('employee', 'name email');
  return success(res, 200, 'Team assets fetched', { assignments });
});

export { listAssets,
  createAsset,
  updateAsset,
  assignAsset,
  myAssets,
  requestReturn,
  confirmReturn,
  teamAssets, };
