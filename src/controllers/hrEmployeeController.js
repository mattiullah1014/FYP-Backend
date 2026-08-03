import mongoose from 'mongoose';
import Employee, { generateEmpId } from '../models/Employee.js';
import User from '../models/User.js';
import Application from '../models/Application.js';
import ManagerProfile from '../models/ManagerProfile.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import { ROLES } from '../constants/roles.js';
import { logAudit } from '../services/auditService.js';
import {
  requireEmployee,
  mapStaffRole,
  displayRole,
  buildFullEmployeeDto,
  resolveOrgRefs,
  resolveManagerUser,
  linkPrimaryManager,
  syncProfileExtras,
  saveEmployeeDocumentFile,
  formatDocuments,
  formatAssets,
  formatManagers,
} from '../utils/hrEmployeeHelpers.js';
import { deleteUploadByUrl } from '../utils/recruitmentHelpers.js';
import {
  getOrCreateProfileCompletion,
} from '../utils/profileCompletion.js';
import ManagerEmployeeAssignment from '../models/ManagerEmployeeAssignment.js';

/**
 * Create missing Employee rows for staff Users (legacy /api/employees creates).
 */
const backfillEmployeeProfiles = async () => {
  const linked = await Employee.find().select('user').lean();
  const linkedIds = new Set(linked.map((e) => String(e.user)));

  const staff = await User.find({
    role: { $in: [ROLES.EMPLOYEE, ROLES.MANAGER, ROLES.HR] },
    isDeleted: false,
  })
    .populate('department', 'name')
    .populate('branch', 'name')
    .populate('manager', 'name');

  for (const user of staff) {
    if (linkedIds.has(String(user._id))) continue;

    let empId = user.employeeId;
    if (!empId) {
      empId = await generateEmpId();
      user.employeeId = empId;
      await user.save();
    } else {
      const clash = await Employee.findOne({ empId });
      if (clash) {
        empId = await generateEmpId();
        user.employeeId = empId;
        await user.save();
      }
    }

    await Employee.create({
      user: user._id,
      empId,
      name: user.name,
      email: user.email,
      phone: user.phone,
      designation: user.designation,
      department: user.department?.name || undefined,
      branch: user.branch?.name || undefined,
      role: displayRole(user.role),
      manager: user.manager?.name,
      address: user.address,
      emergencyContact: user.emergencyContacts?.[0],
      joinedAt: user.dateOfJoining || user.createdAt || new Date(),
      status: user.isActive === false ? 'Inactive' : 'Active',
      isActive: user.isActive !== false,
      documents: (user.documents || []).map((d) => ({
        name: d.name,
        type: d.type || 'document',
        url: d.url,
        publicId: d.publicId,
        uploadedAt: d.uploadedAt || d.createdAt || new Date(),
      })),
    });
  }
};

const listEmployees = asyncHandler(async (req, res) => {
  await backfillEmployeeProfiles();

  const {
    department,
    status,
    search,
    page = 1,
    limit = 20,
  } = req.query;

  const filter = { status: { $ne: 'Deleted' } };
  if (department) filter.department = new RegExp(String(department), 'i');
  if (status) {
    const s = String(status).trim();
    const normalized =
      s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    if (['Active', 'Inactive', 'Deleted'].includes(normalized)) {
      filter.status = normalized;
    } else {
      filter.status = s;
    }
  }

  if (search) {
    const q = String(search).trim();
    filter.$or = [
      { name: new RegExp(q, 'i') },
      { email: new RegExp(q, 'i') },
      { empId: new RegExp(q, 'i') },
      { phone: new RegExp(q, 'i') },
      { designation: new RegExp(q, 'i') },
    ];
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [rows, total] = await Promise.all([
    Employee.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    Employee.countDocuments(filter),
  ]);

  const employees = await Promise.all(rows.map((e) => buildFullEmployeeDto(e)));

  return success(res, 200, 'Employees fetched', {
    employees,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum) || 1,
    },
  });
});

