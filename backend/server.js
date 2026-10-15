import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });
app.use(cors());
app.use(express.json());

const CITY_COORDS = {
  Hyderabad:{lat:17.385,lng:78.486}, Warangal:{lat:17.9689,lng:79.5941}, Vijayawada:{lat:16.5062,lng:80.648},
  Visakhapatnam:{lat:17.6868,lng:83.2185}, Guntur:{lat:16.3067,lng:80.4365}, Nalgonda:{lat:17.0575,lng:79.2684},
  Khammam:{lat:17.2473,lng:80.1514}, Bengaluru:{lat:12.9716,lng:77.5946}, Chennai:{lat:13.0827,lng:80.2707},
  Mumbai:{lat:19.076,lng:72.8777}, Pune:{lat:18.5204,lng:73.8567}, Nagpur:{lat:21.1458,lng:79.0882},
  Delhi:{lat:28.6139,lng:77.209}, Kolkata:{lat:22.5726,lng:88.3639}, Mysuru:{lat:12.2958,lng:76.6394},
  Tirupati:{lat:13.6288,lng:79.4192}, Rajahmundry:{lat:17.0005,lng:81.804}, Nellore:{lat:14.4426,lng:79.9865}
};
const drivers=[
{id:"D001",name:"Ravi Kumar",vehicleType:"Truck",capacity:10000,rating:4.8,language:"Telugu",experience:7,phone:"9876543210",home:"Hyderabad",available:true},
{id:"D002",name:"Suresh Reddy",vehicleType:"Mini Truck",capacity:5000,rating:4.5,language:"Telugu",experience:5,phone:"9876501234",home:"Warangal",available:true},
{id:"D003",name:"Amit Singh",vehicleType:"Truck",capacity:12000,rating:4.7,language:"Hindi",experience:8,phone:"9876512345",home:"Hyderabad",available:true},
{id:"D004",name:"Kiran Rao",vehicleType:"Trailer",capacity:18000,rating:4.9,language:"Telugu",experience:10,phone:"9876523456",home:"Vijayawada",available:true},
{id:"D005",name:"Arjun Das",vehicleType:"Truck",capacity:9000,rating:4.6,language:"Hindi",experience:6,phone:"9876534567",home:"Nagpur",available:true},
{id:"D006",name:"Prakash Naidu",vehicleType:"Mini Truck",capacity:6000,rating:4.4,language:"Telugu",experience:4,phone:"9876545678",home:"Guntur",available:true}
];
const jobs=[
{id:"J1001",industry:"ABC Manufacturing",pickup:"Hyderabad",delivery:"Vijayawada",goods:"Industrial Equipment",weight:8000,budget:18000,status:"Open",vehicleType:"Truck",createdAt:new Date().toISOString()},
{id:"J1002",industry:"Green Agro",pickup:"Hyderabad",delivery:"Warangal",goods:"Agricultural Produce",weight:3500,budget:9000,status:"Open",vehicleType:"Mini Truck",createdAt:new Date().toISOString()}
];
const bookings=[];
const tracking={};
const routeCache=new Map();

function normalize(s){return String(s||"").trim().toLowerCase()}
function coordsFor(city){const key=Object.keys(CITY_COORDS).find(c=>normalize(c)===normalize(city));return key?CITY_COORDS[key]:null}
function haversine(a,b){const R=6371,rad=Math.PI/180,dLat=(b.lat-a.lat)*rad,dLng=(b.lng-a.lng)*rad;const x=Math.sin(dLat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLng/2)**2;return 2*R*Math.asin(Math.sqrt(x))}
function estimateDistance(pickup,delivery){const a=coordsFor(pickup),b=coordsFor(delivery);return a&&b?Math.max(20,Math.round(haversine(a,b)*1.2)):100}

