import { Course, Enrollment } from '../models/Training.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import { uploadToCloudinary } from '../config/cloudinary.stub.js';
import { ROLES, HR_ADMIN } from '../constants/roles.js';

const listCourses = asyncHandler(async (req, res) => {
  const courses = await Course.find({ isActive: true }).sort({ createdAt: -1 });
  return success(res, 200, 'Courses fetched', { courses });
});

const createCourse = asyncHandler(async (req, res) => {
  const course = await Course.create({ ...req.body, createdBy: req.user._id });
  return success(res, 201, 'Course created', { course });
});

const updateCourse = asyncHandler(async (req, res) => {
  const course = await Course.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!course) throw new ApiError(404, 'Course not found');
  return success(res, 200, 'Course updated', { course });
});

const enroll = asyncHandler(async (req, res) => {
  const employeeId = req.body.employee || req.user._id;

  if (
    req.user.role === ROLES.EMPLOYEE &&
    String(employeeId) !== String(req.user._id)
  ) {
    throw new ApiError(403, 'Cannot enroll others');
  }

  if (req.user.role === ROLES.MANAGER && String(employeeId) !== String(req.user._id)) {
    const member = await User.findById(employeeId);
    if (!member || String(member.manager) !== String(req.user._id)) {
      throw new ApiError(403, 'Not your team member');
    }
  }

  const enrollment = await Enrollment.create({
    course: req.params.courseId || req.body.course,
    employee: employeeId,
    assignedBy: req.user._id,
  });
  return success(res, 201, 'Enrolled', { enrollment });
});

const myEnrollments = asyncHandler(async (req, res) => {
  const enrollments = await Enrollment.find({ employee: req.user._id }).populate(
    'course'
  );
  return success(res, 200, 'Enrollments fetched', { enrollments });
});

const updateProgress = asyncHandler(async (req, res) => {
  const enrollment = await Enrollment.findById(req.params.id);
  if (!enrollment) throw new ApiError(404, 'Enrollment not found');
  if (String(enrollment.employee) !== String(req.user._id) && !HR_ADMIN.includes(req.user.role)) {
    throw new ApiError(403, 'Not allowed');
  }

  if (req.body.progress !== undefined) enrollment.progress = req.body.progress;
  if (req.body.status) enrollment.status = req.body.status;
  if (enrollment.progress >= 100) {
    enrollment.status = 'completed';
    enrollment.completedAt = new Date();
  }
  await enrollment.save();
  return success(res, 200, 'Progress updated', { enrollment });
});

const uploadCertificate = asyncHandler(async (req, res) => {
  const enrollment = await Enrollment.findById(req.params.id);
  if (!enrollment) throw new ApiError(404, 'Enrollment not found');
  if (String(enrollment.employee) !== String(req.user._id)) {
    throw new ApiError(403, 'Not allowed');
  }
  if (!req.file) throw new ApiError(400, 'Certificate file required');

  const uploaded = await uploadToCloudinary(req.file, 'training/certificates');
  enrollment.certificate = { url: uploaded.url, publicId: uploaded.publicId };
  enrollment.status = 'completed';
  enrollment.progress = 100;
  enrollment.completedAt = new Date();
  await enrollment.save();
  return success(res, 200, 'Certificate uploaded', { enrollment });
});

const completionReport = asyncHandler(async (req, res) => {
  const enrollments = await Enrollment.find()
    .populate('course', 'title')
    .populate('employee', 'name email employeeId');
  return success(res, 200, 'Training completion report', { enrollments });
});

export { listCourses,
  createCourse,
  updateCourse,
  enroll,
  myEnrollments,
  updateProgress,
  uploadCertificate,
  completionReport, };
