import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import { ROLES, HR_ADMIN } from '../constants/roles.js';
import { uploadToCloudinary } from '../config/cloudinary.stub.js';
import { logAudit } from '../services/auditService.js';

const generateEmployeeId = async () => {
  const year = new Date().getFullYear();
  const count = await User.countDocuments({
    role: { $ne: ROLES.CANDIDATE },
    employeeId: { $exists: true },
  });
  return `EMP-${year}-${String(count + 1).padStart(4, '0')}`;
};

const listEmployees = asyncHandler(async (req, res) => {
  const filter = { isDeleted: false, role: { $ne: ROLES.CANDIDATE } };

  if (req.user.role === ROLES.MANAGER) {
    filter.manager = req.user._id;
  } else if (req.user.role === ROLES.EMPLOYEE) {
    filter._id = req.user._id;
  }

  if (req.query.department) filter.department = req.query.department;
  if (req.query.branch) filter.branch = req.query.branch;
  if (req.query.search) {
    filter.$or = [
      { name: new RegExp(req.query.search, 'i') },
      { email: new RegExp(req.query.search, 'i') },
      { employeeId: new RegExp(req.query.search, 'i') },
    ];
  }

  const employees = await User.find(filter)
    .populate('department', 'name code')
    .populate('branch', 'name code')
    .populate('manager', 'name email employeeId')
    .sort({ createdAt: -1 });

  return success(res, 200, 'Employees fetched', { employees });
});

const getEmployee = asyncHandler(async (req, res) => {
  const employee = await User.findOne({
    _id: req.params.id,
    isDeleted: false,
  })
    .populate('department', 'name code')
    .populate('branch', 'name code')
    .populate('manager', 'name email');

  if (!employee) throw new ApiError(404, 'Employee not found');

  const isSelf = String(employee._id) === String(req.user._id);
  const isManagerOf =
    req.user.role === ROLES.MANAGER &&
    String(employee.manager?._id || employee.manager) === String(req.user._id);

  if (
    !isSelf &&
    !isManagerOf &&
    !HR_ADMIN.includes(req.user.role)
  ) {
    throw new ApiError(403, 'Not allowed to view this profile');
  }

  return success(res, 200, 'Employee fetched', { employee });
});

const createEmployee = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    password,
    phone,
    role,
    department,
    branch,
    manager,
    designation,
    address,
    dateOfJoining,
  } = req.body;

  if (![ROLES.EMPLOYEE, ROLES.MANAGER, ROLES.HR, ROLES.ADMIN].includes(role)) {
    throw new ApiError(400, 'Invalid staff role');
  }

  const exists = await User.findOne({ email });
  if (exists) throw new ApiError(409, 'Email already registered');

  const employeeId = await generateEmployeeId();
  const employee = await User.create({
    name,
    email,
    password: password || 'ChangeMe123',
    phone,
    role,
    department,
    branch,
    manager,
    designation,
    address,
    dateOfJoining,
    employeeId,
    profileCompleted: true,
    profileCompletedAt: new Date(),
  });

  await logAudit({
    actor: req.user._id,
    action: 'employee.create',
    resource: 'User',
    resourceId: employee._id,
    ip: req.ip,
  });

  return success(res, 201, 'Employee created', { employee: employee.toSafeObject() });
});

const updateEmployee = asyncHandler(async (req, res) => {
  const employee = await User.findOne({ _id: req.params.id, isDeleted: false });
  if (!employee) throw new ApiError(404, 'Employee not found');

  const isSelf = String(employee._id) === String(req.user._id);
  const hrAdmin = HR_ADMIN.includes(req.user.role);

  if (!isSelf && !hrAdmin) {
    throw new ApiError(403, 'Not allowed to update this profile');
  }

  const selfAllowed = ['phone', 'address', 'emergencyContacts'];
  const hrAllowed = [
    ...selfAllowed,
    'name',
    'department',
    'branch',
    'manager',
    'designation',
    'dateOfJoining',
    'role',
    'isActive',
  ];

  const allowed = hrAdmin ? hrAllowed : selfAllowed;
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) employee[key] = req.body[key];
  });

  await employee.save();
  await logAudit({
    actor: req.user._id,
    action: 'employee.update',
    resource: 'User',
    resourceId: employee._id,
    ip: req.ip,
  });

  return success(res, 200, 'Employee updated', { employee });
});

const softDeleteEmployee = asyncHandler(async (req, res) => {
  const employee = await User.findOne({ _id: req.params.id, isDeleted: false });
  if (!employee) throw new ApiError(404, 'Employee not found');

  employee.isDeleted = true;
  employee.isActive = false;
  employee.deletedAt = new Date();
  await employee.save();

  await logAudit({
    actor: req.user._id,
    action: 'employee.softDelete',
    resource: 'User',
    resourceId: employee._id,
    ip: req.ip,
  });

  return success(res, 200, 'Employee soft-deleted');
});

const uploadDocument = asyncHandler(async (req, res) => {
  const employee = await User.findById(req.params.id);
  if (!employee || employee.isDeleted) throw new ApiError(404, 'Employee not found');

  const isSelf = String(employee._id) === String(req.user._id);
  if (!isSelf && !HR_ADMIN.includes(req.user.role)) {
    throw new ApiError(403, 'Not allowed');
  }
  if (!req.file) throw new ApiError(400, 'File is required');

  const uploaded = await uploadToCloudinary(req.file, 'employees/documents');
  employee.documents.push({
    name: req.body.name || req.file.originalname,
    url: uploaded.url,
    publicId: uploaded.publicId,
    type: req.body.type || 'document',
  });
  await employee.save();

  return success(res, 200, 'Document uploaded', { documents: employee.documents });
});

const uploadPhoto = asyncHandler(async (req, res) => {
  const employee = await User.findById(req.params.id);
  if (!employee || employee.isDeleted) throw new ApiError(404, 'Employee not found');

  const isSelf = String(employee._id) === String(req.user._id);
  if (!isSelf && !HR_ADMIN.includes(req.user.role)) {
    throw new ApiError(403, 'Not allowed');
  }
  if (!req.file) throw new ApiError(400, 'Photo is required');

  const uploaded = await uploadToCloudinary(req.file, 'employees/photos');
  employee.photo = { url: uploaded.url, publicId: uploaded.publicId };
  await employee.save();

  return success(res, 200, 'Photo uploaded', { photo: employee.photo });
});

const getTeam = asyncHandler(async (req, res) => {
  const team = await User.find({
    manager: req.user._id,
    isDeleted: false,
  }).populate('department', 'name');
  return success(res, 200, 'Team fetched', { team });
});

export { listEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  softDeleteEmployee,
  uploadDocument,
  uploadPhoto,
  getTeam,
  generateEmployeeId, };