async function geocode(place){
  const known=coordsFor(place); if(known)return {...known,name:place};
  const q=encodeURIComponent(`${place}, India`);
  const response=await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=in&q=${q}`,{headers:{"User-Agent":"AI-Smart-Transport-IPD/1.0 student-project"}});
  if(!response.ok)throw new Error("Location search failed");
  const data=await response.json(); if(!data.length)throw new Error(`Location not found: ${place}`);
  return {lat:Number(data[0].lat),lng:Number(data[0].lon),name:data[0].display_name};
}

async function buildRoute(from,to){
  const cacheKey=`${normalize(from)}|${normalize(to)}`;
  if(routeCache.has(cacheKey))return routeCache.get(cacheKey);
  const a=await geocode(from),b=await geocode(to);
  const url=`https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson&steps=true`;
  const response=await fetch(url);
  if(!response.ok)throw new Error("Road route service failed");
  const data=await response.json();
  if(!data.routes?.length)throw new Error("No driving route found");
  const r=data.routes[0];
  const steps=(r.legs||[]).flatMap(leg=>leg.steps||[]).map(s=>({name:s.name||"Road",distance:s.distance||0}));
  const result={fromName:from,toName:to,start:{lat:a.lat,lng:a.lng},end:{lat:b.lat,lng:b.lng},geometry:r.geometry.coordinates,distanceKm:Number((r.distance/1000).toFixed(1)),durationMin:Number((r.duration/60).toFixed(0)),steps,source:"OpenStreetMap + OSRM"};
  routeCache.set(cacheKey,result);return result;
}

function currentStepName(route,progress){
  if(!route?.steps?.length)return "En route";
  const i=Math.min(route.steps.length-1,Math.floor(progress*route.steps.length));
  return route.steps[i].name||"En route";
}
function etaFrom(seconds){return new Date(Date.now()+Math.max(0,seconds)*1000).toISOString()}

app.get("/api/health",(req,res)=>res.json({ok:true,service:"backend",time:new Date().toISOString()}));
app.get("/api/drivers",(req,res)=>res.json(drivers));
app.get("/api/jobs",(req,res)=>res.json(jobs));
app.get("/api/bookings",(req,res)=>res.json(bookings));
app.get("/api/route",async(req,res)=>{try{if(!req.query.from||!req.query.to)return res.status(400).json({error:"from and to are required"});res.json(await buildRoute(req.query.from,req.query.to))}catch(e){res.status(500).json({error:e.message})}});
app.post("/api/predict-delay",async(req,res)=>{
  const distance=Math.max(1,Number(req.body.distance_km||1));
  const traffic=Math.min(10,Math.max(0,Number(req.body.traffic||0)));
  const weather=Math.min(10,Math.max(0,Number(req.body.weather||0)));
  const history=Math.max(0,Number(req.body.history_delay||0));
  const expected=req.body.expected_time||null;
  const tripStatus=String(req.body.trip_status||"");

  // IMPORTANT: this endpoint is now a LIVE delay monitor.
  // A high traffic/weather score alone must NOT create a delay.
  // A delay is reported only when an active trip has actually passed its expected delivery time.
  let liveLateMinutes=0;
  if(tripStatus==="In Transit" && expected){
    const m=/^(\d{2}):(\d{2})$/.exec(expected);
    if(m){
      const target=new Date();
      target.setHours(Number(m[1]),Number(m[2]),0,0);
      liveLateMinutes=Math.max(0,Math.floor((Date.now()-target.getTime())/60000));
    }
  }

  try{
    const ml=await fetch("http://127.0.0.1:8000/predict-delay",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({distance_km:distance,traffic,weather,history_delay:history,expected_time:expected,trip_status:tripStatus,live_late_minutes:liveLateMinutes})});
    if(ml.ok){
      const data=await ml.json();
      if(tripStatus==="In Transit" && liveLateMinutes<=0){
        return res.json({...data,predicted_delay_minutes:0,delay_probability:0,new_estimated_delivery:expected,status:"On time",live_delay:false,source:"Random Forest + live deadline monitor"});
      }
      if(tripStatus==="In Transit" && liveLateMinutes>0){
        const now=new Date();
        return res.json({...data,predicted_delay_minutes:liveLateMinutes,delay_probability:1,new_estimated_delivery:now.toTimeString().slice(0,5),status:"Delay expected",live_delay:true,source:"Random Forest + live deadline monitor"});
      }
      return res.json({...data,live_delay:false,source:"Random Forest ML service"});
    }
  }catch(e){}

  // Fallback follows the same live rule when the ML service is unavailable.
  if(tripStatus==="In Transit" && liveLateMinutes<=0){
    return res.json({predicted_delay_minutes:0,delay_probability:0,new_estimated_delivery:expected,expected_delivery:expected,route_condition:traffic>=8?"High risk":traffic>=5?"Moderate":"Good",status:"On time",model:"Live deadline monitor (ML service unavailable)",live_delay:false,source:"Backend live monitor"});
  }
  if(tripStatus==="In Transit" && liveLateMinutes>0){
    const now=new Date();
    return res.json({predicted_delay_minutes:liveLateMinutes,delay_probability:1,new_estimated_delivery:now.toTimeString().slice(0,5),expected_delivery:expected,route_condition:traffic>=8?"High risk":traffic>=5?"Moderate":"Good",status:"Delay expected",model:"Live deadline monitor (ML service unavailable)",live_delay:true,source:"Backend live monitor"});
  }

  const congestion=Math.max(0,traffic-2);
  const distanceRisk=Math.max(0,(distance-80)/35);
  const weatherRisk=weather*1.4;
  const historyRisk=history*0.22;
  const minutes=Math.max(0,Math.round(distanceRisk*0.9+congestion*2.4+weatherRisk+historyRisk));
  const probability=Math.min(0.97,Math.max(0.05,0.08+traffic*0.055+weather*0.04+Math.min(history,60)*0.006+Math.min(distance,700)*0.00035));
  let eta=null;
  if(expected){const m=/^(\d{2}):(\d{2})$/.exec(expected);if(m){const d=new Date();d.setHours(Number(m[1]),Number(m[2]),0,0);d.setMinutes(d.getMinutes()+minutes);eta=d.toTimeString().slice(0,5);}}
  res.json({predicted_delay_minutes:minutes,delay_probability:Number(probability.toFixed(2)),new_estimated_delivery:eta,expected_delivery:expected,route_condition:traffic>=8?"High risk":traffic>=5?"Moderate":"Good",status:minutes>0?"Delay expected":"On time",model:"AI operational risk fallback (ML service unavailable)",source:"Backend fallback",live_delay:false});
});
app.get("/api/admin/summary",(req,res)=>{const today=new Date().toISOString().slice(0,10);const todayBookings=bookings.filter(b=>b.createdAt?.slice(0,10)===today);res.json({totalBookings:bookings.length,bookingsToday:todayBookings.length,activeTrips:bookings.filter(b=>b.status==="In Transit").length,delivered:bookings.filter(b=>b.status==="Delivered").length,openJobs:jobs.filter(j=>j.status==="Open").length,driversTaken:todayBookings.map(b=>({bookingId:b.id,driverId:b.driverId,driverName:b.driverName,route:`${b.pickup} → ${b.delivery}`,status:b.status,createdAt:b.createdAt}))})});
app.get("/api/bookings/:id",(req,res)=>{const b=bookings.find(x=>x.id===req.params.id);if(!b)return res.status(404).json({error:"Booking not found"});res.json(b)});

app.post("/api/jobs",(req,res)=>{const body=req.body;if(!body.pickup||!body.delivery||!body.goods)return res.status(400).json({error:"Pickup, delivery and goods are required"});const job={id:"J"+Math.floor(1000+Math.random()*9000),industry:body.industry||"Demo Industry",pickup:String(body.pickup).trim(),delivery:String(body.delivery).trim(),goods:body.goods,weight:Number(body.weight||0),budget:Number(body.budget||0),vehicleType:body.vehicleType||"Truck",date:body.date||"",status:"Open",createdAt:new Date().toISOString(),distanceKm:estimateDistance(body.pickup,body.delivery)};jobs.unshift(job);io.emit("job:new",job);res.status(201).json(job)});

app.post("/api/match-drivers",(req,res)=>{const {from,to,goods="General Cargo",weight=0,vehicleType="Truck"}=req.body;if(!from||!to)return res.status(400).json({error:"From and To locations are required"});const requestedType=normalize(vehicleType);const list=drivers.map(d=>{let score=45;if(requestedType===normalize(d.vehicleType))score+=28;if(d.capacity>=Number(weight||0))score+=16;if(normalize(d.home)===normalize(from))score+=8;score+=d.rating*2;return {...d,matchScore:Number(Math.min(99,score).toFixed(1)),route:`${from} → ${to}`,goods}}).sort((a,b)=>b.matchScore-a.matchScore).slice(0,5);res.json({from,to,goods,matchedDrivers:list})});
app.post("/api/jobs/:id/match",(req,res)=>{const job=jobs.find(x=>x.id===req.params.id);if(!job)return res.status(404).json({error:"Job not found"});const list=drivers.map(d=>{let score=40;if(normalize(d.vehicleType)===normalize(job.vehicleType))score+=30;if(d.capacity>=Number(job.weight||0))score+=18;if(normalize(d.home)===normalize(job.pickup))score+=8;score+=d.rating*2;return {...d,matchScore:Number(Math.min(99,score).toFixed(1)),route:`${job.pickup} → ${job.delivery}`}}).sort((a,b)=>b.matchScore-a.matchScore).slice(0,5);res.json({job,matchedDrivers:list})});

app.post("/api/bookings",(req,res)=>{const {jobId,driverId}=req.body;const job=jobs.find(x=>x.id===jobId),driver=drivers.find(x=>x.id===driverId);if(!job||!driver)return res.status(404).json({error:"Job or driver not found"});const booking={id:"B"+Date.now().toString().slice(-7),jobId,driverId,driverName:driver.name,pickup:job.pickup,delivery:job.delivery,goods:job.goods,vehicleType:driver.vehicleType,status:"Confirmed",startTime:null,endTime:null,createdAt:new Date().toISOString(),payment:{status:"Pending",amount:Number(job.budget||0)},distanceKm:job.distanceKm||estimateDistance(job.pickup,job.delivery)};bookings.unshift(booking);job.status="Booked";io.emit("booking:confirmed",booking);res.status(201).json(booking)});

app.post("/api/bookings/:id/route",async(req,res)=>{const b=bookings.find(x=>x.id===req.params.id);if(!b)return res.status(404).json({error:"Booking not found"});try{const route=req.body.route?.geometry?req.body.route:await buildRoute(b.pickup,b.delivery);b.route=route;b.distanceKm=route.distanceKm;res.json(route)}catch(e){res.status(500).json({error:e.message})}});

app.post("/api/bookings/:id/start",async(req,res)=>{const b=bookings.find(x=>x.id===req.params.id);if(!b)return res.status(404).json({error:"Booking not found"});if(b.status==="Delivered")return res.status(400).json({error:"This trip is already completed"});let route=req.body.route?.geometry?req.body.route:b.route;try{if(!route)route=await buildRoute(b.pickup,b.delivery)}catch(e){return res.status(500).json({error:e.message})}b.route=route;b.distanceKm=route.distanceKm;b.status="In Transit";b.startTime=new Date().toISOString();b.expectedDeliveryTime=new Date(Date.now()+Math.max(60,Math.round(Math.min(7200,route.durationMin*60)))*1000).toISOString();tracking[b.id]={bookingId:b.id,progress:0,distanceKm:0,totalDistanceKm:route.distanceKm,lat:route.start.lat,lng:route.start.lng,currentLocation:b.pickup,speedKmh:0,eta:b.expectedDeliveryTime,timestamp:new Date().toISOString(),route,gpsMode:false};io.emit("trip:started",b);io.to("tracking:"+b.id).emit("tracking:update",tracking[b.id]);res.json(b)});

app.post("/api/bookings/:id/gps",(req,res)=>{const b=bookings.find(x=>x.id===req.params.id),pos=tracking[b?.id];if(!b||!pos)return res.status(404).json({error:"Active trip not found"});const {lat,lng,speedKmh=0}=req.body;pos.lat=Number(lat);pos.lng=Number(lng);pos.speedKmh=Number(speedKmh||0);pos.gpsMode=true;pos.currentLocation="Device GPS";pos.timestamp=new Date().toISOString();io.to("tracking:"+b.id).emit("tracking:update",pos);res.json(pos)});

app.post("/api/bookings/:id/complete", (req,res) => {
  const b=bookings.find(x=>x.id===req.params.id);
  if(!b) return res.status(404).json({error:"Booking not found"});
  b.status="Delivered";
  b.endTime=new Date().toISOString();
  b.payment.status="Paid";
  if(tracking[b.id]){
    tracking[b.id].progress=1;
    tracking[b.id].distanceKm=tracking[b.id].totalDistanceKm;
    tracking[b.id].currentLocation=b.delivery;
    tracking[b.id].speedKmh=0;
    tracking[b.id].gpsMode=false;
    const g=tracking[b.id].route?.geometry?.at(-1);
    if(g){ tracking[b.id].lng=g[0]; tracking[b.id].lat=g[1]; }
    io.to("tracking:"+b.id).emit("tracking:update",tracking[b.id]);
  }
  io.emit("trip:completed",b);
  res.json(b);
});
app.get("/api/tracking/:id",(req,res)=>res.json(tracking[req.params.id]||null));

io.on("connection",socket=>socket.on("join:tracking",bookingId=>socket.join("tracking:"+bookingId)));

// Demo tracking follows the real road geometry for several minutes instead of jumping across a straight line.
setInterval(()=>{Object.entries(tracking).forEach(([bookingId,pos])=>{const b=bookings.find(x=>x.id===bookingId);if(!b||b.status!=="In Transit"||pos.gpsMode)return;const step=0.005;const progress=Math.min(1,Number(pos.progress||0)+step);const geometry=pos.route?.geometry||[];const idx=Math.min(Math.max(0,geometry.length-1),Math.floor(progress*Math.max(0,geometry.length-1)));const point=geometry[idx]||[pos.route.end.lng,pos.route.end.lat];const distance=Math.round(pos.totalDistanceKm*progress*10)/10;const speed=Math.round(48+Math.random()*20);const remaining=pos.totalDistanceKm-distance;const demoSeconds=Math.max(15,Math.round((remaining/Math.max(1,speed))*3600/2));const next={...pos,progress,distanceKm:distance,lat:point[1],lng:point[0],speedKmh:progress<1?speed:0,eta:etaFrom(progress<1?demoSeconds:0),currentLocation:progress>=0.99?b.delivery:currentStepName(pos.route,progress),timestamp:new Date().toISOString()};tracking[bookingId]=next;io.to("tracking:"+bookingId).emit("tracking:update",next)})},2000);

const PORT=5000;httpServer.listen(PORT,()=>console.log(`Backend running on http://localhost:${PORT}`));
