import ManagerEmployeeAssignment from '../models/ManagerEmployeeAssignment.js';
import User from '../models/User.js';
import { ROLES } from '../constants/roles.js';

const activeUserFilter = {
  isActive: true,
  isDeleted: { $ne: true },
};

const contactProjection = 'name role avatar avatarUrl photo';

/**
 * Resolve avatar URL from User document fields.
 */
export const mapContact = (user) => {
  if (!user) return null;
  const id = String(user._id || user.id);
  return {
    id,
    name: user.name || 'User',
    role: user.role,
    avatar:
      user.avatarUrl ||
      user.avatar ||
      user.photo?.url ||
      user.candidateProfile?.avatarUrl ||
      user.candidateProfile?.avatar ||
      null,
  };
};

/**
 * Can `fromUser` start a new 1:1 conversation with `toUser`?
 *
 * Rules:
 * - Candidate → any active HR only (no per-application HR assignee exists)
 * - Employee → assigned managers, any HR, all other employees
 * - Manager → own team employees, any HR, other managers (manager↔manager allowed)
 * - HR → everyone
 * - Admin → everyone
 */
export const canStartConversation = async (fromUser, toUser) => {
  if (!fromUser || !toUser) return false;
  if (String(fromUser._id) === String(toUser._id)) return false;
  if (!toUser.isActive || toUser.isDeleted) return false;

  const fromRole = fromUser.role;
  const toRole = toUser.role;

  if (fromRole === ROLES.ADMIN || fromRole === ROLES.HR) {
    return true;
  }

  if (fromRole === ROLES.CANDIDATE) {
    return toRole === ROLES.HR;
  }

  if (fromRole === ROLES.EMPLOYEE) {
    if (toRole === ROLES.HR) return true;
    if (toRole === ROLES.EMPLOYEE) return true;
    if (toRole === ROLES.MANAGER) {
      const link = await ManagerEmployeeAssignment.findOne({
        manager: toUser._id,
        employee: fromUser._id,
      }).lean();
      return Boolean(link);
    }
    return false;
  }

  if (fromRole === ROLES.MANAGER) {
    if (toRole === ROLES.HR) return true;
    if (toRole === ROLES.MANAGER) return true; // ASSUMPTION: manager↔manager allowed
    if (toRole === ROLES.EMPLOYEE) {
      const link = await ManagerEmployeeAssignment.findOne({
        manager: fromUser._id,
        employee: toUser._id,
      }).lean();
      return Boolean(link);
    }
    return false;
  }

  return false;
};

/**
 * Eligible contacts for the current user (for New Chat list).
 */
export const getEligibleContacts = async (user) => {
  const me = user._id;
  const role = user.role;
  let users = [];

  if (role === ROLES.CANDIDATE) {
    users = await User.find({
      ...activeUserFilter,
      role: ROLES.HR,
      _id: { $ne: me },
    })
      .select(contactProjection)
      .lean();
  } else if (role === ROLES.EMPLOYEE) {
    const assignments = await ManagerEmployeeAssignment.find({
      employee: me,
    })
      .select('manager')
      .lean();
    const managerIds = assignments.map((a) => a.manager);

    users = await User.find({
      ...activeUserFilter,
      _id: { $ne: me },
      $or: [
        { role: ROLES.HR },
        { role: ROLES.EMPLOYEE },
        { _id: { $in: managerIds } },
      ],
    })
      .select(contactProjection)
      .lean();
  } else if (role === ROLES.MANAGER) {
    const assignments = await ManagerEmployeeAssignment.find({
      manager: me,
    })
      .select('employee')
      .lean();
    const teamIds = assignments.map((a) => a.employee);

    users = await User.find({
      ...activeUserFilter,
      _id: { $ne: me },
      $or: [
        { role: ROLES.HR },
        { role: ROLES.MANAGER },
        { _id: { $in: teamIds } },
      ],
    })
      .select(contactProjection)
      .lean();
  } else if (role === ROLES.HR || role === ROLES.ADMIN) {
    users = await User.find({
      ...activeUserFilter,
      _id: { $ne: me },
    })
      .select(contactProjection)
      .lean();
  }

  return users.map(mapContact).filter(Boolean);
};
