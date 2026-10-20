# Planning-project

เว็บแสดงแผนผลิตจากตาราง `planning.planning` (DB `smart` บน 10.17.87.244)
โครงสร้างอิงจาก `internship-project`

```
Django (smartfactory) planning_plan  ──เขียนทุก 1 ชม.──►  planning.planning
                                                              │ SELECT
                                                              ▼
                                     Backend-planning (Express, port 3001)
                                                              │ JSON
                                                              ▼
                                     Frontend-planning (React + Vite)
```

## Backend-planning

โครงสร้างแบบเดียวกับ `smart-backend-88-62`

| ไฟล์ | หน้าที่ |
|---|---|
| `routes/10.17.87.244/config.js` | connection pool `pool_smart` |
| `routes/10.17.87.244/smart/planning/planning/*.js` | 1 ไฟล์ = 1 endpoint |
| `Config/Main/planning/planning.js` | รวม router ของ planning |
| `app.js` | mount ที่ `/api_p1/planning` |

Endpoints

| Method | URL | Query |
|---|---|---|
| GET | `/api_p1/planning/table` | `status`, `prd_name`, `startdate`, `stopdate` (ไม่ส่งก็ได้) |
| GET | `/api_p1/planning/summary` | – |
| GET | `/api_p1/planning/distinct_product` | – |

รัน

```bash
cd Backend-planning
copy .env.example .env      
npm install
npm start                   # http://localhost:3001/api_p1/planning/table
```

## Frontend-planning

โครงสร้างแบบเดียวกับ `Frontend-production-status` (React 19 + Vite + TS + Tailwind/DaisyUI + MUI)

| ไฟล์ | หน้าที่ |
|---|---|
| `src/routes/config.tsx` | ลงทะเบียนหน้า (เพิ่มหน้าใหม่ที่นี่) |
| `src/Layout/LayoutDrawer/Drawer.Config/DrawerMenu.tsx` | เมนูด้านซ้าย |
| `src/pages/Planning/` | หน้า Production Plan (การ์ดสรุป, ตัวกรอง, ตาราง, Export Excel) |
| `.env` | `VITE_API_BASE_URL` ชี้ไปที่ Backend |

รัน

```bash
cd Frontend-planning
npm install
npm run dev                 # http://localhost:5173/planning/
```

## เพิ่มหน้าใหม่

1. Backend: สร้างไฟล์ใน `routes/10.17.87.244/smart/planning/<feature>/` แล้ว `app.use(...)` ใน `Config/Main/planning/planning.js`
2. Frontend: สร้างโฟลเดอร์ใน `src/pages/<Feature>/` แล้วเพิ่ม route ใน `src/routes/config.tsx`
