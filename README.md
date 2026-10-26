# MediCore HMS — rebuilt starter

A fresh, role-based Hospital Management System using React + Vite, Express, MongoDB/Mongoose.

## Included
- Role-based login: admin, doctor, patient, front desk
- Demo seed accounts and five demo doctors
- Admin dashboard: verify/reject doctor profiles, manage users, view appointments
- Doctor dashboard: profile/specialty, availability schedule, assigned appointments, status updates
- Patient dashboard: browse verified doctors, book appointments, view/cancel own appointments
- Front desk dashboard: appointment list and status updates
- Appointment conflict checks without MongoDB transactions (works with standalone local MongoDB)
- JWT authentication, password hashing, input validation, Helmet, rate limiting, CORS, central error handling
- No fake patient medical records and no production-ready claims

## Requirements
- Node.js 20+ recommended
- MongoDB Server running locally on `127.0.0.1:27017`
- Internet for the first `npm install`

## Setup (Windows PowerShell)
1. Extract this folder somewhere such as `C:\Users\<you>\Downloads\medicore-hms-rebuilt`.
2. In the extracted folder, run:
   ```powershell
   Copy-Item server\.env.example server\.env
   npm install
   npm run install:all
   npm run seed
   npm run dev
   ```
3. Open `http://localhost:5173`.

If `npm run install:all` fails, run `npm install --prefix server` and `npm install --prefix client` separately.

## Demo accounts
All use password `DemoOnly!2026`:
- Admin: `admin@medicore.demo`
- Doctor: `doctor@medicore.demo`
- Patient: `patient@medicore.demo`
- Front desk: `frontdesk@medicore.demo`

Seeded doctors:
- Dr. Samuel Adeyemi — General Medicine
- Dr. Ibrahim Musa — Cardiology
- Dr. Aisha Bello — Paediatrics
- Dr. Daniel Okafor — General Surgery
- Dr. Fatima Yusuf — Dermatology

The seed command resets only the known demo accounts/doctors and their demo schedules/appointments. Do not run it against a real database.

## MongoDB notes
Default URI is `mongodb://127.0.0.1:27017/medicore_hms`. This app intentionally avoids multi-document transactions, so a replica set is not required. If MongoDB is not running, start the Windows service from an elevated PowerShell:
```powershell
Get-Service MongoDB
Start-Service MongoDB
```

## Troubleshooting
- API health check: `http://localhost:5000/api/health`
- `MONGO_URI is required`: make sure `server/.env` exists and contains `MONGO_URI=...`.
- Port already used: close the other process or change `PORT` in `server/.env` and update `VITE_API_URL` in `client/.env`.
- Login says incorrect password: run `npm run seed` from the project root, then try the demo credentials again.
- If login succeeds but a page errors, inspect the terminal running the API and browser DevTools Console. Do not paste real passwords or patient data into chat.

## Important
This is a local demonstration / learning project, not a certified clinical system. Before real deployment, add HTTPS, backups, audit logging, consent and privacy controls, production secret management, stronger clinical validation, and a security review. Do not use real patient data in this demo.
