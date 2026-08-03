import ProfileCompletion from '../models/ProfileCompletion.js';
import User from '../models/User.js';
import Employee from '../models/Employee.js';

export const PROFILE_SECTIONS = [
  {
    key: 'personalInfo',
    title: 'Personal Information Missing',
    screen: 'PersonalInfo',
    flag: 'personalInfoComplete',
  },
  {
    key: 'documents',
    title: 'Documents Missing',
    screen: 'Documents',
    flag: 'documentsComplete',
  },
  {
    key: 'emergencyContact',
    title: 'Emergency Contact Missing',
    screen: 'EmergencyContact',
    flag: 'emergencyContactComplete',
  },
  {
    key: 'bankDetails',
    title: 'Bank Details Missing',
    screen: 'BankDetails',
    flag: 'bankDetailsComplete',
  },
];

export const getOrCreateProfileCompletion = async (userId) => {
  let doc = await ProfileCompletion.findOne({ user: userId });
  if (!doc) {
    doc = await ProfileCompletion.create({ user: userId });
  }
  return doc;
};

/**
 * personalInfo complete when:
 * fullName + phone + address.city + dateOfBirth + gender are present
 * (Employee preferred, User fallback)
 */
export const syncProfileCompletionFromUser = async (userId) => {
  const user = await User.findById(userId);
  if (!user) return null;

  const employee = await Employee.findOne({ user: userId });
  const doc = await getOrCreateProfileCompletion(userId);

  const fullName = employee?.name || user.name;
  const phone = employee?.phone || user.phone;
  const city = employee?.address?.city || user.address?.city;
  const dob = employee?.dateOfBirth || user.dateOfBirth;
  const gender = employee?.gender || user.gender;

  const hasPersonal = Boolean(
    fullName && phone && city && dob && gender
  );

  const hasDocs =
    (Array.isArray(employee?.documents) && employee.documents.length > 0) ||
    (Array.isArray(user.documents) && user.documents.length > 0);
  const hasEmergency =
    Boolean(employee?.emergencyContact?.name || employee?.emergencyContact?.phone) ||
    (Array.isArray(user.emergencyContacts) && user.emergencyContacts.length > 0);
  const hasBank = Boolean(
    employee?.bank?.accountNumber ||
      employee?.bank?.iban ||
      doc.bankDetails?.accountNumber ||
      doc.bankDetails?.iban
  );

  if (hasPersonal) doc.personalInfoComplete = true;
  if (hasDocs) doc.documentsComplete = true;
  if (hasEmergency) doc.emergencyContactComplete = true;
  if (hasBank) doc.bankDetailsComplete = true;
  await doc.save();
  return doc;
};

export const getIncompleteSections = (completionDoc) =>
  PROFILE_SECTIONS.filter((s) => !completionDoc?.[s.flag]).map(
    ({ key, title, screen }) => ({ key, title, screen })
  );

export const profileCompletionSummary = (completionDoc) => {
  const incomplete = getIncompleteSections(completionDoc);
  const total = PROFILE_SECTIONS.length;
  const done = total - incomplete.length;
  return {
    personalInfoComplete: Boolean(completionDoc?.personalInfoComplete),
    documentsComplete: Boolean(completionDoc?.documentsComplete),
    emergencyContactComplete: Boolean(completionDoc?.emergencyContactComplete),
    bankDetailsComplete: Boolean(completionDoc?.bankDetailsComplete),
    // Include stored bank payload so mobile can hydrate Bank Details form
    bankDetails: completionDoc?.bankDetails
      ? {
          bankName: completionDoc.bankDetails.bankName || '',
          accountNumber: completionDoc.bankDetails.accountNumber || '',
          iban: completionDoc.bankDetails.iban || '',
          accountTitle: completionDoc.bankDetails.accountTitle || '',
        }
      : undefined,
    percent: Math.round((done / total) * 100),
    incomplete,
  };
};
