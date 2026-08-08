# Digital Desk — Business POS & Admin Dashboard
## Complete Project Context & Architecture Documentation

---

## 📌 Executive Summary
**Digital Desk** is a complete, mobile-first dual-PWA software suite engineered for modern retail businesses and Indian shopkeepers. It consists of:
1. **🛒 Simple POS App** (`/pos/`): Lightweight, mobile-first cashier application for logging sales, managing stock, checking out via Cash/UPI/Card, and quick 4-step photo product additions.
2. **📊 Admin Dashboard App** (`/admin/`): Dark-theme executive overview dashboard featuring live revenue metrics, Chart.js analytics, staff leave management, GST liability calculations, and printable PDF exports.
3. **⚙️ Express + Prisma Backend**: Multi-database REST API backend supporting zero-config SQLite locally and PostgreSQL on Railway production.

---

## 🏗️ Architecture & Technology Stack

- **Backend Framework**: Node.js + Express.js (`server/index.js`)
- **Database ORM**: Prisma ORM (`prisma/schema.prisma`)
  - **Local Database**: SQLite (`prisma/dev.db`)
  - **Production Database**: PostgreSQL (Railway Postgres Plugin)
- **Image Hosting CDN**: ImgBB API (`9dbce1b1652dba7256659033badba4fc`)
- **Frontend Technologies**: HTML5, Vanilla JavaScript (ES6+), TailwindCSS (CDN), Lucide Icons, Chart.js
- **PWA Capabilities**: Service Workers (`sw.js`), Web App Manifests (`manifest.json`), Apple Touch Icons, Standalone Display Mode, Safe Area Insets (`env(safe-area-inset-top)` for iPhone Dynamic Island).
- **Deployment Platform**: Railway (GitHub Repository: `buildandbeyondbusiness/digital-desk`)

---

## 📱 Web Applications Breakdown

### 1. 🛒 POS App (`/public/pos/`)
- **Path**: `/pos/`
- **Theme**: Light, clean iOS-inspired design (`#5D5FEF` accent).
- **Key Features**:
  - **Today's Revenue Card**: Live revenue tally for current day.
  - **Low Stock Alerts**: Displays items with stock $\le 5$ units with 1-tap jump to inventory.
  - **Product Inventory List**: Quick search bar, stock increment/decrement buttons (`+` / `-`), and item delete.
  - **Checkout Modal**:
    - Real-time product search filter (`pos-search-input`).
    - Multi-mode payment selector (**CASH**, **UPI**, **CARD**).
    - Live cart count and grand total calculations.
    - Automatic stock decrement and profit logging on checkout.
  - **Live Sync Badge**: Displays `Live Sync` (green pulsing dot), `Syncing...` (amber dot), or `Offline` (red dot).
  - **Offline Resilience**: Offline sales queue stored in `localStorage` with automatic sync upon reconnection.
  - **5-Second Auto Sync**: Periodically syncs stock counts from backend.

### 2. 📊 Admin Dashboard App (`/public/admin/`)
- **Path**: `/admin/`
- **Theme**: Dark theme `#0F1115` premium dashboard UI (`#5B8CFF` accent).
- **Key Features**:
  - **Metrics Cards**: Today's Revenue, Total Lifetime Sales, Low Stock Warnings.
  - **Indian Retail Financial Breakdown**:
    - **Gross Revenue (₹)**
    - **Estimated GST Liability (18%)**
    - **Net Profit (₹)**
    - **Net Profit Margin (%)**
  - **Interactive Chart.js Graphs**:
    - 📈 **7-Day Revenue Trend** (Line Chart)
    - 🍩 **Top Selling Products** (Doughnut Chart)
    - 💳 **Preferred Payment Mode** (UPI vs Cash vs Card Doughnut Chart)
    - ⏰ **Peak Sales Hours** (9 AM, 12 PM, 3 PM, 6 PM, 9 PM Bar Chart)
  - **Stock & Inventory Table**: Searchable table with buy price, sell price, stock units, photo previews, edit, and delete.
  - **Staff Management & Leaves**:
    - Employee roster cards with role and monthly salary.
    - Holiday balance tracking with increment/decrement.
    - Log leave date modal.
    - 📄 **Export Staff & Leaves PDF (`exportStaffPDF()`)**: Formatted printable PDF payroll statement generator.
  - **Settings & Reset**: Add product categories, development data reset (`POST /api/dev/reset-data`).

---