const createEmployee = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    phone,
    empId: requestedEmpId,
    designation,
    department,
    branch,
    role,
    dateOfJoining,
    manager,
    salary,
    password,
    address,
    emergencyContact,
    bank,
    documentName,
    applicationId,
  } = req.body;

  // Required: name, email, phone, password, designation, dateOfJoining, salary
  // (also enforced by express-validator on the route)
  if (!name?.trim()) throw new ApiError(400, 'name is required');
  if (!email) throw new ApiError(400, 'email is required');
  if (!phone?.toString().trim()) throw new ApiError(400, 'phone is required');
  if (!password || String(password).length < 8) {
    throw new ApiError(400, 'password must be at least 8 characters');
  }
  if (!designation?.toString().trim()) {
    throw new ApiError(400, 'designation is required');
  }
  if (!dateOfJoining) throw new ApiError(400, 'dateOfJoining is required');
  const joinedAt = new Date(dateOfJoining);
  if (Number.isNaN(joinedAt.getTime())) {
    throw new ApiError(400, 'dateOfJoining must be a valid date');
  }
  const salaryNum = Number(salary);
  if (!Number.isFinite(salaryNum) || salaryNum <= 0) {
    throw new ApiError(400, 'salary must be a number greater than 0');
  }

  const staffRole = mapStaffRole(role || ROLES.EMPLOYEE);
  const emailNorm = String(email).toLowerCase().trim();
  const deptValue =
    department != null && String(department).trim() !== ''
      ? String(department).trim()
      : 'General';
  const branchValue =
    branch != null && String(branch).trim() !== ''
      ? String(branch).trim()
      : 'Head Office';
  const addressValue =
    address && typeof address === 'object'
      ? {
          street: address.street || '',
          city: address.city || '',
          country: address.country || '',
        }
      : { street: '', city: '', country: '' };
  const emergencyValue =
    emergencyContact && typeof emergencyContact === 'object'
      ? {
          name: emergencyContact.name || '',
          phone: emergencyContact.phone || '',
          relation: emergencyContact.relation || '',
        }
      : { name: '', phone: '', relation: '' };
  const bankValue =
    bank && typeof bank === 'object'
      ? {
          bankName: bank.bankName || '',
          accountNumber: bank.accountNumber || '',
          iban: bank.iban || '',
        }
      : { bankName: '', accountNumber: '', iban: '' };

  const exists = await User.findOne({ email: emailNorm });
  if (exists) throw new ApiError(409, 'Email already registered');

  if (requestedEmpId) {
    const empTaken = await Employee.findOne({ empId: requestedEmpId });
    if (empTaken) throw new ApiError(409, 'empId already in use');
    const userTaken = await User.findOne({ employeeId: requestedEmpId });
    if (userTaken) throw new ApiError(409, 'empId already in use');
  }

  const org = await resolveOrgRefs({
    department: deptValue,
    branch: branchValue,
  });
  const managerUser = manager ? await resolveManagerUser(manager) : null;
  const empId = requestedEmpId?.toString().trim() || (await generateEmpId());

  const session = await mongoose.startSession();
  session.startTransaction();

  let employee;
  let user;

  try {
    const createdUsers = await User.create(
      [
        {
          name: name.trim(),
          email: emailNorm,
          password,
          phone: String(phone).trim(),
          role: staffRole,
          designation: String(designation).trim(),
          department: org.departmentId,
          branch: org.branchId,
          manager: managerUser?._id,
          address: addressValue,
          dateOfJoining: joinedAt,
          employeeId: empId,
          emergencyContacts:
            emergencyValue.name || emergencyValue.phone
              ? [emergencyValue]
              : undefined,
          profileCompleted: true,
          profileCompletedAt: new Date(),
          isActive: true,
        },
      ],
      { session }
    );
    user = createdUsers[0];

    const createdEmps = await Employee.create(
      [
        {
          user: user._id,
          empId,
          name: name.trim(),
          email: emailNorm,
          phone: String(phone).trim(),
          designation: String(designation).trim(),
          department: org.departmentName || deptValue,
          branch: org.branchName || branchValue,
          role: displayRole(staffRole),
          manager: managerUser?.name || (manager ? String(manager) : undefined),
          salary: salaryNum,
          address: addressValue,
          emergencyContact: emergencyValue,
          bank: bankValue,
          joinedAt,
          status: 'Active',
          isActive: true,
          fromApplication: applicationId || undefined,
          documents: documentName
            ? [{ name: documentName, type: 'document', uploadedAt: new Date() }]
            : [],
        },
      ],
      { session }
    );
    employee = createdEmps[0];

    if (applicationId) {
      const application = await Application.findById(applicationId).session(
        session
      );
      if (application) {
        application.status = 'Selected';
        await application.save({ session });
        employee.fromApplication = application._id;
        await employee.save({ session });
      }
    }

    if (staffRole === ROLES.MANAGER) {
      await ManagerProfile.create(
        [
          {
            user: user._id,
            title: String(designation).trim() || 'Manager',
            department: org.departmentName || deptValue,
            status: 'active',
            permissions: {
              ...ManagerProfile.defaultPermissions(),
              teamManagement: true,
              approvals: true,
              performance: true,
              tasks: true,
              reports: true,
              communication: true,
            },
            createdBy: req.user._id,
          },
        ],
        { session }
      );
    }

    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }

  if (managerUser) {
    await linkPrimaryManager(user._id, managerUser, req.user._id);
  }

  await syncProfileExtras(user._id, {
    bank: bankValue,
    emergencyContact: emergencyValue,
    address: addressValue,
  });
  await getOrCreateProfileCompletion(user._id);

  await logAudit({
    actor: req.user._id,
    action: 'hr.employee.create',
    resource: 'Employee',
    resourceId: employee._id,
    ip: req.ip,
    meta: { empId, userId: user._id },
  });

  const dto = await buildFullEmployeeDto(employee);
  return success(res, 201, 'Employee created', { employee: dto });
});

