import Employee, { generateEmpId } from '../models/Employee.js';
import User, { CANDIDATE_GENDERS } from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import { ROLES } from '../constants/roles.js';
import {
  getOrCreateProfileCompletion,
  syncProfileCompletionFromUser,
} from '../utils/profileCompletion.js';
import { displayRole } from '../utils/hrEmployeeHelpers.js';
import { logAudit } from '../services/auditService.js';
import {
  absoluteUploadUrl,
  deleteUploadByUrl,
  saveAvatarFile,
} from '../utils/recruitmentHelpers.js';

const GENDERS = CANDIDATE_GENDERS;

const formatDateOnly = (value) => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

const deptName = (department) => {
  if (!department) return undefined;
  if (typeof department === 'string') return department;
  return department.name || undefined;
};

const branchName = (branch) => {
  if (!branch) return undefined;
  if (typeof branch === 'string') return branch;
  return branch.name || undefined;
};

const isValidCnic = (value) => {
  const s = String(value).trim();
  if (!s) return true;
  // 35202-1234567-1 or 13 continuous digits
  return /^\d{5}-\d{7}-\d$/.test(s) || /^\d{13}$/.test(s);
};

/**
 * Ensure an Employee profile exists for the logged-in staff user.
 */
const ensureSelfEmployee = async (user) => {
  let employee = await Employee.findOne({ user: user._id });
  if (employee) return employee;

  let empId = user.employeeId;
  if (!empId) {
    empId = await generateEmpId();
    user.employeeId = empId;
    await user.save();
  } else {
    const clash = await Employee.findOne({ empId });
    if (clash && String(clash.user) !== String(user._id)) {
      empId = await generateEmpId();
      user.employeeId = empId;
      await user.save();
    }
  }

  employee = await Employee.create({
    user: user._id,
    empId,
    name: user.name,
    email: user.email,
    phone: user.phone,
    designation: user.designation,
    department: deptName(user.department),
    branch: branchName(user.branch),
    role: displayRole(user.role),
    address: user.address || undefined,
    dateOfBirth: user.dateOfBirth,
    gender: GENDERS.includes(user.gender) ? user.gender : undefined,
    cnic: user.cnic,
    joinedAt: user.dateOfJoining || user.createdAt || new Date(),
    status: user.isActive === false ? 'Inactive' : 'Active',
    isActive: user.isActive !== false,
  });

  return employee;
};

const toSelfProfileDto = (employee, user) => {
  const emp = employee?.toObject ? employee.toObject() : employee;
  const u = user?.toObject ? user.toObject() : user;

  const name = emp.name || u?.name || '';
  const department =
    emp.department || deptName(u?.department) || undefined;
  const branch = emp.branch || branchName(u?.branch) || undefined;
  const dob = formatDateOnly(emp.dateOfBirth || u?.dateOfBirth);
  const address = {
    street: emp.address?.street || u?.address?.street || '',
    city: emp.address?.city || u?.address?.city || '',
    state: emp.address?.state || u?.address?.state || '',
    zip: emp.address?.zip || u?.address?.zip || '',
    country: emp.address?.country || u?.address?.country || '',
  };

  let status = emp.status || 'Active';
  if (u?.isDeleted) status = 'Deleted';
  else if (u && u.isActive === false && status === 'Active') status = 'Inactive';

  const joined = emp.joinedAt || u?.dateOfJoining || null;

  const bank = {
    bankName: emp.bank?.bankName || '',
    accountNumber: emp.bank?.accountNumber || '',
    iban: emp.bank?.iban || '',
  };

  const emergencyContact = {
    name: emp.emergencyContact?.name || '',
    relation: emp.emergencyContact?.relation || '',
    phone: emp.emergencyContact?.phone || '',
  };

  return {
    id: String(emp._id),
    userId: String(u?._id || emp.user),
    empId: emp.empId || u?.employeeId,
    fullName: name,
    name,
    email: emp.email || u?.email,
    phone: emp.phone || u?.phone || '',
    designation: emp.designation || u?.designation || '',
    department,
    dept: department,
    branch,
    dateOfBirth: dob,
    dob,
    gender: emp.gender || u?.gender || '',
    cnic: emp.cnic || u?.cnic || '',
    address,
    bank,
    emergencyContact,
    status,
    joined,
    dateOfJoining: joined,
    avatar: u?.avatar || u?.photo?.url || null,
    avatarUrl: u?.avatarUrl || null,
    photo: u?.photo || null,
  };
};

