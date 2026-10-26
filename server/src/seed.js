import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User, Schedule, Appointment } from './models.js';

const passwordHash = await bcrypt.hash('DemoOnly!2026', 12);
try {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/medicore_hms');
  const demoEmails = ['admin@medicore.demo','patient@medicore.demo','doctor@medicore.demo','frontdesk@medicore.demo',
    'samuel.adeyemi@medicore.demo','ibrahim.musa@medicore.demo','aisha.bello@medicore.demo','daniel.okafor@medicore.demo','fatima.yusuf@medicore.demo'];
  const oldUsers = await User.find({ email: { $in: demoEmails } }).select('_id');
  const oldIds = oldUsers.map(u => u._id);
  await Promise.all([
    Appointment.deleteMany({ $or: [{ patient: { $in: oldIds } }, { doctor: { $in: oldIds } }] }),
    Schedule.deleteMany({ doctor: { $in: oldIds } }),
    User.deleteMany({ email: { $in: demoEmails } })
  ]);
  const [admin, patient, demoDoctor, frontdesk] = await User.create([
    { name:'MediCore Administrator', email:'admin@medicore.demo', passwordHash, role:'admin', verificationStatus:'not_required' },
    { name:'Demo Patient', email:'patient@medicore.demo', passwordHash, role:'patient', phone:'08000000000', verificationStatus:'not_required' },
    { name:'Dr. Demo Account', email:'doctor@medicore.demo', passwordHash, role:'doctor', specialty:'General Medicine', licenseNumber:'DEMO-MED-000', verificationStatus:'verified', bio:'Demonstration doctor account.' },
    { name:'Front Desk Officer', email:'frontdesk@medicore.demo', passwordHash, role:'frontdesk', verificationStatus:'not_required' }
  ]);
  const doctorData = [
    ['Dr. Samuel Adeyemi','samuel.adeyemi@medicore.demo','General Medicine','DEMO-MED-101'],
    ['Dr. Ibrahim Musa','ibrahim.musa@medicore.demo','Cardiology','DEMO-MED-102'],
    ['Dr. Aisha Bello','aisha.bello@medicore.demo','Paediatrics','DEMO-MED-103'],
    ['Dr. Daniel Okafor','daniel.okafor@medicore.demo','General Surgery','DEMO-MED-104'],
    ['Dr. Fatima Yusuf','fatima.yusuf@medicore.demo','Dermatology','DEMO-MED-105']
  ];
  const doctors = await User.create(doctorData.map(([name,email,specialty,licenseNumber]) => ({
    name,email,passwordHash,role:'doctor',specialty,licenseNumber,verificationStatus:'verified',bio:`Demo ${specialty} practitioner.`
  })));
  const allDoctors = [demoDoctor, ...doctors];
  const schedules = [];
  for (const doctor of allDoctors) {
    for (const dayOfWeek of [1,2,3,4,5]) schedules.push({ doctor: doctor._id, dayOfWeek, startTime:'09:00', endTime:'12:00', slotMinutes:30, active:true });
  }
  await Schedule.insertMany(schedules);
  console.log('\nMediCore demo data seeded successfully.');
  console.log('Password for ALL demo accounts: DemoOnly!2026');
  console.log('Admin:      admin@medicore.demo');
  console.log('Doctor:     doctor@medicore.demo');
  console.log('Patient:    patient@medicore.demo');
  console.log('Front desk: frontdesk@medicore.demo');
  console.log('Seeded verified doctors:');
  for (const d of doctors) console.log(`- ${d.name} — ${d.specialty} (${d.email})`);
  console.log('\nDemo doctors have weekday schedules, 09:00–12:00, in 30-minute slots.');
} catch (err) {
  console.error('Seed failed:', err.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
