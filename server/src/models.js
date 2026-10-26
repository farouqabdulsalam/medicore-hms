import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['admin', 'doctor', 'patient', 'frontdesk'], required: true },
  phone: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  specialty: { type: String, default: '' },
  licenseNumber: { type: String, default: '' },
  verificationStatus: { type: String, enum: ['not_required', 'pending', 'verified', 'rejected'], default: 'not_required' },
  verificationNote: { type: String, default: '' },
  bio: { type: String, default: '' }
}, { timestamps: true });

const scheduleSchema = new mongoose.Schema({
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
  startTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  endTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  slotMinutes: { type: Number, default: 30, min: 15, max: 120 },
  active: { type: Boolean, default: true }
}, { timestamps: true });
scheduleSchema.index({ doctor: 1, dayOfWeek: 1, startTime: 1 }, { unique: true });

const appointmentSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  time: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  reason: { type: String, required: true, trim: true, maxlength: 500 },
  status: { type: String, enum: ['pending', 'confirmed', 'checked_in', 'completed', 'cancelled', 'rejected'], default: 'pending', index: true },
  notes: { type: String, default: '', maxlength: 1000 }
}, { timestamps: true });
appointmentSchema.index({ doctor: 1, date: 1, time: 1, status: 1 });
appointmentSchema.index({ patient: 1, date: 1 });

export const User = mongoose.model('User', userSchema);
export const Schedule = mongoose.model('Schedule', scheduleSchema);
export const Appointment = mongoose.model('Appointment', appointmentSchema);
