# Ludo Arena — Deployment Guide
## Backend on Render + Frontend on Vercel

---

## Overview

| Service | Platform | URL Format |
|---------|----------|-----------|
| Backend (Node.js + Socket.IO) | Render.com | `https://ludo-arena-backend.onrender.com` |
| Frontend (Next.js) | Vercel.com | `https://ludo-arena.vercel.app` |
| Database (MongoDB) | MongoDB Atlas | Cloud-hosted |

**Deployment Order:**
1. MongoDB Atlas → 2. Render (Backend) → 3. Vercel (Frontend)

---

## STEP 1 — MongoDB Atlas (Free Database)

### 1.1 Create Account
1. Go to https://cloud.mongodb.com
2. Sign up for free
3. Choose **Free Shared** cluster (M0 — always free)
4. Region: Choose closest to India (Mumbai — `ap-south-1`)
5. Click **Create Cluster** (takes 1-3 minutes)

### 1.2 Create Database User
1. Left sidebar → **Database Access** → **Add New Database User**
2. Username: `ludoadmin`
3. Password: Generate a strong password (save it!)
4. Role: **Read and write to any database**
5. Click **Add User**

### 1.3 Allow Network Access
1. Left sidebar → **Network Access** → **Add IP Address**
2. Click **Allow Access from Anywhere** (0.0.0.0/0)
3. Click **Confirm**
   > ⚠ This allows Render's dynamic IPs. Secure further in production.

