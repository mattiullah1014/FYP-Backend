import { AuditLog } from '../models/Admin.js';

const logAudit = async ({ actor, action, resource, resourceId, meta, ip }) => {
  try {
    await AuditLog.create({
      actor,
      action,
      resource,
      resourceId: resourceId ? String(resourceId) : undefined,
      meta,
      ip,
    });
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
};

export { logAudit };
