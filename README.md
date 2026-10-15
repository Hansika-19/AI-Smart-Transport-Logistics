# AI Smart Transport & Logistics Management System — Final Updated Version

This version keeps the reference-style homepage and the existing booking/driver/admin flow, with the following fixes:

- Any pickup and delivery place can be entered.
- Road routing uses OpenStreetMap + OSRM through the backend.
- Live Tracking displays the actual road route instead of a straight line.
- The truck follows the road geometry during the demo simulation for several minutes.
- Optional device GPS can be enabled from the Live Tracking page when browser GPS permission is available.
- AI delay prediction returns a numeric delay in minutes, probability, new ETA, route condition and status.
- Prediction unlocks automatically when the expected delivery time is reached.
- Multiple bookings are allowed.
- Admin dashboard shows today's bookings, total bookings, active trips, completed deliveries and drivers who took bookings.
- English / Telugu / Hindi interface switching is retained.

## Run on Windows

### 1. ML service — PowerShell window 1

```powershell
cd D:\AI-Smart-Transport-Logistics-Final-v3-FIXED\AI-Smart-Transport-Logistics\ml-service
py -3.12 -m venv venv
venv\Scripts\python.exe -m pip install -r requirements.txt
venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000
```

If the `venv` folder already exists, skip the `py -3.12 -m venv venv` command.

### 2. Backend — PowerShell window 2

```powershell
cd D:\AI-Smart-Transport-Logistics-Final-v3-FIXED\AI-Smart-Transport-Logistics\backend
npm.cmd install
npm.cmd run dev
```

### 3. Frontend — PowerShell window 3

```powershell
cd D:\AI-Smart-Transport-Logistics-Final-v3-FIXED\AI-Smart-Transport-Logistics\frontend
npm.cmd install
npm.cmd run dev
```

Open `http://localhost:5173`.

## Important

The real-road route requires internet access because the demo uses OpenStreetMap/OSRM. The optional Device GPS feature requires browser location permission. If GPS permission is not available, the project uses the road-route simulation for demonstration.
