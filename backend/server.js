import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import dns from 'node:dns';
import cors from 'cors';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';

import fs from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const serviceAccount = JSON.parse(
  fs.readFileSync('/etc/secrets/firebase-service-account.json', 'utf8')
);

initializeApp({
  credential: cert(serviceAccount)
});

dns.setServers(['8.8.8.8', '8.8.4.4']);

const app = express();
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(express.json({ limit: '20kb' }));
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5500,http://127.0.0.1:5500')
  .split(',').map(x => x.trim()).filter(Boolean);
app.use(cors({ origin(origin, cb) {
  if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
  return cb(new Error('Origin not allowed by CORS'));
}}));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }));
app.use('/api/bookings', rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false }));

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, trim: true, maxlength: 20, default: '' },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['customer', 'admin'], default: 'customer' }
}, { timestamps: true });
const User = mongoose.model('User', userSchema);
const bookingSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  first: { type: String, required: true, trim: true, maxlength: 60 },
  last: { type: String, required: true, trim: true, maxlength: 60 },
  car: { type: String, required: true, trim: true, maxlength: 100 },
  segment: { type: String, required: true, enum: ['Hatchback','Sedan','SUV','MUV / MPV','Luxury','Sports Car'] },
  service: { type: String, required: true, enum: ['Rubbing','Drycleaning','Foam Wash','Ceramic Coating'] },
  appointmentDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  appointmentTime: { type: String, required: true, maxlength: 20 },
  status: { type: String, enum: ['Pending','Confirmed','Completed','Cancelled'], default: 'Pending' }
}, { timestamps: true });
const Booking = mongoose.model('Booking', bookingSchema);

function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
}
function auth(requiredRole) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : (req.query.token || '');
    try {
      if (!token) return res.status(401).json({ message: 'Please log in.' });
      req.user = jwt.verify(token, process.env.JWT_SECRET);
      if (requiredRole && req.user.role !== requiredRole) return res.status(403).json({ message: 'Admin access required.' });
      next();
    } catch { return res.status(401).json({ message: 'Session expired. Please log in again.' }); }
  };
}
const asyncRoute = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
const publicUser = user => ({ id: user._id, name: user.name, email: user.email, phone: user.phone || '', role: user.role });

app.get('/api/health', (_req,res) => res.json({ ok: true, service: 'Glossify API', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }));
app.post('/api/auth/signup', asyncRoute(async (req,res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const phone = String(req.body.phone || '').trim();
  const firebaseIdToken = String(req.body.firebaseIdToken || '');
  if (name.length < 2 || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) return res.status(400).json({ message: 'Enter a valid name/email and password of at least 8 characters.' });

  if (!firebaseIdToken) {
    return res.status(400).json({
      message: 'Please verify your phone number with OTP first.'
    });
  }

   let verifiedPhone;

   try {
    const decodedToken = await getAuth().verifyIdToken(firebaseIdToken)
    verifiedPhone = decodedToken.phone_number;

    if (!verifiedPhone) {
      return res.status(400).json({
        message: 'Phone number verification failed.'
      });
    }
  } catch (error) {
    return res.status(401).json({
      message: 'Invalid or expired phone verification.'
    });
  }

  if (await User.exists({ email })) return res.status(409).json({ message: 'An account with this email already exists.' });
  const user = await User.create({ name, email, phone, passwordHash: await bcrypt.hash(password, 12) });
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
}));
app.post('/api/auth/login', asyncRoute(async (req,res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ message: 'Email or password is incorrect.' });
  res.json({ token: signToken(user), user: publicUser(user) });
}));
app.get('/api/auth/me', auth(), asyncRoute(async (req,res) => {
  const user = await User.findById(req.user.sub).select('name email phone role');
  if (!user) return res.status(404).json({ message: 'Account not found.' });
  res.json({ user: publicUser(user) });
}));
app.post('/api/bookings', auth(), asyncRoute(async (req,res) => {
  const { first, last, car, segment, service, appointmentDate, appointmentTime } = req.body;
  if (![first,last,car,segment,service,appointmentDate,appointmentTime].every(v => typeof v === 'string' && v.trim())) return res.status(400).json({ message: 'Please complete all booking fields.' });
  const date = new Date(`${appointmentDate}T00:00:00`); const today = new Date(); today.setHours(0,0,0,0);
  if (Number.isNaN(date.getTime()) || date < today) return res.status(400).json({ message: 'Please select a valid future date.' });
  const booking = await Booking.create({ customer: req.user.sub, first, last, car, segment, service, appointmentDate, appointmentTime });
  res.status(201).json({ message: 'Booking submitted successfully.', booking: { id: booking._id, status: booking.status } });
}));
app.get('/api/bookings/mine', auth(), asyncRoute(async (req,res) => {
  const bookings = await Booking.find({ customer: req.user.sub }).sort({ createdAt: -1 }).lean(); res.json({ bookings });
}));
app.get('/api/admin/overview', auth('admin'), asyncRoute(async (_req,res) => {
  const [customers, bookings, pending, confirmed, completed, revenue] = await Promise.all([
    User.countDocuments({ role: 'customer' }), Booking.countDocuments(), Booking.countDocuments({ status: 'Pending' }),
    Booking.countDocuments({ status: 'Confirmed' }), Booking.countDocuments({ status: 'Completed' }), Promise.resolve(0)
  ]);
  res.json({ customers, bookings, pending, confirmed, completed, revenue, note: 'Revenue will appear after service pricing and payment tracking are configured.' });
}));
app.get('/api/admin/customers', auth('admin'), asyncRoute(async (_req,res) => {
  const customers = await User.find({ role: 'customer' }).select('name email phone createdAt').sort({ createdAt: -1 }).lean();
  const ids = customers.map(c => c._id);
  const counts = await Booking.aggregate([{ $match: { customer: { $in: ids } } }, { $group: { _id: '$customer', count: { $sum: 1 } } }]);
  const countMap = new Map(counts.map(x => [String(x._id), x.count]));
  res.json({ customers: customers.map(c => ({ ...c, bookingCount: countMap.get(String(c._id)) || 0 })) });
}));
app.get('/api/admin/bookings', auth('admin'), asyncRoute(async (_req,res) => {
  const bookings = await Booking.find().populate('customer','name email phone').sort({ createdAt: -1 }).lean(); res.json({ bookings });
}));
app.patch('/api/admin/bookings/:id/status', auth('admin'), asyncRoute(async (req,res) => {
  const allowed = ['Pending','Confirmed','Completed','Cancelled'];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ message: 'Invalid booking status.' });
  const booking = await Booking.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true, runValidators: true }).populate('customer','name email phone');
  if (!booking) return res.status(404).json({ message: 'Booking not found.' }); res.json({ booking });
}));

