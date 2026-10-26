import 'express-async-errors';
import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { User, Schedule, Appointment } from './models.js';
import { authenticate, allow } from './middleware.js';

const app = express();
const PORT = Number(process.env.PORT || 5000);
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET must be set in server/.env and be at least 32 characters long.');
  process.exit(1);
}
app.use(helmet());
app.use(cors({ origin: (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map(s => s.trim()), credentials: false }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false }));

const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const safeUser = u => ({ id: u._id, name: u.name, email: u.email, role: u.role, phone: u.phone, specialty: u.specialty, licenseNumber: u.licenseNumber, verificationStatus: u.verificationStatus, verificationNote: u.verificationNote, bio: u.bio, isActive: u.isActive });
const issueToken = user => jwt.sign({ sub: user._id.toString() }, process.env.JWT_SECRET, { expiresIn: '8h' });

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'medicore-hms-api', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const parsed = z.object({ email: z.string().email().transform(v => v.toLowerCase().trim()), password: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Enter a valid email and password.' });
  const user = await User.findOne({ email: parsed.data.email }).select('+passwordHash');
  if (!user || !user.isActive || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) return res.status(401).json({ message: 'Email or password is incorrect.' });
  res.json({ token: issueToken(user), user: safeUser(user) });
}));

app.post('/api/auth/register', asyncRoute(async (req, res) => {
  const parsed = z.object({
    name: z.string().trim().min(2).max(100),
    email: z.string().email().transform(v => v.toLowerCase().trim()),
    password: z.string().min(8).max(100),
    role: z.enum(['patient', 'doctor']).default('patient'),
    phone: z.string().max(40).optional().default(''),
    specialty: z.string().max(100).optional().default(''),
    licenseNumber: z.string().max(100).optional().default('')
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Check the form fields.' });
  const d = parsed.data;
  if (await User.exists({ email: d.email })) return res.status(409).json({ message: 'An account with that email already exists.' });
  const user = await User.create({
    name: d.name, email: d.email, passwordHash: await bcrypt.hash(d.password, 12), role: d.role,
    phone: d.phone, specialty: d.role === 'doctor' ? d.specialty : '',
    licenseNumber: d.role === 'doctor' ? d.licenseNumber : '',
    verificationStatus: d.role === 'doctor' ? 'pending' : 'not_required'
  });
  res.status(201).json({ token: issueToken(user), user: safeUser(user), message: d.role === 'doctor' ? 'Account created. An administrator must verify your credentials before patients can book you.' : 'Account created successfully.' });
}));

app.get('/api/auth/me', authenticate, (req, res) => res.json({ user: safeUser(req.user) }));
app.patch('/api/auth/profile', authenticate, asyncRoute(async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(100).optional(), phone: z.string().max(40).optional(), bio: z.string().max(500).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid profile fields.' });
  Object.assign(req.user, parsed.data);
  await req.user.save();
  res.json({ user: safeUser(req.user) });
}));

app.get('/api/doctors', authenticate, asyncRoute(async (req, res) => {
  const filter = { role: 'doctor', isActive: true };
  if (req.user.role === 'patient') filter.verificationStatus = 'verified';
  if (req.user.role === 'doctor') filter._id = req.user._id;
  const doctors = await User.find(filter).sort({ name: 1 });
  const schedules = await Schedule.find({ doctor: { $in: doctors.map(d => d._id) }, active: true }).sort({ dayOfWeek: 1, startTime: 1 });
  res.json({ doctors: doctors.map(d => ({ ...safeUser(d), schedules: schedules.filter(s => s.doctor.toString() === d._id.toString()).map(s => ({ id: s._id, dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime, slotMinutes: s.slotMinutes, active: s.active })) })) });
}));

app.get('/api/admin/users', authenticate, allow('admin'), asyncRoute(async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 });
  res.json({ users: users.map(safeUser) });
}));
app.patch('/api/admin/doctors/:id/verification', authenticate, allow('admin'), asyncRoute(async (req, res) => {
  const parsed = z.object({ status: z.enum(['verified', 'rejected', 'pending']), note: z.string().max(500).optional().default('') }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid verification status.' });
  const doctor = await User.findOne({ _id: req.params.id, role: 'doctor' });
  if (!doctor) return res.status(404).json({ message: 'Doctor not found.' });
  doctor.verificationStatus = parsed.data.status;
  doctor.verificationNote = parsed.data.note;
  await doctor.save();
  res.json({ doctor: safeUser(doctor), message: `Doctor marked ${parsed.data.status}.` });
}));
app.patch('/api/admin/users/:id/status', authenticate, allow('admin'), asyncRoute(async (req, res) => {
  const parsed = z.object({ isActive: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'isActive must be true or false.' });
  if (req.params.id === req.user._id.toString()) return res.status(400).json({ message: 'You cannot deactivate your own account.' });
  const user = await User.findByIdAndUpdate(req.params.id, { isActive: parsed.data.isActive }, { new: true });
  if (!user) return res.status(404).json({ message: 'User not found.' });
  res.json({ user: safeUser(user) });
}));

app.get('/api/schedules', authenticate, asyncRoute(async (req, res) => {
  const doctorId = req.user.role === 'doctor' ? req.user._id : req.query.doctorId;
  if (!doctorId && req.user.role !== 'admin') return res.status(400).json({ message: 'doctorId is required.' });
  const query = doctorId ? { doctor: doctorId } : {};
  res.json({ schedules: await Schedule.find(query).populate('doctor', 'name specialty verificationStatus').sort({ dayOfWeek: 1, startTime: 1 }) });
}));
app.post('/api/schedules', authenticate, allow('doctor', 'admin'), asyncRoute(async (req, res) => {
  const parsed = z.object({ doctorId: z.string().optional(), dayOfWeek: z.coerce.number().int().min(0).max(6), startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), slotMinutes: z.coerce.number().int().min(15).max(120).default(30) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Check the schedule fields.' });
  const doctorId = req.user.role === 'doctor' ? req.user._id.toString() : parsed.data.doctorId;
  if (!doctorId) return res.status(400).json({ message: 'Choose a doctor.' });
  const doctor = await User.findOne({ _id: doctorId, role: 'doctor' });
  if (!doctor) return res.status(404).json({ message: 'Doctor not found.' });
  if (req.user.role === 'doctor' && doctor.verificationStatus !== 'verified') return res.status(403).json({ message: 'Your account must be verified before publishing a schedule.' });
  if (parsed.data.startTime >= parsed.data.endTime) return res.status(400).json({ message: 'End time must be after start time.' });
  const overlap = await Schedule.findOne({ doctor: doctorId, dayOfWeek: parsed.data.dayOfWeek, active: true, startTime: { $lt: parsed.data.endTime }, endTime: { $gt: parsed.data.startTime } });
  if (overlap) return res.status(409).json({ message: 'This schedule overlaps an existing active schedule.' });
  try {
    const schedule = await Schedule.create({ doctor: doctorId, ...parsed.data });
    res.status(201).json({ schedule, message: 'Schedule added.' });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ message: 'A schedule with these details already exists.' });
    throw e;
  }
}));
app.delete('/api/schedules/:id', authenticate, allow('doctor', 'admin'), asyncRoute(async (req, res) => {
  const schedule = await Schedule.findById(req.params.id);
  if (!schedule) return res.status(404).json({ message: 'Schedule not found.' });
  if (req.user.role === 'doctor' && schedule.doctor.toString() !== req.user._id.toString()) return res.status(403).json({ message: 'You can only edit your own schedule.' });
  schedule.active = false;
  await schedule.save();
  res.json({ message: 'Schedule disabled.' });
}));