const getEmployee = asyncHandler(async (req, res) => {
  const employee = await requireEmployee(req.params.id);
  const dto = await buildFullEmployeeDto(employee);
  return success(res, 200, 'Employee fetched', { employee: dto });
});

const updateEmployee = asyncHandler(async (req, res) => {
  const employee = await requireEmployee(req.params.id);
  const user = await User.findById(employee.user);
  if (!user || user.isDeleted) throw new ApiError(404, 'Employee not found');

  const {
    name,
    email,
    phone,
    empId,
    designation,
    department,
    branch,
    role,
    dateOfJoining,
    manager,
    salary,
    address,
    emergencyContact,
    bank,
    status,
  } = req.body;

  // Password reset is intentionally not supported on this endpoint
  if (req.body.password !== undefined) {
    throw new ApiError(400, 'Password cannot be updated here');
  }

  if (empId && empId !== employee.empId) {
    const taken = await Employee.findOne({ empId, _id: { $ne: employee._id } });
    if (taken) throw new ApiError(409, 'empId already in use');
    employee.empId = empId;
    user.employeeId = empId;
  }

  if (name !== undefined) {
    employee.name = name;
    user.name = name;
  }
  if (email !== undefined) {
    const emailNorm = String(email).toLowerCase().trim();
    const taken = await User.findOne({
      email: emailNorm,
      _id: { $ne: user._id },
    });
    if (taken) throw new ApiError(409, 'Email already registered');
    employee.email = emailNorm;
    user.email = emailNorm;
  }
  if (phone !== undefined) {
    employee.phone = phone;
    user.phone = phone;
  }
  if (designation !== undefined) {
    employee.designation = designation;
    user.designation = designation;
  }
  if (dateOfJoining !== undefined) {
    employee.joinedAt = new Date(dateOfJoining);
    user.dateOfJoining = employee.joinedAt;
  }
  if (salary !== undefined) {
    employee.salary = salary === null || salary === '' ? undefined : Number(salary);
  }
  if (address !== undefined) employee.address = address;
  if (emergencyContact !== undefined) employee.emergencyContact = emergencyContact;
  if (bank !== undefined) employee.bank = bank;

  if (department !== undefined || branch !== undefined) {
    const org = await resolveOrgRefs({
      department: department !== undefined ? department : employee.department,
      branch: branch !== undefined ? branch : employee.branch,
    });
    if (department !== undefined) {
      employee.department = org.departmentName || department;
      user.department = org.departmentId;
    }
    if (branch !== undefined) {
      employee.branch = org.branchName || branch;
      user.branch = org.branchId;
    }
  }

  if (role !== undefined) {
    const staffRole = mapStaffRole(role);
    user.role = staffRole;
    employee.role = displayRole(staffRole);
  }

  if (status !== undefined) {
    const s = String(status).trim();
    if (!['Active', 'Inactive', 'Deleted'].includes(s)) {
      throw new ApiError(400, 'Invalid status');
    }
    employee.status = s;
    employee.isActive = s === 'Active';
    user.isActive = s === 'Active';
    if (s === 'Deleted') {
      user.isDeleted = true;
      user.deletedAt = new Date();
    }
  }

  if (manager !== undefined) {
    const managerUser = await resolveManagerUser(manager);
    employee.manager = managerUser?.name || (manager ? String(manager) : '');
    if (managerUser) {
      await linkPrimaryManager(user._id, managerUser, req.user._id);
    } else if (!manager) {
      user.manager = undefined;
    }
  }

  await employee.save();
  await user.save();
  await syncProfileExtras(user._id, {
    bank: bank !== undefined ? employee.bank : undefined,
    emergencyContact:
      emergencyContact !== undefined ? employee.emergencyContact : undefined,
    address: address !== undefined ? employee.address : undefined,
  });

  await logAudit({
    actor: req.user._id,
    action: 'hr.employee.update',
    resource: 'Employee',
    resourceId: employee._id,
    ip: req.ip,
  });

  const dto = await buildFullEmployeeDto(employee);
  return success(res, 200, 'Employee updated', { employee: dto });
});