## 🪄 4-Step Product Creation Wizard (Handwritten Sketch Flow)
Both POS and Admin apps include a 4-step wizard for adding new inventory:
1. **Screen 1 (Photo Capture)**: Full-screen camera trigger / file picker.
2. **Screen 2 (Uploading)**: Centered animated spinner while base64 photo uploads to ImgBB CDN.
3. **Screen 3 (Details & Preview)**: Image thumbnail preview, Product Name input, Category dropdown, Buy Price, Sell Price, Stock Quantity.
4. **Screen 4 (Done)**: Full-screen green checkmark `✓` success screen, auto-closing after 1.5 seconds.
- **Duplicate Click Lock**: Protected with `isWizardSaving = true` flag and button disabling to prevent multiple submissions during network uploads.

---

## 🔌 API Endpoints Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Server healthcheck endpoint for Railway (returns `200 OK`) |
| `POST` | `/api/auth/login` | Master authentication login |
| `GET` | `/api/products` | Fetch all products with category info |
| `GET` | `/api/products/low-stock` | Fetch products with stock $\le 5$ |
| `POST` | `/api/products` | Create product (supports multipart photo upload or ImgBB base64) |
| `PUT` | `/api/products/:id` | Update product details or stock count |
| `DELETE` | `/api/products/:id` | Delete product (cleans up linked `saleItem` records first) |
| `GET` | `/api/categories` | Fetch category master list |
| `POST` | `/api/categories` | Create new product category |
| `DELETE` | `/api/categories/:id` | Delete product category |
| `GET` | `/api/sales/summary` | Today's revenue, total revenue, low stock count |
| `POST` | `/api/sales` | Log sale transaction, decrement stock, calculate profit |
| `GET` | `/api/sales/report` | Filtered sales transaction logs by date range |
| `GET` | `/api/analytics/charts` | Full analytics payload (trend, top products, payment modes, peak hours, financials) |
| `POST` | `/api/upload-image` | Upload base64 image to ImgBB CDN |
| `GET` | `/api/employees` | Fetch employee roster |
| `POST` | `/api/employees` | Add new employee |
| `PUT` | `/api/employees/:id/holidays` | Adjust employee leave balance |
| `POST` | `/api/employees/:id/leave` | Log employee leave date |
| `POST` | `/api/dev/reset-data` | Clear all database test records |

---

## 🗄️ Database Schema (`prisma/schema.prisma`)

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model Category {
  id        Int       @id @default(autoincrement())
  name      String    @unique
  createdAt DateTime  @default(now())
  products  Product[]
}

model Product {
  id         Int        @id @default(autoincrement())
  name       String
  category   Category   @relation(fields: [categoryId], references: [id])
  categoryId Int
  buyPrice   Float
  sellPrice  Float
  stock      Int        @default(0)
  photoUrl   String?
  createdAt  DateTime   @default(now())
  updatedAt  DateTime   @updatedAt
  saleItems  SaleItem[]
}

model Sale {
  id          Int        @id @default(autoincrement())
  soldAt      DateTime   @default(now())
  totalAmount Float
  totalProfit Float
  items       SaleItem[]
}

model SaleItem {
  id        Int     @id @default(autoincrement())
  sale      Sale    @relation(fields: [saleId], references: [id], onDelete: Cascade)
  saleId    Int
  product   Product @relation(fields: [productId], references: [id])
  productId Int
  quantity  Int
  unitPrice Float
  unitCost  Float
}
```

---

## 🚀 Railway Deployment Guide

1. **GitHub Repository**: `buildandbeyondbusiness/digital-desk`
2. **Railway Config**:
   - `railway.json`: `buildCommand` = `npm run build`, `startCommand` = `npm start`, `healthcheckPath` = `/health`.
   - Host Binding: `server/index.js` listens on `PORT` with host `'0.0.0.0'`.
   - Environment Variables: `DATABASE_URL` (linked to Railway PostgreSQL plugin), `PORT`.

---

## 📐 Mobile & PWA UX Enhancements Applied
- **Dynamic Island Padding**: `.header-safe-top` uses `padding-top: max(2.75rem, calc(env(safe-area-inset-top) + 0.5rem))` to ensure header controls sit below iPhone camera notches and Dynamic Islands.
- **Minimum 44px Touch Targets**: All interactive header buttons, inputs, and modal triggers enforce `min-w-[44px] min-h-[44px]` for effortless mobile touch handling.
- **Overscroll & Zoom Prevention**: `touch-action: manipulation` and `overscroll-behavior-y: contain` prevent mobile web rubber-banding and double-tap zoom delays.