app.get('/api/appointments', authenticate, asyncRoute(async (req, res) => {
  let query = {};
  if (req.user.role === 'patient') query.patient = req.user._id;
  if (req.user.role === 'doctor') query.doctor = req.user._id;
  const appointments = await Appointment.find(query).populate('patient', 'name email phone').populate('doctor', 'name specialty').sort({ date: 1, time: 1, createdAt: -1 });
  res.json({ appointments });
}));
app.post('/api/appointments', authenticate, allow('patient'), asyncRoute(async (req, res) => {
  const parsed = z.object({ doctorId: z.string(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), reason: z.string().trim().min(3).max(500) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Enter a valid doctor, date, time and reason.' });
  const { doctorId, date, time, reason } = parsed.data;
  if (date < new Date().toLocaleDateString('en-CA')) return res.status(400).json({ message: 'Choose today or a future date.' });
  const doctor = await User.findOne({ _id: doctorId, role: 'doctor', isActive: true, verificationStatus: 'verified' });
  if (!doctor) return res.status(400).json({ message: 'This doctor is not currently available for booking.' });
  const weekday = new Date(`${date}T12:00:00`).getDay();
  const schedules = await Schedule.find({ doctor: doctorId, dayOfWeek: weekday, active: true });
  const slot = schedules.find(s => time >= s.startTime && time < s.endTime && ((parseInt(time.slice(0,2),10)*60 + parseInt(time.slice(3),10)) - (parseInt(s.startTime.slice(0,2),10)*60 + parseInt(s.startTime.slice(3),10))) % s.slotMinutes === 0);
  if (!slot) return res.status(400).json({ message: 'That time is outside the doctor’s published appointment schedule.' });
  const existing = await Appointment.findOne({ doctor: doctorId, date, time, status: { $in: ['pending', 'confirmed', 'checked_in'] } });
  if (existing) return res.status(409).json({ message: 'That appointment slot was just taken. Choose another time.' });
  const appointment = await Appointment.create({ patient: req.user._id, doctor: doctorId, date, time, reason });
  res.status(201).json({ appointment, message: 'Appointment request created.' });
}));
app.patch('/api/appointments/:id/status', authenticate, asyncRoute(async (req, res) => {
  const parsed = z.object({ status: z.enum(['confirmed', 'checked_in', 'completed', 'cancelled', 'rejected']), notes: z.string().max(1000).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid appointment status.' });
  const appt = await Appointment.findById(req.params.id);
  if (!appt) return res.status(404).json({ message: 'Appointment not found.' });
  const isOwnerPatient = req.user.role === 'patient' && appt.patient.toString() === req.user._id.toString();
  const isAssignedDoctor = req.user.role === 'doctor' && appt.doctor.toString() === req.user._id.toString();
  const isStaff = ['admin', 'frontdesk'].includes(req.user.role);
  if (!isOwnerPatient && !isAssignedDoctor && !isStaff) return res.status(403).json({ message: 'You cannot change this appointment.' });
  const next = parsed.data.status;
  if (req.user.role === 'patient' && next !== 'cancelled') return res.status(403).json({ message: 'Patients may only cancel their own appointment.' });
  if (next === 'checked_in' && !isStaff) return res.status(403).json({ message: 'Only front desk or admin can check patients in.' });
  if (next === 'completed' && !isAssignedDoctor && req.user.role !== 'admin') return res.status(403).json({ message: 'Only the assigned doctor or admin can complete an appointment.' });
  if (['cancelled', 'rejected'].includes(appt.status) || appt.status === 'completed') return res.status(400).json({ message: 'This appointment is already closed.' });
  appt.status = next;
  if (parsed.data.notes !== undefined && ['doctor', 'admin'].includes(req.user.role)) appt.notes = parsed.data.notes;
  await appt.save();
  res.json({ appointment: appt, message: `Appointment ${next.replace('_', ' ')}.` });
}));

app.get('/api/dashboard/summary', authenticate, asyncRoute(async (req, res) => {
  const [patients, doctors, appointments, pendingDoctors, pendingAppointments] = await Promise.all([
    User.countDocuments({ role: 'patient' }), User.countDocuments({ role: 'doctor', verificationStatus: 'verified' }),
    Appointment.countDocuments(), User.countDocuments({ role: 'doctor', verificationStatus: 'pending' }),
    Appointment.countDocuments({ status: 'pending' })
  ]);
  res.json({ patients, doctors, appointments, pendingDoctors, pendingAppointments });
}));

app.use((req, res) => res.status(404).json({ message: 'API route not found.' }));
app.use((err, req, res, next) => {
  if (err?.code === 11000) return res.status(409).json({ message: 'That record already exists.' });
  if (err?.name === 'ValidationError') return res.status(400).json({ message: Object.values(err.errors).map(e => e.message).join(', ') });
  if (err?.name === 'CastError') return res.status(400).json({ message: 'Invalid record identifier.' });
  console.error(err);
  res.status(500).json({ message: 'Unexpected server error. Check the API terminal for details.' });
});

mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/medicore_hms')
  .then(() => {
    console.log('MongoDB connected');
    app.listen(PORT, '0.0.0.0', () => console.log(`MediCore API running on http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error('Database connection failed:', err.message);
    process.exit(1);
  });
