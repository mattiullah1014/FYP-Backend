import fs from 'fs/promises';
import path from 'path';
import mongoose from 'mongoose';
import Employee from '../models/Employee.js';
import User from '../models/User.js';
import ManagerEmployeeAssignment from '../models/ManagerEmployeeAssignment.js';
import ProfileCompletion from '../models/ProfileCompletion.js';
import Department from '../models/Department.js';
import Branch from '../models/Branch.js';
import ApiError from './ApiError.js';
import { UPLOADS_ROOT } from './recruitmentHelpers.js';
import { normalizeRole, ROLES } from '../constants/roles.js';

export const DOCUMENTS_DIR = path.join(UPLOADS_ROOT, 'documents');

const isObjectId = (value) =>
  mongoose.Types.ObjectId.isValid(value) &&
  String(new mongoose.Types.ObjectId(value)) === String(value);

/**
 * Resolve Employee by Mongo _id, empId, or linked User _id / employeeId.
 */
export const resolveEmployee = async (id, { includeDeleted = false } = {}) => {
  if (!id) return null;

  const statusFilter = includeDeleted ? {} : { status: { $ne: 'Deleted' } };
  const or = [{ empId: String(id).trim() }];

  if (isObjectId(id)) {
    or.push({ _id: id }, { user: id });
  }

  let employee = await Employee.findOne({ $or: or, ...statusFilter });

  if (!employee) {
    const userFilter = isObjectId(id)
      ? { $or: [{ _id: id }, { employeeId: String(id).trim() }] }
      : { employeeId: String(id).trim() };
    const user = await User.findOne(userFilter).select('_id');
    if (user) {
      employee = await Employee.findOne({ user: user._id, ...statusFilter });
    }
  }

  return employee;
};

export const requireEmployee = async (id, opts) => {
  const employee = await resolveEmployee(id, opts);
  if (!employee) throw new ApiError(404, 'Employee not found');
  return employee;
};

export const mapStaffRole = (value) => {
  const normalized = normalizeRole(value);
  if (normalized && normalized !== ROLES.CANDIDATE) return normalized;
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'employee' || raw === '') return ROLES.EMPLOYEE;
  if (raw === 'manager') return ROLES.MANAGER;
  if (raw === 'hr') return ROLES.HR;
  if (raw === 'admin') return ROLES.ADMIN;
  throw new ApiError(400, 'Invalid staff role');
};

export const displayRole = (role) => {
  if (!role) return 'Employee';
  return String(role).charAt(0).toUpperCase() + String(role).slice(1);
};

