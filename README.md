# 🚀 LocalDeck

Dashboard หน้าเดียวสำหรับควบคุมทุก local service ในเครื่อง — เหมือน Render/Railway แต่ทุกอย่างรันบนเครื่องเราเอง

## Features

- 🟢 การ์ดต่อ service: สถานะ real-time (running / starting / stopped / crashed / external)
- ▶ ■ ↻ Start / Stop / Restart (kill ทั้ง process tree ไม่มี port ค้าง)
- 📄 Logs แบบ real-time ผ่าน WebSocket (เก็บย้อนหลัง 1,000 บรรทัด/service)
- 📊 CPU / 🧠 RAM ของทั้ง process tree อัพเดตทุก 3 วิ
- 🌐 Open browser / 📂 Open folder / `</>` เปิดใน VS Code
- 🔌 Ports panel: เห็นทุก TCP port ที่ listen อยู่ในเครื่อง พร้อมชื่อ process และปุ่ม kill
- ตรวจจับ service ภายนอก: ถ้า port ของ service ถูกเปิดโดย process อื่น (เช่น Redis ที่รันเองอยู่แล้ว) การ์ดจะโชว์เป็น "Running (external)"

## เริ่มใช้งาน

ต้องมี **Node.js 18+** และรันบน **Windows** (ดูหมายเหตุด้านล่าง)

```bash
git clone <repo-url>
cd LocalDeck
npm install       # ติดตั้งทั้ง server + client (npm workspaces)
npm run dev
```

แล้วเปิด **http://localhost:5199**

- Backend API + WebSocket: port `4600` (เปลี่ยนได้ด้วย env `LOCALDECK_PORT`)
- กด **+ Add Service** → ใส่ชื่อ, โฟลเดอร์โปรเจค (กด **Browse** เลือกจาก dialog ได้), คำสั่งรัน (เช่น `npm run dev`), port

ทะเบียน service เก็บอยู่ที่ `server/data/services.json` (แก้มือได้)

## โครงสร้าง

```
server/   Node.js + Express + ws — จัดการ process, scan port (netstat + CIM), เก็บ logs
client/   React + Vite + TypeScript + Tailwind — dashboard UI
```

## หมายเหตุ

- ออกแบบมาสำหรับ **Windows** (ใช้ netstat / PowerShell CIM / taskkill ผ่าน tree-kill)
- ปิด LocalDeck server (Ctrl+C) จะ stop ทุก service ที่สั่งรันผ่านมันให้อัตโนมัติ
