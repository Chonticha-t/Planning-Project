# Planning-project

เว็บระบบบริหารและติดตามแผนการผลิต (Production Planning System) ดึงและจัดการข้อมูลแผนผลิตจากตารางใน Schema `planning` (Database `smart` บน PostgreSQL `10.17.87.244`)

```
Django (smartfactory) planning_plan  ──เขียนข้อมูลรอบปกติ──►  PostgreSQL (DB: smart)
                                                               │ SELECT / UPDATE
                                                               ▼
                                     Backend-planning (Node.js + Express @ Port 3001)
                                       Prefix: /api_p1, /api_p1/planning
                                                               │ JSON API
                                                               ▼
                                     Frontend-planning (React 19 + Vite @ Port 5173)
                                       Base URL: /planning
```

---

## 📁 โครงสร้างโปรเจกต์ (Project Structure)

```text
Planning-project/
├── Backend-planning/                 # REST API Service (Node.js + Express)
│   ├── bin/www                       # Server startup (Port 3001)
│   ├── app.js                        # Express app config, Middlewares, API prefix
│   ├── Config/Main/planning/         # Route aggregators
│   │   └── planning.js               # รวม Router ย่อยของระบบ Planning ทั้งหมด
│   ├── routes/                       # Endpoints & Business Logic
│   │   ├── index.js                  # Root router สำหรับ /api_p1
│   │   └── 10.17.87.244/             # Database connection & โมดูลหลัก
│   │       ├── config.js             # PostgreSQL Connection Pool (`pool_smart`)
│   │       └── Planning System/      # โมดูลฟังก์ชันหลัก:
│   │           ├── Auth/             # สิทธิ์ผู้ใช้งาน & Planner Verification
│   │           ├── Capacity Leveling/# เกลี่ยกำลังการผลิต (History, Presence, Save Plan)
│   │           ├── Forecast/         # พยากรณ์ความต้องการผลิต
│   │           ├── Planning In Gate/ # จัดลำดับคิว In Gate, Finished วันนี้, สรุปรายเดือน, Routing
│   │           ├── Planning Summary/ # สรุปแผนภาพรวม
│   │           ├── Planning Summary Gate/ # แผนระดับ Gate (Cache & Performance)
│   │           ├── SO Balance/       # ตรวจสอบยอดคงค้าง Sales Order
│   │           └── WorkingDayCalendar/# จัดการวันทำงานและปฏิทินโรงงาน
│   ├── docs/                         # เอกสารระบบ Cache & Performance
│   ├── test/                         # Test suites (รันด้วย Node Test Runner)
│   └── .env                          # การตั้งค่าพอร์ตและข้อมูลเชื่อมต่อฐานข้อมูล
│
└── Frontend-planning/                # Web Application (React 19 + TypeScript + Vite)
    ├── src/
    │   ├── main.tsx & App.tsx        # Entry point, Theme sync (DaisyUI + MUI)
    │   ├── routes/
    │   │   ├── config.tsx            # ลงทะเบียนเส้นทางหน้าเว็บและเมนู Sidebar ทั้งหมด
    │   │   └── AppRoutes.tsx         # Route router & Navigation guards
    │   ├── pages/                    # หน้าจอหลักของระบบ
    │   │   ├── SO_Balance/           # [Default] หน้า SO Balance ตรวจสอบยอดคงเหลือ
    │   │   ├── Forecast/             # หน้าวิเคราะห์และจัดการ Forecast
    │   │   ├── Capacity_Leveling/    # หน้าเกลี่ยกำลังการผลิต (Release Board & Timeline)
    │   │   ├── Machine_Loading/      # หน้าวิเคราะห์ภาระงานเครื่องจักร
    │   │   ├── Planning_In_Gate/     # หน้าติดตามงาน In-Gate และ Routing
    │   │   ├── Planning_Summary/     # หน้าสรุปภาพรวมแผนการผลิต
    │   │   └── Planning_Summary_Gate/# หน้าสรุปแผนการผลิตจำแนกตาม Gate
    │   ├── components/               # Common UI Components (Modal, Confirm, Watermark)
    │   ├── context/                  # State กลาง (AuthContext ฯลฯ)
    │   ├── Layout/                   # Layout หลัก (Sidebar Drawer, Header, Navigation)
    │   └── utils/ (utility/)         # Helper functions, Excel Export, API config
    ├── .env                          # VITE_API_BASE_URL สำหรับชี้ไปยัง Backend
    └── package.json                  # Frontend Dependencies
```

