# 🌱 Plant Manager PWA

**Next.js + Google Sheets + Offline Sync Architecture**

---

## 📦 Project Structure

```
src/
├── app/
│   ├── layout.tsx                  # Root layout (PWA manifest, SyncProvider, BottomNav)
│   ├── page.tsx                    # Dashboard — counts from IndexedDB
│   ├── globals.css                 # Tailwind + theme variables
│   ├── plants/page.tsx             # Thêm / xem danh sách cây
│   ├── platforms/page.tsx          # Thêm / xem / xoá platform
│   ├── placement/page.tsx          # Gán cây vào platform (có validate)
│   ├── search/page.tsx             # Tìm cây theo tên
│   └── api/
│       ├── plants/route.ts         # GET + POST plants
│       ├── platforms/route.ts      # GET + POST + DELETE platforms
│       └── plant-locations/route.ts # POST (có validate tồn kho + sức chứa)
├── components/
│   ├── BottomNav.tsx               # Bottom tab navigation (mobile)
│   └── SyncProvider.tsx            # Khởi chạy sync worker
├── lib/
│   ├── db.ts                       # IndexedDB setup (Dexie.js)
│   ├── sheets.ts                   # Google Sheets client (conditional)
│   └── sync.ts                     # Sync engine (queue → API → retry)
public/
└── manifest.json                   # PWA manifest
```

---

## 🎯 Mục tiêu

Xây dựng một ứng dụng quản lý chậu cây:

- Chạy trên mobile như app native (PWA)
- Hoạt động offline (IndexedDB)
- Đồng bộ dữ liệu với Google Sheets khi có env vars
- Dễ mở rộng và maintain

---

## 🚀 Getting Started

### Cài đặt

```bash
npm install
```

### Chạy development

```bash
npm run dev
```

### Kết nối Google Sheets (tuỳ chọn)

Tạo file `.env.local`:

```env
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-email@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEET_ID=your-sheet-id
```

Nếu **không có env vars**, app hoạt động hoàn toàn offline với IndexedDB.

---

## 🧭 Tổng quan kiến trúc

### High-level Architecture

```
┌──────────────────────────┐
│        Client (PWA)      │
│  Next.js + React UI      │
│                          │
│  - UI Layer              │
│  - React Hooks (state)   │
│  - IndexedDB (local DB)  │
│  - Sync Queue            │
└────────────┬─────────────┘
             │
             │ HTTP (API Routes)
             ▼
┌──────────────────────────┐
│     Next.js Backend      │
│      (API Routes)        │
│                          │
│  - Validation Layer      │
│  - Business Rules        │
│  - Google Sheets Client  │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│     Google Sheets        │
│     (Primary Storage)    │
└──────────────────────────┘
```

---

## 🧱 Kiến trúc chi tiết

### 1. Client Layer (PWA)

- UI: React + Tailwind CSS
- State management: React hooks
- IndexedDB: Dexie.js (local database)
- Sync Queue: offline actions queue
- Bottom navigation (mobile-first)

### 2. Local Data Layer (IndexedDB)

#### `plants`

```json
{
  "id": "string",
  "name": "string",
  "total_quantity": "number",
  "image_url": "string"
}
```

#### `platforms`

```json
{
  "id": "string",
  "floor": "number",
  "side": "left | right",
  "name": "string",
  "capacity": "number"
}
```

#### `plant_locations`

```json
{
  "id": "string",
  "plant_id": "string",
  "platform_id": "string",
  "quantity": "number",
  "sort_order": "number",
  "color": "white | yellow | red"
}
```

For existing Supabase databases, apply `supabase-plant-locations-sort-order.sql` before relying on saved batch ordering.
Apply `supabase-plant-locations-color.sql` before using batch color markers.
Apply `supabase-plant-sales.sql` before using per-plant sale history.

#### `plant_sales`

```json
{
  "id": "string",
  "plant_id": "string",
  "quantity": "number",
  "created_at": "string"
}
```

#### `sync_queue`

```json
{
  "id": "string",
  "type": "CREATE | UPDATE | DELETE",
  "entity": "plant | platform | plant_location",
  "payload": "object",
  "status": "pending | syncing | failed",
  "retry_count": "number",
  "created_at": "timestamp"
}
```

### 3. Sync Engine

```
offline → write local IndexedDB → push vào sync_queue
online  → process queue → call API → success: xoá khỏi queue / fail: retry (max 5)
```

Sync worker chạy mỗi 30 giây + tự động sync khi thiết bị online trở lại.

### 4. Backend Layer (Next.js API)

- Validate dữ liệu
- Enforce business rules (constraint)
- Giao tiếp với Google Sheets
- Trả 503 nếu chưa cấu hình Google Sheets

### 5. Google Sheets Layer

- Single Source of Truth (khi online)
- Lưu trữ chính

---

## 📊 Data Schema (Google Sheets)