// Server-Sent Events: MongoDB Atlas Change Streams push DB changes to open admin dashboards.
app.get('/api/admin/events', auth('admin'), (req,res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders?.(); res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);
  const streams = [];
  const send = (type, change) => { if (!res.writableEnded) res.write(`event: ${type}\ndata: ${JSON.stringify({ operation: change.operationType, at: new Date().toISOString() })}\n\n`); };
  try {
    const bookingStream = Booking.watch([], { fullDocument: 'updateLookup' });
    const customerStream = User.watch([], { fullDocument: 'updateLookup' });
    bookingStream.on('change', c => send('booking-change', c)).on('error', () => { if (!res.writableEnded) res.write('event: stream-error\ndata: {}\n\n'); });
    customerStream.on('change', c => send('customer-change', c)).on('error', () => { if (!res.writableEnded) res.write('event: stream-error\ndata: {}\n\n'); });
    streams.push(bookingStream, customerStream);
  } catch (e) { res.write(`event: stream-error\ndata: ${JSON.stringify({ message: 'Live updates unavailable. Check Atlas replica set/change stream support.' })}\n\n`); }
  const heartbeat = setInterval(() => { if (!res.writableEnded) res.write(': keep-alive\n\n'); }, 25000);
  req.on('close', () => { clearInterval(heartbeat); streams.forEach(s => s.close().catch(()=>{})); });
});

app.use((err,_req,res,_next) => { console.error(err); if (err.code === 11000) return res.status(409).json({ message: 'This email is already registered.' }); res.status(500).json({ message: 'Server error. Check backend logs and environment configuration.' }); });
const port = Number(process.env.PORT || 5000);
async function start() {
  if (!process.env.MONGODB_URI || !process.env.JWT_SECRET || !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) throw new Error('Missing required environment variables. Configure the backend environment.');
  await mongoose.connect(process.env.MONGODB_URI);
  const adminEmail = process.env.ADMIN_EMAIL.trim().toLowerCase(); let admin = await User.findOne({ email: adminEmail });
  if (!admin) await User.create({ name: process.env.ADMIN_NAME || 'Glossify Admin', email: adminEmail, passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD, 12), role: 'admin' });
  else if (admin.role !== 'admin') { admin.role = 'admin'; await admin.save(); }
  app.listen(port, () => console.log(`Glossify API listening on ${port}`));
}
start().catch(err => { console.error(err.message); process.exit(1); });