export const initialFromName = (name) => {
  if (!name || typeof name !== 'string') return undefined;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return undefined;
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
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

export const formatManagers = (links = []) =>
  links.map((l) => ({
    name: l.manager?.name || 'Unknown',
    relationship:
      l.relationshipType === 'primary' ? 'Primary' : 'Secondary',
  }));

export const formatDocuments = (docs = []) =>
  docs.map((d) => {
    const name = d.name || '';
    return {
      id: String(d._id || d.id || ''),
      name,
      title: name,
      type: d.type || 'other',
      uploadedAt: d.uploadedAt || d.createdAt || null,
      url: d.url,
    };
  });

export const formatAssets = (assets = []) =>
  assets.map((a) => {
    const raw = a.assignedOn || a.assignedAt || a.createdAt || null;
    let assignedOn = raw;
    if (raw) {
      const d = raw instanceof Date ? raw : new Date(raw);
      if (!Number.isNaN(d.getTime())) {
        assignedOn = d.toISOString().slice(0, 10);
      }
    }
    return {
      id: String(a._id || a.id || ''),
      name: a.name,
      tag: a.tag || a.assetTag || '',
      status: a.status || 'Assigned',
      assignedOn,
    };
  });

/**
 * Normalize Employee (+ optional User / managers) for React Native contracts.
 */
export const toHrEmployeeDto = (employee, { user, managers = [] } = {}) => {
  const emp = employee?.toObject ? employee.toObject() : employee;
  const u = user?.toSafeObject
    ? user.toSafeObject()
    : user?.toObject
      ? user.toObject()
      : user;

  const designation = emp.designation || u?.designation || undefined;
  const department =
    emp.department || deptName(u?.department) || undefined;
  const branch = emp.branch || branchName(u?.branch) || undefined;
  const joined = emp.joinedAt || u?.dateOfJoining || undefined;
  const emergency =
    emp.emergencyContact ||
    (Array.isArray(u?.emergencyContacts) && u.emergencyContacts[0]) ||
    undefined;
  const documents =
    emp.documents?.length
      ? emp.documents
      : u?.documents || [];
  const managerName =
    emp.manager ||
    (typeof u?.manager === 'object' ? u.manager?.name : undefined) ||
    managers.find((m) => m.relationship === 'Primary')?.name ||
    managers[0]?.name;

  let status = emp.status || 'Active';
  if (u?.isDeleted) status = 'Deleted';
  else if (u && u.isActive === false && status === 'Active') status = 'Inactive';

  return {
    id: String(emp._id),
    name: emp.name || u?.name,
    empId: emp.empId || u?.employeeId,
    role: emp.role || displayRole(u?.role) || designation,
    designation,
    dept: department,
    department,
    joined,
    dateOfJoining: joined,
    email: emp.email || u?.email,
    phone: emp.phone || u?.phone,
    status,
    branch,
    manager: managerName,
    managers,
    salary: emp.salary ?? null,
    address: emp.address || u?.address || { street: '', city: '', country: '' },
    emergencyContact: emergency || { name: '', phone: '', relation: '' },
    bank: emp.bank || { bankName: '', accountNumber: '', iban: '' },
    assets: formatAssets(emp.assets || []),
    documents: formatDocuments(documents),
    initial: initialFromName(emp.name || u?.name),
    userId: emp.user ? String(emp.user._id || emp.user) : u?._id ? String(u._id) : undefined,
  };
};

export const loadManagersForUser = async (userId) => {
  if (!userId) return [];
  const links = await ManagerEmployeeAssignment.find({ employee: userId })
    .populate('manager', 'name email designation')
    .lean();
  return formatManagers(links);
};

/**
 * Resolve department / branch strings to User ObjectId refs when possible.
 */
export const resolveOrgRefs = async ({ department, branch } = {}) => {
  const result = { departmentId: undefined, branchId: undefined, departmentName: undefined, branchName: undefined };

  if (department) {
    if (isObjectId(department)) {
      const dept = await Department.findById(department);
      result.departmentId = dept?._id;
      result.departmentName = dept?.name || String(department);
    } else {
      result.departmentName = String(department).trim();
      const dept = await Department.findOne({
        name: new RegExp(`^${escapeRegex(result.departmentName)}$`, 'i'),
      });
      result.departmentId = dept?._id;
    }
  }

  if (branch) {
    if (isObjectId(branch)) {
      const b = await Branch.findById(branch);
      result.branchId = b?._id;
      result.branchName = b?.name || String(branch);
    } else {
      result.branchName = String(branch).trim();
      const b = await Branch.findOne({
        name: new RegExp(`^${escapeRegex(result.branchName)}$`, 'i'),
      });
      result.branchId = b?._id;
    }
  }

  return result;
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Resolve manager payload (id, empId, email, or name) → User.
 */
export const resolveManagerUser = async (manager) => {
  if (!manager) return null;
  const value = String(manager).trim();
  if (!value) return null;

  if (isObjectId(value)) {
    const byId = await User.findOne({
      _id: value,
      role: { $in: [ROLES.MANAGER, ROLES.HR, ROLES.ADMIN] },
      isDeleted: false,
    });
    if (byId) return byId;

    const emp = await Employee.findById(value);
    if (emp) {
      return User.findOne({ _id: emp.user, isDeleted: false });
    }
  }

  const byEmpId = await User.findOne({
    employeeId: value,
    isDeleted: false,
  });
  if (byEmpId) return byEmpId;

  const byEmail = await User.findOne({
    email: value.toLowerCase(),
    isDeleted: false,
  });
  if (byEmail) return byEmail;

  return User.findOne({
    name: new RegExp(`^${escapeRegex(value)}$`, 'i'),
    role: { $in: [ROLES.MANAGER, ROLES.HR, ROLES.ADMIN] },
    isDeleted: false,
  });
};

export const linkPrimaryManager = async (employeeUserId, managerUser, actorId) => {
  if (!employeeUserId || !managerUser) return;

  await ManagerEmployeeAssignment.updateMany(
    {
      employee: employeeUserId,
      relationshipType: 'primary',
      manager: { $ne: managerUser._id },
    },
    { relationshipType: 'secondary' }
  );

  await ManagerEmployeeAssignment.findOneAndUpdate(
    { manager: managerUser._id, employee: employeeUserId },
    {
      relationshipType: 'primary',
      ...(actorId ? {} : {}),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await User.findByIdAndUpdate(employeeUserId, { manager: managerUser._id });
};

export const syncProfileExtras = async (userId, { bank, emergencyContact, address } = {}) => {
  if (!userId) return;

  const user = await User.findById(userId);
  if (!user) return;

  if (address) {
    user.address = {
      street: address.street ?? user.address?.street,
      city: address.city ?? user.address?.city,
      country: address.country ?? user.address?.country,
      state: user.address?.state,
      zip: user.address?.zip,
    };
  }

  if (emergencyContact?.name || emergencyContact?.phone) {
    user.emergencyContacts = [
      {
        name: emergencyContact.name,
        phone: emergencyContact.phone,
        relation: emergencyContact.relation,
      },
    ];
  }

  await user.save();

  let completion = await ProfileCompletion.findOne({ user: userId });
  if (!completion) {
    completion = await ProfileCompletion.create({ user: userId });
  }

  if (bank && (bank.bankName || bank.accountNumber || bank.iban)) {
    completion.bankDetails = {
      accountTitle: user.name,
      bankName: bank.bankName,
      accountNumber: bank.accountNumber,
      iban: bank.iban,
    };
    completion.bankDetailsComplete = true;
  }
  if (emergencyContact?.name || emergencyContact?.phone) {
    completion.emergencyContactComplete = true;
  }
  if (address?.street && address?.city) {
    completion.personalInfoComplete = true;
  }
  await completion.save();
};

export const saveEmployeeDocumentFile = async (file) => {
  if (!file?.buffer) return null;

  await fs.mkdir(DOCUMENTS_DIR, { recursive: true });

  const safeName = path
    .basename(file.originalname || 'document')
    .replace(/\s+/g, '-');
  const filename = `${Date.now()}-${safeName}`;
  const diskPath = path.join(DOCUMENTS_DIR, filename);
  await fs.writeFile(diskPath, file.buffer);

  return {
    name: file.originalname || safeName,
    url: `/uploads/documents/${filename}`,
    publicId: `documents/${filename}`,
    mimeType: file.mimetype,
    size: file.size,
  };
};

export const buildFullEmployeeDto = async (employee) => {
  const user = await User.findById(employee.user)
    .populate('department', 'name code')
    .populate('branch', 'name code')
    .populate('manager', 'name email employeeId');
  const managers = await loadManagersForUser(employee.user);
  return toHrEmployeeDto(employee, { user, managers });
};