| Sheet             | Columns                             |
| ----------------- | ----------------------------------- |
| `plants`          | id, name, total_quantity, image_url |
| `platforms`       | id, floor, side, name, capacity     |
| `plant_locations` | id, plant_id, platform_id, quantity, sort_order, color |
| `plant_sales`     | id, plant_id, quantity, created_at  |

---

## 🔒 Business Rules

1. **Inventory Constraint**: `SUM(quantity WHERE plant_id) <= total_quantity`
2. **Platform Capacity**: `SUM(quantity WHERE platform_id) <= capacity`
3. **Validation**: Được enforce cả client-side (IndexedDB) và server-side (API)

---

## 🔁 Data Consistency Strategy

Google Sheets không có transaction / lock, nên dùng:

1. **Read → Validate → Write**: đọc data mới nhất → kiểm tra → ghi
2. **Idempotency**: Mỗi record có UUID → tránh duplicate khi retry
3. **Retry Strategy**: `retry_count < 5`, exponential backoff

---

## 🔌 API Design

| Method | Endpoint               | Mô tả                              |
| ------ | ---------------------- | ---------------------------------- |
| GET    | `/api/plants`          | Danh sách cây                      |
| POST   | `/api/plants`          | Tạo cây mới                        |
| GET    | `/api/platforms`       | Danh sách platform                 |
| POST   | `/api/platforms`       | Tạo platform mới                   |
| DELETE | `/api/platforms?id=x`  | Xoá platform                       |
| POST   | `/api/plant-locations` | Gán cây vào platform (có validate) |
| GET    | `/api/plant-sales`     | Danh sách lượt bán cây             |
| POST   | `/api/plant-sales`     | Lưu lượt bán cây                   |

---

## 📱 PWA Configuration

### Manifest

```json
{
  "name": "Plant Manager",
  "display": "standalone",
  "start_url": "/",
  "theme_color": "#0f172a"
}
```

---

## 🎨 UI Screens

1. **Dashboard** — Tổng quan số lượng cây, platform, placement, sync queue
2. **Plants** — Thêm và xem danh sách cây
3. **Platforms** — Cấu hình vị trí (tầng, bên, sức chứa)
4. **Placement** — Gán cây vào platform (dropdown + validate)
5. **Search** — Tìm cây theo tên, hiển thị vị trí đang đặt

Mobile-first: bottom navigation, full-width forms, large touch targets.

---

## ⚙️ Tech Stack

| Layer      | Technology                          |
| ---------- | ----------------------------------- |
| Framework  | Next.js 16 (App Router, TypeScript) |
| Styling    | Tailwind CSS v4                     |
| Local DB   | Dexie.js (IndexedDB)                |
| Backend DB | Google Sheets (googleapis)          |
| IDs        | UUID v4                             |

---

## 🔐 Security

- Không expose Google credentials ở client
- Tất cả API chạy server-side
- Validate input cả client và server

---

## 🚀 Deployment

- Vercel (recommended)
- Edge-compatible APIs (optional)

---

## ⚠️ Known Limitations

1. Không real-time sync
2. Có thể conflict khi nhiều user
3. Google Sheets latency
4. Chưa có PWA icons và service worker caching

---

## 🔮 Future Improvements

- Service worker + offline caching
- PWA icons
- Conflict resolution strategy
- WebSocket sync
- Migration sang PostgreSQL
- Role-based access
- Audit logs

---

## 🧪 Testing Strategy

- Unit test: validation logic
- Integration test: API + Sheets
- Manual test: offline/online flow

---

## 📌 Development Principles

- Offline-first
- Source of truth rõ ràng
- Idempotent APIs
- Minimal complexity

---

## ✅ Definition of Done

Một feature hoàn thành khi:

- Chạy được online + offline
- Sync đúng
- Không vi phạm constraint
- UI usable trên mobile

---

## 🧠 Ghi chú cho AI Agent / Developer

1. Không bypass validation layer
2. Không ghi trực tiếp vào Sheets từ client
3. Luôn update sync_queue nếu offline
4. Giữ idempotency cho mọi write API
5. Ưu tiên backward compatibility

## Supabase

```sql
create table if not exists plants (
  id text primary key,
  name text not null,
  total_quantity integer not null default 0,
  image_url text default ''
);

create table if not exists platforms (
  id text primary key,
  garden_id text,
  floor integer not null,
  name text not null,
  capacity integer not null default 0
);

create table if not exists plant_locations (
  id text primary key,
  plant_id text references plants(id) on delete cascade,
  platform_id text references platforms(id) on delete cascade,
  quantity integer not null,
  pot_size integer default 14,
  planted_date text default '',
  sort_order integer not null default 0,
  color text not null default 'white' check (color in ('white', 'yellow', 'red'))
);

create table if not exists plant_sales (
  id text primary key,
  plant_id text references plants(id) on delete cascade,
  quantity numeric not null check (quantity > 0),
  created_at timestamptz not null default now()
);

create table if not exists gardens (
  id text primary key,
  name text not null
);
```