---

## 🗂️ โครงสร้างเมนู Sidebar (Left Drawer Menu)

ใน [Frontend-planning/src/routes/config.tsx](file:///c:/Users/Jinda.I/Desktop/Planning-project/Frontend-planning/src/routes/config.tsx) เมนูด้านซ้ายแบ่งเป็น 2 กลุ่มหลัก:

```text
▼ CAPACITY
  ├─ FORECAST                 # วิเคราะห์และติดตามยอดพยากรณ์ความต้องการผลิต
  └─ MACHINE LOADING          # ภาระงานและการจัดสรรเครื่องจักร

▼ PLANNING SYSTEM
  ├─ SO BALANCE               # [Default] ตรวจสอบยอดคำสั่งซื้อและสต็อก F/G คงเหลือ
  ├─ PLANNING SUMMARY         # สรุปภาพรวมแผนและจับคู่ Due Date กับ WIP
  ├─ GATE SUMMARY             # แผนการผลิตราย Gate (Flow & Must-Out)
  ├─ CAPACITY LEVELING ⭐     # บอร์ดเกลี่ยโหลด 28 วัน, จัดกะ และบันทึกแผน (Save Plan)
  └─ PLANNING IN GATE         # ติดตามงานสแกนจริงหน้างานเทียบกับแผน
```

---

## 🖥️ การทำงานของแต่ละหน้า (Page Functionality & Workflows)

```text
[Forecast] ─────────────► [SO Balance] ──────────► [Planning Summary]
พยากรณ์ยอดสั่งซื้อ           เทียบยอดขายกับสต็อก F/G         จับคู่ Due Date กับ WIP
                                                            │
                                                            ▼
[Planning In Gate] ◄── [Summary Gate] ◄── [Capacity Leveling] ⭐
ติดตามงานสแกนจริงหน้างาน     ดูงานเข้า-ออกแต่ละ Gate        เกลี่ยโหลดลงกะ & บันทึกแผน
```

### 1. หน้า SO Balance (`/planning/so_balance`) — หน้าหลัก (Default Page)
* **หน้าที่หลัก**: ตรวจสอบยอดคำสั่งซื้อจากลูกค้า (Sales Order / PO Balance) เทียบกับสต็อกสินค้าสำเร็จรูป (F/G) และสินค้าที่ยังไม่เคลื่อนไหว (Unmovement) เพื่อคำนวณจำนวนชิ้นงานที่ต้องผลิตเพิ่มจริง (**Net Required**)
* **ฟังก์ชันสำคัญ**:
  * **Summary Cards**: การ์ดแสดงภาพรวม Total PO Balance, Unmovement, สินค้า F/G พร้อมมูลค่าในคลัง
  * **SO Balance Table (MUI DataGrid)**: ตารางแสดงรายการพร้อมจัดกลุ่มสต็อก (Inventory Group), สถานะ (Completed / Pending), และคำนวณวันคงเหลือ (Day Left)
  * **Exchange Rate Modal**: ดูและคำนวณมูลค่ายอดสั่งซื้อตามอัตราแลกเปลี่ยนสกุลเงิน (JPY, USD, THB)
  * **SO Balance History Modal**: ตรวจสอบประวัติการเปลี่ยนแปลงของแต่ละรายการคำสั่งซื้อ
  * **Export to Excel**: ส่งออกตารางแผนคำสั่งขายเป็นไฟล์ Excel พร้อมจัดรูปแบบตัวเลขและสีสวยงาม

---

### 2. หน้า Forecast (`/planning/forecast`)
* **หน้าที่หลัก**: ติดตามและวิเคราะห์ยอดพยากรณ์ความต้องการผลิต (Demand Forecast) ล่วงหน้ารายสัปดาห์ (Weekly) เพื่อใช้วางแผนเตรียมวัตถุดิบและกำลังคน
* **ฟังก์ชันสำคัญ**:
  * **Filter Bar**: กรองตาม Process/Category (Single / Multi / Rigid), กรองรายชื่อลูกค้า, เลือกหน่วยแสดงผล (Pcs, Sheet, Panel, Amount)
  * **Forecast Chart (ECharts/Recharts)**: กราฟแท่งและเส้นแสดงแนวโน้มความต้องการผลิตแต่ละสัปดาห์ (แยกสีตามกลุ่มลูกค้าหรือกลุ่มผลิตภัณฑ์)
  * **Customer Mix**: แสดงสัดส่วนเปอร์เซ็นต์ของลูกค้ารายใหญ่ (Top Customers)
  * **Forecast Matrix Table**: ตารางแจกแจงยอดพยากรณ์รายสัปดาห์ พร้อมฟังก์ชัน Expand/Collapse เพื่อเปิดดูลึกถึงระดับรายชื่อ Part ภายใต้ลูกค้าแต่ละราย

---

### 3. หน้า Capacity Leveling (`/planning/capacity_leveling`) ⭐
* **หน้าที่หลัก**: หน้าจอหัวใจหลักสำหรับ Planner ในการจัดตารางและเกลี่ยกำลังการผลิต (Capacity Balancing) ภายในช่วง 28 วันข้างหน้า เพื่อป้องกันปัญหาไลน์ผลิตโอเวอร์โหลด (Overload) หรือไลน์ว่าง (Underload)
* **ฟังก์ชันสำคัญ**:
  * **Release Board (Kanban / Timeline)**: การ์ดล็อตงาน (Lot Cards) แสดงตามวันและ Gate สามารถคลิกดูรายละเอียด, ย้ายวันผลิต (Move Date), จัดลำดับการปล่อยงาน และล็อกล็อต
  * **Gate Load Grid**: ตารางแสดงเปอร์เซ็นต์การใช้กำลังการผลิต (Occupancy %) ของแต่ละ Gate พร้อมแถบสีแจ้งเตือนเมื่อโหลดเกินกำลังเครื่องจักร
  * **Shift Allocation**: จัดสรรงานลงกะการทำงาน (Shift A / Shift B / Shift C) และคิดคำนวณชั่วโมง OT
  * **Editing Presence (Realtime Sync)**: แจ้งเตือนเมื่อมี Planner ท่านอื่นกำลังเปิดหรือแก้ไขแผนงานหน้านี้พร้อมกัน ป้องกันการบันทึกทับซ้อน
  * **Capacity Settings Modal**: ปรับแต่งค่าจำนวนพนักงาน (Manpower), จำนวนเครื่องจักร, วันหยุดโรงงาน, และเวลาพักของแต่ละ Gate
  * **Save Plan & Version History**: บันทึกแผนเป็นเวอร์ชันใหม่ (สร้าง Snapshot ทั้งกระดาน) และสามารถย้อนดูประวัติแผนย้อนหลัง 28 วันผ่านปุ่ม `Plan v… · saved`

---

### 4. หน้า Planning Summary (`/planning/planning_summary`)
* **หน้าที่หลัก**: สรุปความคืบหน้าของแผนการผลิตแต่ละผลิตภัณฑ์ เทียบกับสถานะงานระหว่างทำ (WIP) จริงในสายการผลิต และกำหนดส่งมอบ (Target Ship Date)
* **ฟังก์ชันสำคัญ**:
  * **Summary KPI Cards**: การ์ดแสดงสถานะ เช่น จำนวนล็อตทั้งหมด, ล็อตที่ตรงเวลา (On Schedule), ล็อตที่มีความเสี่ยงล่าช้า (Delayed)
  * **Planning Summary Table**: ตารางจับคู่ความต้องการผลิตกับ WIP ล็อตจริง แสดงลำดับความสำคัญ (Priority) และวันที่ต้องส่งออกไปยัง P1
  * **WIP Assign Modal**: ผู้ใช้วางแผนสามารถคลิก Assign / Unassign ล็อตงานระหว่างทำ (WIP) เข้ากับ Due Date หรือเลือกข้าม (Skip Lot) ได้ทันที

---

### 5. หน้า Gate Summary (`/planning/planning_summary_gate` หรือ `/planning/gate_summary`)
* **หน้าที่หลัก**: ติดตามแผนการผลิตแบบเจาะจงราย Gate (เช่น Gate เตรียมวัตถุดิบ, Gate ประกอบ, Gate ทดสอบ, Gate บรรจุ) เพื่อควบคุมไม่ให้เกิดคอขวด (Bottleneck)
* **ฟังก์ชันสำคัญ**:
  * **Gate Flow Cards**: การ์ดแสดงขั้นตอนการไหลของงานผ่านแต่ละ Gate ในสายการผลิต
  * **Gate Matrix Table**: ตารางแสดงจำนวนชิ้นงาน/พาเนลที่ต้องไหลผ่านแต่ละ Gate รายวัน พร้อมระบบ Synchronized Horizontal Scroll เลื่อนตารางพร้อมกัน
  * **Gate Must-Out Chart**: กราฟแสดงจำนวนงานที่จำเป็นต้องผลักดันออกจาก Gate (Must-Out) ภายในแต่ละวัน
  * **Gate Action Table**: เมื่อคลิกที่เซลล์ใดๆ ในตาราง Matrix จะเปิดแสดงรายการล็อตงานทั้งหมดที่อยู่ใน Gate นั้น ณ วันดังกล่าว
  * **High-Performance Caching**: ระบบ Server Cache ช่วยให้ดึงข้อมูล Matrix ขนาดใหญ่ได้อย่างรวดเร็ว

---

### 6. หน้า Planning In Gate (`/planning/planning_in_gate`)
* **หน้าที่หลัก**: ตรวจสอบและเปรียบเทียบ "แผนการเข้า Gate ที่บันทึกไว้ (Saved Plan)" กับ "งานที่สแกนเสร็จจริงหน้างาน (Observed Gate Output Log)"
* **ฟังก์ชันสำคัญ**:
  * **Day View (Queue & Finished Today)**: ดูคิวงานประจำวันเปรียบเทียบกับงานที่สแกนเข้า/ออกหน้าไลน์จริงในวันนี้แบบ Real-time
  * **Month View (Monthly Summary)**: สรุปยอดผลผลิตสะสมรายเดือนของแต่ละ Gate เทียบกับเป้าหมายที่วางไว้
  * **TV Dashboard Mode**: ปุ่มสลับหน้าจอเป็นโหมด Fullscreen TV Display สำหรับเปิดบนจอมอนิเตอร์ในไลน์การผลิต
  * **Observed Lot Drawer**: ดูประวัติการสแกนของล็อตงานย้อนหลัง ว่าผ่านกระบวนการใดมาแล้วบ้าง

---

### 7. หน้า Machine Loading (`/planning/machine_loading`)
* **หน้าที่หลัก**: ติดตามภาระงานและการใช้ประโยชน์ของเครื่องจักร (Machine Workload & Utilization)
* **สถานะ**: โมดูลโครงสร้างพื้นฐาน (Under Construction) พร้อมรองรับการเชื่อมต่อกับฐานข้อมูลเครื่องจักรเพื่อวิเคราะห์ Downtime และ Machine Loading ในอนาคต

---

## 🚀 การติดตั้งและเริ่มต้นใช้งาน (Getting Started)

### 1. Backend-planning

```bash
cd Backend-planning
npm install
```

สร้างไฟล์ `.env` ในโฟลเดอร์ `Backend-planning/`:
```env
PORT=3001
POSTGRES_HOST_NAME_10_17_87_244=10.17.87.244
POSTGRES_PORTS_10_17_87_244=5432
POSTGRES_USER_NAME_10_17_87_244=your_username
POSTGRES_PASSWORD_10_17_87_244=your_password
POSTGRES_DATABASE_NAME_10_17_87_244=smart
```

เริ่มรัน Backend:
```bash
npm start                       # รันเซิร์ฟเวอร์ที่ http://localhost:3001
npm test                        # รันชุดทดสอบทั้งหมดด้วย Node Test Runner
```

### 2. Frontend-planning

```bash
cd Frontend-planning
npm install
```

สร้างไฟล์ `.env` ในโฟลเดอร์ `Frontend-planning/`:
```env
VITE_API_BASE_URL=http://localhost:3001/api_p1/planning
# หรือระบุเฉพาะ VITE_API_PORT=3001
```

เริ่มรัน Frontend:
```bash
npm run dev                     # รัน Frontend ที่ http://localhost:5173/planning/
npm run build                   # Build production สำหรับ deploy
```

---

## 🔌 API Endpoints Summary

Prefix หลักของ API: `/api_p1/planning`

| Module | Route Prefix | รายละเอียดหน้าที่ |
|---|---|---|
| **Auth** | `/auth` | ตรวจสอบสิทธิ์ผู้ใช้และสิทธิ์ระดับ Planner / Admin |
| **SO Balance** | `/` | ดึงข้อมูล SO Balance, อัตราแลกเปลี่ยน, ประวัติยอดคงเหลือ |
| **Planning Summary** | `/planning_summary` | ตารางสรุปภาพรวมแผน, Filter ตาม Product, WIP assign |
| **Summary Gate** | `/planning_summary_gate`| แผนการผลิตแยกตาม Gate, แผน Must-Out, Caching |
| **Capacity Leveling**| `/capacity_leveling` | เกลี่ยโหลดตามกะ, ล็อกการ์ด, บันทึกแผน, ตรวจสอบ Presence |
| **Forecast** | `/forecast` | ข้อมูลพยากรณ์ความต้องการผลิต, Customer Mix, Summary Cards |
| **In-Gate Routing** | `/capacity_leveling/in_gate` | ข้อมูล Routing Window, Finished Today, สรุปรายเดือน |

---

## 📜 ประวัติเวอร์ชัน Save Plan (Plan History Migration)

ก่อนใช้งานฟีเจอร์ **Plan History** ในหน้า Capacity Leveling ให้รัน Migration เพื่อเตรียม Schema:

### ทางเลือกที่ 1: รันคำสั่ง Node (แนะนำสำหรับทีม Node.js)
```powershell
cd Backend-planning
npm run migrate:plan-history
```
*คำสั่งนี้จะใช้ Connection จาก `Backend-planning/.env` รันสคริปต์ `migrations/20261112_work_plan_history.sql` สามารถรันซ้ำได้อย่างปลอดภัยโดยไม่ลบแผนเดิม*

### ทางเลือกที่ 2: รันผ่านคำสั่ง Django
นำไฟล์ [planning_in_gate_test.py](Backend-planning/database_setup/planning_in_gate_test.py) ไปแทนไฟล์ในโปรเจกต์ Django แล้วรัน:
```powershell
python manage.py planning_in_gate_test --database <alias>
```

### การใช้งาน Plan History ในระบบ
* **ป้ายแสดงเวอร์ชัน**: กดป้าย `Plan v… · saved` ในหน้า Capacity Leveling เพื่อเปิดหน้าต่างประวัติ (เรียงเวอร์ชันล่าสุดลงมา ครั้งละ 50 เวอร์ชัน)
* **View (ดูแผน)**: ตรวจสอบรายการปรับวันและลำดับงานที่บันทึกไว้ใน Snapshot (บันทึกช่วง 28 วัน) โดยไม่กระทบแผนปัจจุบัน
* **Soft Delete**: ลบประวัติเวอร์ชันเก่าได้เฉพาะผู้ใช้ที่มีสิทธิ์ Admin โดยระบบจะบันทึก `deleted_at` และ `deleted_by` ไว้
* **API เส้นประวัติ** (`/api_p1/planning/capacity_leveling`):
  * `GET /plans?before=<version>` : ดึงรายการประวัติ
  * `GET /plans/:planId` : ดึงข้อมูล Snapshot ฉบับเต็ม
  * `DELETE /plans/:planId` : ซ่อนประวัติเวอร์ชันเก่า
