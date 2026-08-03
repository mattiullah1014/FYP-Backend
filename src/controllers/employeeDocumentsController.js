import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import {
  formatDocuments,
  saveEmployeeDocumentFile,
} from '../utils/hrEmployeeHelpers.js';
import { deleteUploadByUrl } from '../utils/recruitmentHelpers.js';
import { ensureSelfEmployee } from './employeeProfileController.js';
import {
  syncProfileCompletionFromUser,
} from '../utils/profileCompletion.js';

/**
 * GET /api/employee/documents — self only, Employee.documents
 */
const listMyDocuments = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user || user.isDeleted) throw new ApiError(404, 'User not found');

  const employee = await ensureSelfEmployee(user);

  return success(res, 200, 'Documents fetched', {
    documents: formatDocuments(employee.documents || []),
  });
});

/**
 * POST /api/employee/documents — multipart file → Employee.documents (+ User mirror)
 */
const uploadMyDocument = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user || user.isDeleted) throw new ApiError(404, 'User not found');
  if (!req.file) throw new ApiError(400, 'File is required');

  const employee = await ensureSelfEmployee(user);

  const saved = await saveEmployeeDocumentFile(req.file);
  const doc = {
    name:
      req.body.name ||
      req.body.title ||
      req.body.documentName ||
      saved.name,
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

  await syncProfileCompletionFromUser(user._id);

  const stored = employee.documents[employee.documents.length - 1];

  return success(res, 201, 'Document uploaded', {
    document: formatDocuments([stored])[0],
    documents: formatDocuments(employee.documents),
  });
});

/**
 * DELETE /api/employee/documents/:docId — self only
 */
const deleteMyDocument = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user || user.isDeleted) throw new ApiError(404, 'User not found');

  const employee = await ensureSelfEmployee(user);
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
  await syncProfileCompletionFromUser(user._id);

  return success(res, 200, 'Document deleted', {
    documents: formatDocuments(employee.documents),
  });
});

export { listMyDocuments, uploadMyDocument, deleteMyDocument };
