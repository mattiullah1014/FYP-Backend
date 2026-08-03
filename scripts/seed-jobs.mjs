/**
 * Seed sample Active jobs for recruitment testing.
 * Usage: node scripts/seed-jobs.mjs
 * Needs MONGODB_URI and an existing hr|admin user (uses first found, or creates seed HR).
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import Job from '../src/models/Job.js';
import User from '../src/models/User.js';
import { ROLES } from '../src/constants/roles.js';

const samples = [
  {
    title: 'Junior Frontend Developer',
    department: 'Engineering',
    location: 'Lahore, PK',
    types: ['Full-time'],
    salaryMin: 60000,
    salaryMax: 90000,
    currency: 'PKR',
    description:
      'Build React Native screens for Brilliance Base EMS. Work with HR and product on hiring and employee flows.',
    requirements: [
      '1+ year React or React Native',
      'Familiar with REST APIs',
      'Good communication skills',
    ],
    skills: ['React Native', 'JavaScript', 'REST'],
  },
  {
    title: 'HR Generalist',
    department: 'HR',
    location: 'Remote',
    types: ['Full-time', 'Contract'],
    salaryMin: 70000,
    salaryMax: 110000,
    currency: 'PKR',
    description:
      'Own recruitment pipeline, leave policies, and employee onboarding for Brilliance Base operations.',
    requirements: [
      'Experience with ATS or recruitment tools',
      'Strong organization skills',
      'Bachelor degree preferred',
    ],
  },
  {
    title: 'UI/UX Design Intern',
    department: 'Design',
    location: 'Karachi, PK',
    types: ['Internship'],
    salaryMin: 15000,
    salaryMax: 25000,
    currency: 'PKR',
    description:
      'Support designers on mobile UI for candidate job apply and interview scheduling screens.',
    requirements: [
      'Portfolio of mobile or web UI',
      'Figma basics',
      'Willingness to learn',
    ],
  },
];

const run = async () => {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI missing in .env');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  let poster = await User.findOne({
    role: { $in: [ROLES.HR, ROLES.ADMIN] },
    isDeleted: { $ne: true },
  });

  if (!poster) {
    poster = await User.create({
      name: 'Seed HR',
      email: 'hr.seed@brilliance.local',
      password: 'ChangeMe123',
      role: ROLES.HR,
      profileCompleted: true,
      profileCompletedAt: new Date(),
    });
    console.log('Created seed HR: hr.seed@brilliance.local / ChangeMe123');
  }

  let created = 0;
  for (const sample of samples) {
    const exists = await Job.findOne({
      title: sample.title,
      location: sample.location,
      status: 'Active',
    });
    if (exists) {
      console.log(`Skip existing: ${sample.title}`);
      continue;
    }
    await Job.create({ ...sample, postedBy: poster._id, status: 'Active' });
    created += 1;
    console.log(`Created: ${sample.title}`);
  }

  console.log(`Done. Created ${created} job(s).`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
