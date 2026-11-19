# SPMS v4.0 - New Machine Setup & Run Guide
### Student Placement Management System (IIT Madras)

Follow these exact steps when cloning or copying this project to a **new machine (Mac / Windows / Linux)** for the first time.

---

### 📋 Prerequisites (முன்நிபந்தனைகள்)
Ensure the new machine has:
1. **Node.js** (v18.0.0 or higher) - [Download Node.js](https://nodejs.org/)
2. **PostgreSQL** (v14 or higher) - [Download PostgreSQL](https://www.postgresql.org/download/)

---

### 🚀 Step-by-Step Setup

#### Step 1: Open Terminal and Navigate to Project
```bash
cd spms
```

#### Step 2: Install All Dependencies (Single Command)
Run this command to install packages for Root, Frontend (Client), and Backend (Server) in one shot:
```bash
npm run install:all
```

#### Step 3: Create Environment Configuration (`.env`)
```bash
cp .env.example .env
```
*(If your local PostgreSQL has a specific password, update `DATABASE_URL` in `.env` e.g., `postgresql://postgres:YOUR_PASSWORD@localhost:5432/spms`)*

#### Step 4: Start PostgreSQL & Create `spms` Database
* **On macOS:**
  ```bash
  brew services start postgresql@16
  createdb spms
  ```
* **On Windows:**
  Open Command Prompt / PowerShell:
  ```cmd
  createdb -U postgres spms
  ```
  *(Or right-click Databases -> Create -> Database named `spms` in pgAdmin 4)*
* **On Linux (Ubuntu/Debian):**
  ```bash
  sudo systemctl start postgresql
  sudo -u postgres createdb spms
  ```

#### Step 5: Initialize Tables & Migrate Baseline Data
Run the automated migration engine to create all 16 tables, constraints, and demo records in PostgreSQL:
```bash
npm run db:postgres:setup
```
Verify connectivity:
```bash
npm run db:postgres:test
```

#### Step 6: Start Full-Stack Application
```bash
npm run dev
```
*(This automatically compiles Tailwind CSS, builds the Vite React client, and starts the unified Express server on Port 5050)*.

---

### 🌐 Accessing the Platform
Open your browser and navigate to:
👉 **http://localhost:5050**

#### Default Demo Credentials:
* **Super Admin:** `admin@college.edu` | `DemoPassword123!`

---

### 🔧 Useful Maintenance Commands
* Change Super Admin credentials:
  ```bash
  npm run admin:set-creds <new_email> <new_password>
  ```
* Access PostgreSQL directly in Terminal:
  ```bash
  psql -d spms
  ```
