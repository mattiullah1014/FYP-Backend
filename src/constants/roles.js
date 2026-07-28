const ROLES = {
  CANDIDATE: 'candidate',
  EMPLOYEE: 'employee',
  MANAGER: 'manager',
  HR: 'hr',
  ADMIN: 'admin',
};

const ALL_ROLES = Object.values(ROLES);
const STAFF_ROLES = [ROLES.EMPLOYEE, ROLES.MANAGER, ROLES.HR, ROLES.ADMIN];
const MANAGEMENT_ROLES = [ROLES.MANAGER, ROLES.HR, ROLES.ADMIN];
const HR_ADMIN = [ROLES.HR, ROLES.ADMIN];

/** Map RN UI labels (Candidate, HR, …) → API role (candidate, hr, …) */
const ROLE_ALIASES = {
  candidate: ROLES.CANDIDATE,
  employee: ROLES.EMPLOYEE,
  manager: ROLES.MANAGER,
  hr: ROLES.HR,
  admin: ROLES.ADMIN,
};

const normalizeRole = (value) => {
  if (value == null || value === '') return null;
  const key = String(value).trim().toLowerCase();
  return ROLE_ALIASES[key] || null;
};

export {
  ROLES,
  ALL_ROLES,
  STAFF_ROLES,
  MANAGEMENT_ROLES,
  HR_ADMIN,
  normalizeRole,
};
