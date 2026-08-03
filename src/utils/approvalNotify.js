import User from '../models/User.js';
import ManagerEmployeeAssignment from '../models/ManagerEmployeeAssignment.js';
import { Message } from '../models/Communication.js';
import { ROLES } from '../constants/roles.js';
import { notify } from '../services/notificationService.js';

/**
 * Resolve HR + Admin users for approval broadcasts.
 */
export const findHrAdminUsers = async () =>
  User.find({
    role: { $in: [ROLES.HR, ROLES.ADMIN] },
    isDeleted: { $ne: true },
    isActive: { $ne: false },
  }).select('_id email name');

/**
 * Resolve managers assigned to an employee (+ optional User.manager fallback).
 */
export const findManagerUsersForEmployee = async (employeeUserId) => {
  if (!employeeUserId) return [];
  const links = await ManagerEmployeeAssignment.find({
    employee: employeeUserId,
  }).select('manager');
  const ids = links.map((l) => l.manager).filter(Boolean);

  const emp = await User.findById(employeeUserId).select('manager');
  if (emp?.manager) ids.push(emp.manager);

  const unique = [...new Set(ids.map(String))];
  if (!unique.length) return [];
  return User.find({
    _id: { $in: unique },
    isDeleted: { $ne: true },
  }).select('_id email name');
};

/**
 * Email + in-app notification to Manager and/or HR+Admin when a request is submitted.
 */
export const notifyApproversOnSubmit = async ({
  employeeId,
  senderId,
  title,
  message,
  includeManagers = true,
  includeHrAdmin = true,
  type = 'info',
} = {}) => {
  try {
    const recipients = new Map(); // id -> { _id, email, name }

    if (includeHrAdmin) {
      const hrs = await findHrAdminUsers();
      hrs.forEach((u) => recipients.set(String(u._id), u));
    }
    if (includeManagers && employeeId) {
      const mgrs = await findManagerUsersForEmployee(employeeId);
      mgrs.forEach((u) => recipients.set(String(u._id), u));
    }

    const list = [...recipients.values()];
    if (!list.length) return { sent: 0 };

    const from = senderId || employeeId;

    await Promise.all(
      list.map((u) =>
        Message.create({
          sender: from,
          recipient: u._id,
          title,
          body: message,
          type: 'approval',
        }).catch(() => null),
      ),
    );

    await Promise.all(
      list
        .filter((u) => u.email)
        .map((u) =>
          notify({
            to: u.email,
            userId: u._id,
            channel: 'email',
            subject: title,
            message,
            type,
          }).catch(() => null),
        ),
    );

    return { sent: list.length };
  } catch (err) {
    console.error('[notifyApproversOnSubmit]', err.message);
    return { sent: 0, error: err.message };
  }
};

/**
 * Email + in-app to employee/candidate when request is approved or rejected.
 */
export const notifyRequesterOnDecision = async ({
  to,
  userId,
  title,
  message,
  decision,
  type,
} = {}) => {
  try {
    if (!to && !userId) return null;

    let email = to;
    let uid = userId;
    if (!email && uid) {
      const u = await User.findById(uid).select('email');
      email = u?.email;
    }
    if (!uid && email) {
      const u = await User.findOne({
        email: new RegExp(
          `^${String(email).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
          'i',
        ),
      }).select('_id');
      uid = u?._id;
    }

    const decided = String(decision || '').toLowerCase();
    const notifType =
      type ||
      (decided.includes('reject')
        ? 'warning'
        : decided.includes('approv') || decided.includes('select')
          ? 'success'
          : 'info');

    if (!email) return null;

    return notify({
      to: email,
      userId: uid,
      channel: 'email',
      subject: title || 'Request update',
      message: message || title || 'Your request was updated',
      type: notifType,
    });
  } catch (err) {
    console.error('[notifyRequesterOnDecision]', err.message);
    return null;
  }
};

/**
 * Notify HR+Admin only (e.g. performance pending HR, new application).
 */
export const notifyHrAdmin = async ({
  senderId,
  title,
  message,
  type = 'info',
} = {}) =>
  notifyApproversOnSubmit({
    employeeId: null,
    senderId,
    title,
    message,
    includeManagers: false,
    includeHrAdmin: true,
    type,
  });