### 1.4 Get Connection String
1. Left sidebar → **Clusters** → Click **Connect**
2. Choose **Connect your application**
3. Driver: **Node.js**, Version: **4.1 or later**
4. Copy the connection string — it looks like:
   ```
   mongodb+srv://ludoadmin:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
5. Replace `<password>` with your actual password
6. Add database name: change `/?retryWrites` to `/ludo_arena?retryWrites`

**Final connection string:**
```
mongodb+srv://ludoadmin:YOURPASSWORD@cluster0.xxxxx.mongodb.net/ludo_arena?retryWrites=true&w=majority
```

> 💡 **Important:** MongoDB Atlas M0 (free) does NOT support replica sets / transactions.
> The app handles this automatically with its non-transactional fallback.
> For full ACID support, upgrade to M10+ cluster.

---

## STEP 2 — Deploy Backend on Render

### 2.1 Create Render Account
1. Go to https://render.com
2. Sign up with GitHub account
3. Connect your GitHub account

### 2.2 Create New Web Service
1. Dashboard → **New +** → **Web Service**
2. Connect to your GitHub repo
3. Find and select: `Ludo-arena-Backend`
4. Click **Connect**

### 2.3 Configure the Service

| Setting | Value |
|---------|-------|
| **Name** | `ludo-arena-backend` |
| **Region** | Singapore (closest to India) |
| **Branch** | `main` |
| **Root Directory** | *(leave empty)* |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Plan** | Free (or Starter $7/mo for always-on) |

> ⚠ **Free plan sleeps after 15 min of inactivity.** First request after sleep takes ~30 seconds.
> Upgrade to Starter ($7/mo) for always-on service.

### 2.4 Set Environment Variables
Click **Advanced** → **Add Environment Variable** — add these one by one:

```
NODE_ENV          = production
PORT              = 10000
MONGODB_URI       = mongodb+srv://ludoadmin:PASS@cluster0.xxx.mongodb.net/ludo_arena?retryWrites=true&w=majority
JWT_SECRET        = (generate: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
JWT_EXPIRES_IN    = 7d
COOKIE_SECRET     = (generate another random string)
CLIENT_URL        = https://your-app.vercel.app
SEED_ADMIN_EMAIL  = admin@yourdomain.com
SEED_ADMIN_PASSWORD = YourStrongPass@123
SEED_ADMIN_USERNAME = superadmin
REGISTRATION_BONUS = 50
DAILY_LOGIN_REWARD = 100
```

> 💡 To generate secrets in PowerShell:
> ```powershell
> node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
> ```

### 2.5 Deploy
1. Click **Create Web Service**
2. Render will clone your repo and deploy automatically
3. Watch the logs — wait for: `🚀 Ludo Arena server running on port 10000`
4. Your backend URL will be: `https://ludo-arena-backend.onrender.com`

### 2.6 Seed the Database
After successful deployment, open Render **Shell** tab:
```bash
npm run seed
```
This creates the admin account and sample data.

### 2.7 Verify Backend
Open in browser:
```
https://ludo-arena-backend.onrender.com/api/health
```
You should see:
```json
{"success":true,"message":"Ludo Arena API is running","timestamp":"..."}
```

---

## STEP 3 — Deploy Frontend on Vercel

### 3.1 Create Vercel Account
1. Go to https://vercel.com
2. Sign up with GitHub account

### 3.2 Import Project
1. Dashboard → **Add New** → **Project**
2. Click **Import Git Repository**
3. Find and select: `Ludo-arena` (frontend repo)
4. Click **Import**

### 3.3 Configure Project

| Setting | Value |
|---------|-------|
| **Framework Preset** | Next.js (auto-detected) |
| **Root Directory** | *(leave empty)* |
| **Build Command** | `npm run build` |
| **Output Directory** | `.next` |
| **Install Command** | `npm install` |

### 3.4 Set Environment Variables
In the **Environment Variables** section, add:

```
NEXT_PUBLIC_API_URL    = https://ludo-arena-backend.onrender.com
NEXT_PUBLIC_SOCKET_URL = https://ludo-arena-backend.onrender.com
```

> Replace `ludo-arena-backend` with your actual Render service name.

### 3.5 Deploy
1. Click **Deploy**
2. Wait 2-3 minutes for build
3. Your frontend URL: `https://ludo-arena.vercel.app`

---

## STEP 4 — Connect Frontend ↔ Backend

After both are deployed:

### 4.1 Update Backend CORS
In Render → Environment Variables, update:
```
CLIENT_URL = https://ludo-arena.vercel.app
```
Click **Save** — Render will redeploy automatically.

### 4.2 Test the Connection
1. Open `https://ludo-arena.vercel.app`
2. Try to register a new account
3. Check you receive 50 coins (registration bonus)
4. Try logging in

---

## STEP 5 — Run Database Seed on Render

In Render dashboard → your service → **Shell** tab:
```bash
npm run seed
```

**Default admin credentials:**
- Email: (whatever you set in `SEED_ADMIN_EMAIL`)
- Password: (whatever you set in `SEED_ADMIN_PASSWORD`)

---

## STEP 6 — Socket.IO Production Configuration

Render supports WebSockets by default. However if you face issues:

1. In Render → Service Settings → scroll to **Headers**
2. Add header:
   ```
   X-Render-Client-Preflight: true
   ```

Vercel does **NOT** support WebSockets (serverless). That is why Socket.IO connects directly to the Render backend URL — not through Vercel's proxy.

The frontend connects to `NEXT_PUBLIC_SOCKET_URL` (your Render URL) directly for sockets, while HTTP API calls go through the Next.js rewrite proxy.

---

## STEP 7 — Upload Files (Banners & Screenshots)

> ⚠ **Important:** Render's free plan has an **ephemeral filesystem**. Files uploaded to `uploads/` will be deleted on every redeploy.

### Option A — Use Render Persistent Disk (Paid, $1/month)
1. Render → Service → **Disks** → **Add Disk**
2. Mount Path: `/app/uploads`
3. Size: 1 GB ($0.25/GB/month)

### Option B — Use Cloudinary (Free, Recommended)
See the Cloudinary migration section at the end of this guide.

### Option C — Accept the Limitation (Free Dev)
For development/demo use, uploaded files will work until next deploy.

---

## STEP 8 — Custom Domain (Optional)

### Vercel Custom Domain
1. Vercel → Project → **Settings** → **Domains**
2. Add your domain: `ludo-arena.yourdomain.com`
3. Add CNAME record in your domain DNS:
   ```
   CNAME → cname.vercel-dns.com
   ```

### Render Custom Domain
1. Render → Service → **Settings** → **Custom Domains**
2. Add: `api.yourdomain.com`
3. Add CNAME record:
   ```
   api → ludo-arena-backend.onrender.com
   ```
4. Update `CLIENT_URL` and `NEXT_PUBLIC_API_URL` with new domains.

---

## Environment Variables — Complete Reference

### Backend (Render)

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | ✅ | `production` |
| `PORT` | ✅ | `10000` (Render assigns this) |
| `MONGODB_URI` | ✅ | MongoDB Atlas connection string |
| `JWT_SECRET` | ✅ | Random 64-char hex string |
| `JWT_EXPIRES_IN` | ✅ | `7d` |
| `COOKIE_SECRET` | ✅ | Another random secret |
| `CLIENT_URL` | ✅ | Your Vercel frontend URL |
| `SEED_ADMIN_EMAIL` | ✅ | Admin email |
| `SEED_ADMIN_PASSWORD` | ✅ | Admin password |
| `SEED_ADMIN_USERNAME` | ✅ | Admin username |
| `REGISTRATION_BONUS` | Optional | Default: 50 |
| `DAILY_LOGIN_REWARD` | Optional | Default: 100 |

### Frontend (Vercel)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | ✅ | Your Render backend URL |
| `NEXT_PUBLIC_SOCKET_URL` | ✅ | Same as API URL (for Socket.IO) |

---

## Troubleshooting

### "Cold Start" Delay (Free Render Plan)
**Symptom:** First load takes 30+ seconds  
**Cause:** Render free tier spins down inactive services  
**Fix:** Upgrade to Render Starter ($7/mo) for always-on service  
**Workaround:** Use UptimeRobot to ping `/api/health` every 10 minutes

### CORS Error in Browser
**Symptom:** `Access-Control-Allow-Origin` error  
**Fix:** In Render env vars, set `CLIENT_URL` to exactly your Vercel URL (no trailing slash)  
Example: `https://ludo-arena.vercel.app` ✅ (not `https://ludo-arena.vercel.app/`) ❌

### Socket.IO Not Connecting
**Symptom:** Real-time features don't work  
**Cause:** Wrong `NEXT_PUBLIC_SOCKET_URL`  
**Fix:** Set to full Render URL: `https://ludo-arena-backend.onrender.com`

### "Authentication Required" After Login
**Symptom:** Cookie not sent with API requests  
**Cause:** Cross-origin cookie blocked  
**Fix:** Ensure `NEXT_PUBLIC_API_URL` matches your Render URL exactly (https, no trailing slash)

### Upload Files Lost After Redeploy
**Symptom:** Tournament banners and screenshots disappear  
**Cause:** Ephemeral filesystem on Render free tier  
**Fix:** Add Render persistent disk or migrate to Cloudinary (see below)

### MongoDB Connection Timeout
**Symptom:** `MongoServerSelectionError`  
**Fix:** Check MongoDB Atlas → Network Access → IP is `0.0.0.0/0`

---

## Cloudinary Migration (Recommended for Production)

Replace local file storage with Cloudinary for persistent uploads.

### Install
```bash
npm install cloudinary multer-storage-cloudinary
```

### Add Environment Variables (Render)
```
CLOUDINARY_CLOUD_NAME = your_cloud_name
CLOUDINARY_API_KEY    = your_api_key
CLOUDINARY_API_SECRET = your_api_secret
```

### Update upload.js
```javascript
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const makeCloudinaryStorage = (folder) =>
  new CloudinaryStorage({
    cloudinary,
    params: {
      folder: `ludo-arena/${folder}`,
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    },
  });

const uploadBanner = multer({ storage: makeCloudinaryStorage('banners'), limits: { fileSize: 5 * 1024 * 1024 } });
const uploadScreenshot = multer({ storage: makeCloudinaryStorage('screenshots'), limits: { fileSize: 8 * 1024 * 1024 } });
```

---

## Production Checklist

Before going live, verify:

- [ ] MongoDB Atlas cluster created and connection string saved
- [ ] Strong JWT_SECRET generated (64+ chars)
- [ ] Strong COOKIE_SECRET generated
- [ ] `NODE_ENV=production` set on Render
- [ ] `CLIENT_URL` set to exact Vercel URL
- [ ] `NEXT_PUBLIC_API_URL` set to exact Render URL
- [ ] Admin seed run after first deploy
- [ ] Health check passes: `/api/health`
- [ ] Can register and login
- [ ] Can join tournament
- [ ] Socket.IO real-time works (check browser console — no WebSocket errors)
- [ ] File uploads work (create test tournament with banner)
- [ ] Admin panel accessible
- [ ] Changed default admin password from seed
- [ ] (Optional) Custom domain configured
- [ ] (Optional) Cloudinary for persistent file storage

---

## Free Tier Limits Summary

| Service | Free Limit | Paid Plan |
|---------|-----------|-----------|
| MongoDB Atlas M0 | 512 MB storage, shared CPU | M10 $57/mo — replica set |
| Render Web Service | 750 hours/month, sleeps after 15min | Starter $7/mo — always on |
| Vercel | 100 GB bandwidth, unlimited deploys | Pro $20/mo |
| Cloudinary | 25 credits/month (~25k transforms) | Plus $89/mo |

**For a small-scale launch, the free tiers are sufficient.**  
Upgrade when you have consistent traffic.

---

## Quick Deploy Checklist (TL;DR)

```
1. MongoDB Atlas:
   ✓ Create M0 cluster
   ✓ Create user: ludoadmin / <password>
   ✓ Allow all IPs (0.0.0.0/0)
   ✓ Get connection string

2. Render (Backend):
   ✓ New Web Service → connect Ludo-arena-Backend repo
   ✓ Build: npm install | Start: npm start
   ✓ Add all environment variables (see table above)
   ✓ Deploy → wait for "running on port" in logs
   ✓ Run seed: npm run seed (via Shell tab)
   ✓ Test: https://your-name.onrender.com/api/health

3. Vercel (Frontend):
   ✓ Import Ludo-arena repo
   ✓ Add NEXT_PUBLIC_API_URL and NEXT_PUBLIC_SOCKET_URL
   ✓ Deploy → wait 2-3 min

4. Connect:
   ✓ Update Render CLIENT_URL = https://your-app.vercel.app
   ✓ Test registration, login, tournament join
   ✓ Done! 🎉
```