const setEmployeeActiveState = async (req, res, active) => {
  const employee = await requireEmployee(req.params.id, {
    includeDeleted: true,
  });
  const user = await User.findById(employee.user);
  if (!user) throw new ApiError(404, 'Employee user not found');

  if (employee.status === 'Deleted' || user.isDeleted) {
    throw new ApiError(400, 'Cannot activate/deactivate a deleted employee');
  }

  employee.status = active ? 'Active' : 'Inactive';
  employee.isActive = active;
  user.isActive = active;
  user.isDeleted = false;
  await employee.save();
  await user.save();

  await logAudit({
    actor: req.user._id,
    action: active ? 'hr.employee.activate' : 'hr.employee.deactivate',
    resource: 'Employee',
    resourceId: employee._id,
    ip: req.ip,
  });

  const dto = await buildFullEmployeeDto(employee);
  return success(
    res,
    200,
    active ? 'Employee activated' : 'Employee deactivated',
    { employee: dto }
  );
};

const activateEmployee = asyncHandler(async (req, res) =>
  setEmployeeActiveState(req, res, true)
);

const deactivateEmployee = asyncHandler(async (req, res) =>
  setEmployeeActiveState(req, res, false)
);

const deleteEmployee = asyncHandler(async (req, res) => {
  const employee = await requireEmployee(req.params.id, {
    includeDeleted: true,
  });
  const user = await User.findById(employee.user);
  if (!user) throw new ApiError(404, 'Employee user not found');

  employee.status = 'Deleted';
  employee.isActive = false;
  user.isActive = false;
  user.isDeleted = true;
  user.deletedAt = new Date();
  await employee.save();
  await user.save();

  await ManagerEmployeeAssignment.deleteMany({ employee: user._id });

  await logAudit({
    actor: req.user._id,
    action: 'hr.employee.delete',
    resource: 'Employee',
    resourceId: employee._id,
    ip: req.ip,
  });

  return success(res, 200, 'Employee deleted', {
    employee: await buildFullEmployeeDto(employee),
  });
});

const listDocuments = asyncHandler(async (req, res) => {
  const employee = await requireEmployee(req.params.id);
  const user = await User.findById(employee.user).select('documents');

  const merged = [
    ...formatDocuments(employee.documents || []),
    ...formatDocuments(
      (user?.documents || []).filter(
        (d) =>
          !(employee.documents || []).some(
            (ed) => ed.url && d.url && ed.url === d.url
          )
      )
    ),
  ];

  return success(res, 200, 'Documents fetched', { documents: merged });
});