const loadSelfUser = async (userId) =>
  User.findById(userId)
    .populate('department', 'name code')
    .populate('branch', 'name code');

/**
 * GET /api/employee/profile
 */
const getMyProfile = asyncHandler(async (req, res) => {
  const user = await loadSelfUser(req.user._id);
  if (!user || user.isDeleted) throw new ApiError(404, 'User not found');

  const employee = await ensureSelfEmployee(user);
  return success(res, 200, 'Profile fetched', {
    profile: toSelfProfileDto(employee, user),
  });
});

/**
 * PATCH /api/employee/profile
 */
const updateMyProfile = asyncHandler(async (req, res) => {
  const user = await loadSelfUser(req.user._id);
  if (!user || user.isDeleted) throw new ApiError(404, 'User not found');

  const employee = await ensureSelfEmployee(user);
  const body = req.body || {};

  // Forbidden fields — never change via self profile
  const blocked = [
    'email',
    'empId',
    'salary',
    'role',
    'status',
    'password',
    'manager',
    'managers',
    'applicationId',
  ];
  for (const key of blocked) {
    if (body[key] !== undefined) {
      throw new ApiError(400, `${key} cannot be updated via self profile`);
    }
  }

  const fullName = body.fullName ?? body.name;
  if (fullName !== undefined) {
    const trimmed = String(fullName).trim();
    if (!trimmed) throw new ApiError(400, 'name/fullName cannot be empty');
    employee.name = trimmed;
    user.name = trimmed;
  }

  if (body.phone !== undefined) {
    const phone = String(body.phone).trim();
    if (!phone) throw new ApiError(400, 'phone cannot be empty');
    employee.phone = phone;
    user.phone = phone;
  }

  const dobRaw = body.dateOfBirth ?? body.dob;
  if (dobRaw !== undefined && dobRaw !== null && dobRaw !== '') {
    const d = new Date(dobRaw);
    if (Number.isNaN(d.getTime())) {
      throw new ApiError(400, 'dateOfBirth must be a valid date (YYYY-MM-DD)');
    }
    employee.dateOfBirth = d;
    user.dateOfBirth = d;
  }

  if (body.gender !== undefined && body.gender !== null && body.gender !== '') {
    const g = String(body.gender).trim();
    if (!GENDERS.includes(g)) {
      throw new ApiError(
        400,
        `gender must be one of: ${GENDERS.join(', ')}`
      );
    }
    employee.gender = g;
    user.gender = g;
  }

  if (body.cnic !== undefined && body.cnic !== null && body.cnic !== '') {
    const cnic = String(body.cnic).trim();
    if (!isValidCnic(cnic)) {
      throw new ApiError(
        400,
        'cnic must match XXXXX-XXXXXXX-X or 13 digits'
      );
    }
    employee.cnic = cnic;
    user.cnic = cnic;
  }

  // Org display fields — allowed for self display sync; not salary/role
  if (body.designation !== undefined) {
    const des = String(body.designation).trim();
    employee.designation = des;
    user.designation = des;
  }
  if (body.department !== undefined) {
    employee.department = String(body.department).trim();
  }
  if (body.branch !== undefined) {
    employee.branch = String(body.branch).trim();
  }

  if (body.address !== undefined) {
    if (typeof body.address !== 'object' || body.address === null) {
      throw new ApiError(400, 'address must be an object');
    }
    const prevEmp = employee.address?.toObject?.() || employee.address || {};
    const prevUser = user.address?.toObject?.() || user.address || {};
    const next = {
      street: body.address.street ?? prevEmp.street ?? prevUser.street ?? '',
      city: body.address.city ?? prevEmp.city ?? prevUser.city ?? '',
      state: body.address.state ?? prevEmp.state ?? prevUser.state ?? '',
      zip: body.address.zip ?? prevEmp.zip ?? prevUser.zip ?? '',
      country:
        body.address.country ?? prevEmp.country ?? prevUser.country ?? '',
    };
    employee.address = next;
    user.address = next;
  }

  // Bank details — same shape as HR Add Employee / PATCH /hr/employees
  if (body.bank !== undefined) {
    if (typeof body.bank !== 'object' || body.bank === null) {
      throw new ApiError(400, 'bank must be an object');
    }
    const prev = employee.bank?.toObject?.() || employee.bank || {};
    employee.bank = {
      bankName: body.bank.bankName ?? prev.bankName ?? '',
      accountNumber: body.bank.accountNumber ?? prev.accountNumber ?? '',
      iban: body.bank.iban ?? prev.iban ?? '',
    };
  }

  if (body.emergencyContact !== undefined) {
    if (
      typeof body.emergencyContact !== 'object' ||
      body.emergencyContact === null
    ) {
      throw new ApiError(400, 'emergencyContact must be an object');
    }
    const prev =
      employee.emergencyContact?.toObject?.() ||
      employee.emergencyContact ||
      {};
    employee.emergencyContact = {
      name: body.emergencyContact.name ?? prev.name ?? '',
      relation: body.emergencyContact.relation ?? prev.relation ?? '',
      phone: body.emergencyContact.phone ?? prev.phone ?? '',
    };
  }

  await employee.save();
  await user.save();

  // Sync completion flags (bank / emergency / personal)
  const completion = await getOrCreateProfileCompletion(user._id);
  if (employee.bank?.bankName || employee.bank?.accountNumber || employee.bank?.iban) {
    completion.bankDetails = {
      bankName: employee.bank.bankName || '',
      accountNumber: employee.bank.accountNumber || '',
      iban: employee.bank.iban || '',
    };
    completion.bankDetailsComplete = Boolean(
      employee.bank.accountNumber || employee.bank.iban
    );
    await completion.save();
  }
  await syncProfileCompletionFromUser(user._id);

  const refreshedUser = await loadSelfUser(user._id);
  const refreshedEmp = await Employee.findById(employee._id);

  return success(res, 200, 'Profile updated', {
    profile: toSelfProfileDto(refreshedEmp, refreshedUser),
  });
});

