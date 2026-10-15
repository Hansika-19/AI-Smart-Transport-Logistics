from datetime import datetime, timedelta
from fastapi import FastAPI
from pydantic import BaseModel
from sklearn.ensemble import RandomForestRegressor
import numpy as np

app = FastAPI(title="Smart Transport AI Service")

# Demo training data: distance, traffic(0-10), weather(0-10), previous delay minutes.
X = np.array([
    [20,1,0,0],[40,2,1,3],[60,3,1,5],[80,5,2,10],[100,6,3,15],
    [120,7,4,20],[150,8,5,25],[180,9,6,35],[220,7,8,30],[275,8,4,15],
    [300,9,8,45],[350,10,9,60],[50,8,7,12],[90,2,8,5],[200,4,2,8]
], dtype=float)
y = np.array([1,3,5,9,14,20,28,38,42,35,58,75,25,13,15], dtype=float)
model = RandomForestRegressor(n_estimators=250, random_state=42)
model.fit(X, y)

class DelayInput(BaseModel):
    distance_km: float
    traffic: float = 3
    weather: float = 2
    history_delay: float = 10
    expected_time: str | None = None
    trip_status: str | None = None
    live_late_minutes: int = 0

@app.get("/health")
def health():
    return {"ok": True, "service": "ml-service"}

@app.post("/predict-delay")
def predict_delay(x: DelayInput):
    distance = max(1.0, float(x.distance_km))
    traffic = min(10.0, max(0.0, float(x.traffic)))
    weather = min(10.0, max(0.0, float(x.weather)))
    history = max(0.0, float(x.history_delay))

    model_value = float(model.predict([[distance, traffic, weather, history]])[0])

    # During an active trip, traffic/weather are risk factors, not proof of a delay.
    # Only report a positive delay after the expected delivery time has actually passed.
    if x.trip_status == "In Transit":
        live_late = max(0, int(x.live_late_minutes or 0))
        if live_late == 0:
            return {
                "predicted_delay_minutes": 0,
                "delay_probability": 0.0,
                "new_estimated_delivery": x.expected_time,
                "expected_delivery": x.expected_time,
                "route_condition": "High risk" if traffic >= 8 else "Moderate" if traffic >= 5 else "Good",
                "status": "On time",
                "model": "Random Forest + live deadline monitor",
                "live_delay": False
            }
        now = datetime.now()
        return {
            "predicted_delay_minutes": live_late,
            "delay_probability": 1.0,
            "new_estimated_delivery": now.strftime("%H:%M"),
            "expected_delivery": x.expected_time,
            "route_condition": "High risk" if traffic >= 8 else "Moderate" if traffic >= 5 else "Good",
            "status": "Delay expected",
            "model": "Random Forest + live deadline monitor",
            "live_delay": True
        }
    # Blend the learned model with transparent operational factors so the demo
    # responds clearly to traffic/weather/history changes and does not return 0 unexpectedly.
    factor_value = (distance / 120.0) * max(0.0, traffic - 2.0) * 1.7 + weather * 1.2 + history * 0.18
    minutes = max(0.0, round(model_value * 0.55 + factor_value * 0.45))

    # Small/normal conditions can genuinely be on time.
    if traffic <= 2 and weather <= 2 and history <= 3:
        minutes = min(minutes, 3)

    risk = min(0.98, max(0.05, 0.08 + traffic * 0.055 + weather * 0.035 + min(history, 60) * 0.006 + min(distance, 500) * 0.0003))
    if minutes == 0:
        risk = min(risk, 0.18)

    new_eta = None
    expected_display = x.expected_time
    if x.expected_time:
        try:
            base = datetime.strptime(x.expected_time, "%H:%M")
            eta = base + timedelta(minutes=int(minutes))
            new_eta = eta.strftime("%H:%M")
        except ValueError:
            pass

    route = "High risk" if traffic >= 8 else "Moderate" if traffic >= 5 else "Good"
    status = "Delay expected" if minutes > 0 else "On time"

    return {
        "predicted_delay_minutes": int(minutes),
        "delay_probability": round(risk, 2),
        "new_estimated_delivery": new_eta,
        "expected_delivery": expected_display,
        "route_condition": route,
        "status": status,
        "model": "Random Forest + operational risk factors"
    }