const uploadDocument = asyncHandler(async (req, res) => {
  const employee = await requireEmployee(req.params.id);
  const user = await User.findById(employee.user);
  if (!user || user.isDeleted) throw new ApiError(404, 'Employee not found');
  if (!req.file) throw new ApiError(400, 'File is required');

  const saved = await saveEmployeeDocumentFile(req.file);
  const doc = {
    name: req.body.name || req.body.title || req.body.documentName || saved.name,
    type: req.body.type || 'other',
    url: saved.url,
    publicId: saved.publicId,
    uploadedAt: new Date(),
  };

  employee.documents.push(doc);
  await employee.save();

  user.documents.push({
    name: doc.name,
    type: doc.type,
    url: doc.url,
    publicId: doc.publicId,
    uploadedAt: doc.uploadedAt,
  });
  await user.save();

  const stored = employee.documents[employee.documents.length - 1];

  return success(res, 201, 'Document uploaded', {
    document: formatDocuments([stored])[0],
    documents: formatDocuments(employee.documents),
  });
});

const deleteDocument = asyncHandler(async (req, res) => {
  const employee = await requireEmployee(req.params.id);
  const user = await User.findById(employee.user);
  if (!user || user.isDeleted) throw new ApiError(404, 'Employee not found');

  const docId = req.params.docId;
  const doc = employee.documents.id(docId);
  if (!doc) throw new ApiError(404, 'Document not found');

  const url = doc.url;
  doc.deleteOne();
  await employee.save();

  if (url && Array.isArray(user.documents)) {
    user.documents = user.documents.filter((d) => d.url !== url);
    await user.save();
  }

  if (url) await deleteUploadByUrl(url);

  return success(res, 200, 'Document deleted', {
    documents: formatDocuments(employee.documents),
  });
});

const listAssets = asyncHandler(async (req, res) => {
  const employee = await requireEmployee(req.params.id);
  return success(res, 200, 'Assets fetched', {
    assets: formatAssets(employee.assets || []),
  });
});

const addAsset = asyncHandler(async (req, res) => {
  const employee = await requireEmployee(req.params.id);
  const { name, tag, status, assignedOn } = req.body;

  if (!name || !String(name).trim()) {
    throw new ApiError(400, 'Asset name is required');
  }

  let assignedDate = new Date();
  if (assignedOn) {
    assignedDate = new Date(assignedOn);
    if (Number.isNaN(assignedDate.getTime())) {
      throw new ApiError(400, 'assignedOn must be a valid date');
    }
  }

  employee.assets.push({
    name: String(name).trim(),
    tag: tag != null && String(tag).trim() !== '' ? String(tag).trim() : undefined,
    status: status ? String(status).trim() : 'Assigned',
    assignedOn: assignedDate,
  });
  await employee.save();

  const stored = employee.assets[employee.assets.length - 1];

  return success(res, 201, 'Asset assigned', {
    asset: formatAssets([stored])[0],
    assets: formatAssets(employee.assets),
  });
});

const deleteAsset = asyncHandler(async (req, res) => {
  const employee = await requireEmployee(req.params.id);
  const assetId = String(req.params.assetId);

  const asset =
    employee.assets.id(assetId) ||
    employee.assets.find(
      (a) => String(a._id) === assetId || String(a.id) === assetId
    );

  if (!asset) throw new ApiError(404, 'Asset not found');

  if (typeof asset.deleteOne === 'function') {
    asset.deleteOne();
  } else {
    employee.assets = employee.assets.filter(
      (a) => String(a._id) !== assetId && String(a.id) !== assetId
    );
  }
  await employee.save();

  return success(res, 200, 'Asset removed', {
    assets: formatAssets(employee.assets),
  });
});

const employeeManagers = asyncHandler(async (req, res) => {
  const employee = await requireEmployee(req.params.id);
  const links = await ManagerEmployeeAssignment.find({
    employee: employee.user,
  }).populate('manager', 'name email designation department');

  const managers = formatManagers(links);

  // Fallback: single User.manager if no assignment rows
  if (!managers.length) {
    const user = await User.findById(employee.user).populate(
      'manager',
      'name'
    );
    if (user?.manager?.name) {
      managers.push({ name: user.manager.name, relationship: 'Primary' });
    } else if (employee.manager) {
      managers.push({ name: employee.manager, relationship: 'Primary' });
    }
  }

  return success(res, 200, 'Employee managers', { managers });
});

export {
  listEmployees,
  createEmployee,
  getEmployee,
  updateEmployee,
  activateEmployee,
  deactivateEmployee,
  deleteEmployee,
  listDocuments,
  uploadDocument,
  deleteDocument,
  listAssets,
  addAsset,
  deleteAsset,
  employeeManagers,
};