const applyStaffAvatar = async (user, req, file) => {
  if (!file) return null;
  const previous = user.avatar || user.photo?.url || null;
  const relative = await saveAvatarFile(file);
  const absolute = absoluteUploadUrl(req, relative);

  if (previous && previous !== relative) {
    await deleteUploadByUrl(previous).catch(() => null);
  }

  user.avatar = relative;
  user.avatarUrl = absolute;
  user.photo = { url: relative, publicId: undefined };
  return { avatar: relative, avatarUrl: absolute };
};

/** PUT /api/employee/profile/avatar — staff (employee/manager/hr/admin) */
const uploadAvatar = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, 'Avatar file is required (field name: avatar)');
  }

  const user = await User.findById(req.user._id);
  if (!user || user.isDeleted) throw new ApiError(404, 'User not found');

  const result = await applyStaffAvatar(user, req, req.file);
  await user.save();

  await logAudit({
    actor: user._id,
    action: 'staff.avatar.upload',
    resource: 'User',
    resourceId: user._id,
    ip: req.ip,
  }).catch(() => null);

  return success(res, 200, 'Avatar updated', result);
});

/** DELETE /api/employee/profile/avatar */
const removeAvatar = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user || user.isDeleted) throw new ApiError(404, 'User not found');

  const previous = user.avatar || user.photo?.url;
  if (previous) {
    await deleteUploadByUrl(previous).catch(() => null);
  }

  user.avatar = null;
  user.avatarUrl = null;
  user.photo = undefined;
  await user.save();

  await logAudit({
    actor: user._id,
    action: 'staff.avatar.remove',
    resource: 'User',
    resourceId: user._id,
    ip: req.ip,
  }).catch(() => null);

  return success(res, 200, 'Avatar removed');
});

export {
  getMyProfile,
  updateMyProfile,
  toSelfProfileDto,
  ensureSelfEmployee,
  uploadAvatar,
  removeAvatar,
};
