# Ludo Arena — Complete Project Flow

> **Last updated:** November 2026  
> **Stack:** Next.js 14 (frontend) · Node.js / Express (backend) · MongoDB Atlas · Socket.IO  
> **Economy:** 1 Coin = ₹1 (real money, no free coins)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Repository Structure](#2-repository-structure)
3. [Tech Stack & Dependencies](#3-tech-stack--dependencies)
4. [Three-Tier Role System](#4-three-tier-role-system)
5. [Authentication Flow](#5-authentication-flow)
6. [Database Models](#6-database-models)
7. [Backend API Routes](#7-backend-api-routes)
8. [Coin Economy — Full Lifecycle](#8-coin-economy--full-lifecycle)
9. [Sub-Admin System](#9-sub-admin-system)
10. [UPI Payment Flow](#10-upi-payment-flow)
11. [Withdrawal Flow](#11-withdrawal-flow)
12. [Open Battles (Ludo King)](#12-open-battles-ludo-king)
13. [Classic Play (Built-in Ludo Game)](#13-classic-play-built-in-ludo-game)
14. [Tournament System](#14-tournament-system)
15. [Socket.IO Real-Time Events](#15-socketio-real-time-events)
16. [Anti-Cheat Audit Equation](#16-anti-cheat-audit-equation)
17. [Admin Panel](#17-admin-panel)
18. [Sub-Admin Panel](#18-sub-admin-panel)
19. [Frontend Pages & Navigation](#19-frontend-pages--navigation)
20. [Security Architecture](#20-security-architecture)
21. [Environment Variables](#21-environment-variables)
22. [File Upload System](#22-file-upload-system)
23. [Error Handling & Logging](#23-error-handling--logging)
24. [Testing](#24-testing)
25. [Deployment Notes](#25-deployment-notes)

---

## 1. Project Overview

Ludo Arena ek full-stack multiplayer gaming platform hai jisme do game modes hain:

| Mode | Description |
|------|-------------|
| **Classic Play** | Built-in Ludo game engine — 2 or 4 players, real-time via Socket.IO, in-browser board |
| **Open Battles** | Ludo King room challenges — user apna Ludo King room banata hai, dusre join karte hain, result screenshot se verify hota hai |

Dono modes real-money economy use karte hain (1 Coin = ₹1). Coins sirf Sub-Admin ke UPI se khareedne milte hain. Winning coins withdraw bhi ho sakte hain.

**Monorepo layout:**
```
Ludo-Panel/
├── server/   → Express backend (GitHub: Ludo-arena-Backend)
├── client/   → Next.js frontend (GitHub: Ludo-arena)
└── docs/     → Documentation
```

---

## 2. Repository Structure

### Backend (`server/`)

```
server/
├── src/
│   ├── app.js                  ← Express app + Socket.IO server entry
│   ├── config/
│   │   ├── db.js               ← MongoDB Atlas connection
│   │   └── constants.js        ← REGISTRATION_BONUS, DAILY_LOGIN_REWARD
│   ├── models/                 ← Mongoose schemas (see §6)
│   ├── controllers/            ← Route handlers
│   ├── routes/                 ← Express routers
│   ├── services/               ← Business logic
│   ├── middleware/
│   │   ├── auth.js             ← JWT authenticate, requireAdmin, requireMainAdmin, requireSubAdminOrMain
│   │   ├── upload.js           ← Multer screenshot upload
│   │   ├── validate.js         ← Zod schema validation middleware
│   │   └── errorHandler.js     ← Global error + 404 handler
│   ├── socket/
│   │   ├── index.js            ← Socket.IO room setup + event registration
│   │   ├── socketInstance.js   ← Singleton io getter/setter + emit helpers
│   │   ├── socketAuth.js       ← JWT auth for Socket.IO connections
│   │   ├── gameSocket.js       ← Classic play real-time events
│   │   └── notificationSocket.js
│   ├── utils/
│   │   ├── jwt.js              ← generateToken, verifyToken, cookie helpers
│   │   ├── apiResponse.js      ← success(), error(), paginated()
│   │   └── logger.js           ← Pino logger
│   ├── validators/             ← Zod schemas per domain
│   └── seeds/seed.js           ← Dev seed script
├── tests/
│   ├── unit/                   ← Game engine + model unit tests
│   └── integration/            ← Supertest API integration tests
├── uploads/                    ← Screenshot storage (dev)
└── backups/                    ← Auto-backup before data resets
```

### Frontend (`client/`)

```
client/
├── app/
│   ├── (auth)/                 ← login, register, forgot-password
│   ├── (user)/                 ← User-facing pages (protected)
│   │   ├── dashboard/
│   │   ├── battles/            ← Open Battles lobby
│   │   │   └── [id]/           ← Battle detail + result submission
│   │   ├── buy-coins/          ← UPI coin purchase
│   │   │   └── checkout/
│   │   ├── wallet/             ← Balances + withdraw
│   │   ├── tournaments/
│   │   │   └── [id]/
│   │   ├── matches/
│   │   ├── leaderboard/
│   │   ├── profile/
│   │   └── rules/
│   ├── admin/                  ← Main Admin panel
│   │   ├── dashboard/
│   │   ├── sub-admins/         ← Sub-Admin CRUD + coin management
│   │   ├── payments/
│   │   ├── tournaments/
│   │   ├── users/
│   │   ├── matches/
│   │   ├── rooms/
│   │   ├── wallet/
│   │   ├── results/
│   │   ├── logs/
│   │   └── settings/
│   ├── subadmin/               ← Sub-Admin self-service panel
│   └── room/[roomId]/          ← Classic play room (Ludo board)
├── components/
│   ├── layout/
│   │   ├── AuthProvider.jsx    ← Zustand hydration + socket init
│   │   ├── UserSidebar.jsx
│   │   └── AdminSidebar.jsx
│   ├── game/                   ← Ludo board, dice, pieces, waiting room
│   ├── tournament/
│   └── ui/                     ← Button, Input, Modal, Badge, Card, etc.
├── lib/
│   ├── api/axios.js            ← Axios instance + Bearer token interceptor
│   └── socket/socket.js        ← Socket.IO client singleton
├── store/
│   ├── authStore.js            ← Zustand: user, isAuthenticated, login/logout
│   ├── gameStore.js            ← Zustand: active game state
│   └── toastStore.js           ← Zustand: toast notifications
└── hooks/                      ← Custom React hooks
```

---

## 3. Tech Stack & Dependencies

### Backend
| Package | Purpose |
|---------|---------|
| `express` | HTTP server & routing |
| `mongoose` | MongoDB ODM |
| `socket.io` | Real-time bidirectional events |
| `jsonwebtoken` | JWT generation & verification |
| `bcryptjs` | Password hashing |
| `zod` | Request body validation |
| `pino` / `pino-pretty` | Structured logging |
| `multer` | File uploads (screenshots) |
| `qrcode` | UPI QR code generation |
| `uuid` | Unique ID generation |
| `helmet` | HTTP security headers |
| `cors` | Cross-origin requests |
| `express-rate-limit` | Rate limiting |

### Frontend
| Package | Purpose |
|---------|---------|
| `next` 14 | React framework, App Router |
| `react` | UI library |
| `axios` | HTTP client |
| `socket.io-client` | Real-time events |
| `zustand` | State management |
| `tailwindcss` | Utility-first CSS |
| `framer-motion` | Animations |
| `lucide-react` | Icons |
| `date-fns` | Date formatting |

---

## 4. Three-Tier Role System

```
main_admin (+ legacy 'admin')
    │
    ├── Creates Sub-Admins
    ├── Issues / deducts coinStock
    ├── Approves any payment or withdrawal
    ├── Resolves any battle dispute
    └── Full admin panel access

sub_admin
    │
    ├── Owns a revolving coinStock (issued by main_admin)
    ├── Has own UPI ID — users pay the sub_admin directly
    ├── Approves / rejects payments under own scope
    ├── Approves / rejects withdrawals (with UTR)
    ├── Resolves battle disputes under own scope
    └── Self-service panel: /subadmin

user
    │
    ├── Buys coins from a sub_admin via UPI
    ├── Plays Classic Play or Open Battles
    ├── Submits withdrawal requests
    └── Standard user wallet & history
```

**Role constants in code:**
- `['admin', 'main_admin']` → treated identically throughout the codebase
- `requireAdmin` = main_admin only
- `requireSubAdminOrMain` = sub_admin OR main_admin
- Sub-admin suspended (`isActive: false`) → 403 on all API calls

---

## 5. Authentication Flow

### Registration
```
POST /api/auth/register
  → validate (Zod: username 3-20 chars, email, password min 6)
  → User.create({ role: 'user', walletBalance: 0 })   ← NO bonus coins
  → generateToken(userId) → HTTP-only cookie + JSON response
  → returns: { user: { _id, username, email, role, walletBalance: 0 } }
```

### Login
```
POST /api/auth/login
  → find User by email (with password)
  → bcrypt.compare(candidatePassword, hash)
  → generateToken(userId) → HTTP-only cookie
  → updates lastSeen
  → returns: { user, token }
```

### Token verification (every protected request)
```
authenticate middleware:
  1. Extract JWT from cookie OR Authorization: Bearer header
  2. verifyToken(token) → { id }
  3. User.findById(id).select('-password')
  4. if isBlocked → 403
  5. if sub_admin && !isActive → 403
  6. req.user = user → next()
```

### Forgot / Reset Password
```
POST /api/auth/forgot-password
  → generates crypto token, stores hash + expiry on User
  → sends email (dev: logs to console)

POST /api/auth/reset-password
  → verifies token hash, checks expiry
  → bcrypt hashes new password, clears token fields
```

---

## 6. Database Models

### User
Core user document. `walletBalance` is an AGGREGATE field — sum of all UserSubWallet balances. Never write it directly; always call `syncUserAggregateBalance(userId)`.

```
User {
  username, email, password (hashed, select:false)
  role: 'user' | 'sub_admin' | 'main_admin' | 'admin'
  isBlocked, isActive
  walletBalance        ← aggregate, synced automatically
  totalCoinsEarned, totalCoinsSpent
  totalMatches, totalWins, totalLosses
  lastDailyBonus       ← kept but API returns 403
  subAdminInfo {       ← only populated for sub_admin role
    displayName, phone, isActive
    coinStock            ← revolving real-money coin pool
    totalCoinsIssued, totalCoinsDeducted
    totalCoinsSold, totalWithdrawalsSettled, totalCommissionEarned
    commissionPercentOverride  ← null = use SystemSettings default
    upiEnabled, upiId, upiName, upiNote
    createdBy          ← ref to main_admin who created
  }
}
```

### UserSubWallet
Per-user, per-sub-admin balance. A user can have coins under multiple sub-admins independently. Coins under Sub-Admin A cannot be used in battles under Sub-Admin B.

```
UserSubWallet {
  user: ObjectId → User
  subAdmin: ObjectId → User
  balance               ← playable & withdrawable
  lockedBattleBalance   ← escrowed in active open battles
  lockedWithdrawalBalance ← escrowed in pending withdrawals
  totalPurchased, totalWithdrawn, totalWagered, totalWon
  unique index: (user, subAdmin)
}
```

### PaymentOrder
Tracks every UPI coin purchase. No real payment processing — admin manually verifies.

```
PaymentOrder {
  user, subAdmin        ← which sub-admin's UPI was used
  coinsRequested, amountRupees
  orderReference        ← LA-XXXXXX unique code shown to user
  status: pending → admin_notified → approved | rejected | expired
  upiPlatform
  screenshotUrl, screenshotSubmittedAt
  adminAlarmActive, adminAlarmDismissedAt
  adminRemarks, reviewedBy, reviewedAt
  walletTransaction     ← set after approval
  expiresAt             ← TTL auto-expire (pending orders only)
}
```

### WithdrawalRequest
User requests cash-out of their won/purchased coins.

```
WithdrawalRequest {
  user, subAdmin
  amountCoins, amountRupees   ← 1:1
  withdrawalReference         ← WD-XXXXXX
  payoutMethod: 'upi' | 'bank'
  userUpiId, accountHolderName
  bankAccountNumber, bankIfsc
  status: pending → approved | rejected
  utrReference               ← UTR entered by sub-admin on approval
  adminRemarks, reviewedBy, reviewedAt
  alarmActive
}
```

### SubAdminLedger
Immutable audit trail of every stock movement.

```
SubAdminLedger {
  subAdmin, type, amount, stockBefore, stockAfter
  type: main_admin_issue | main_admin_deduct | user_coin_purchase
        | user_withdrawal_return | battle_commission_recorded
  commissionAmount   ← only for battle_commission_recorded
  relatedUser, paymentOrder, withdrawalRequest, battle
  actedBy, remarks
  idempotencyKey     ← prevents duplicate records
}
```

### OpenBattle
User-created Ludo King challenge rooms.

```
OpenBattle {
  battleCode          ← LB-XXXXXX public code
  subAdmin, creator
  gameMode: classic | quick | one_kill | popular
  maxPlayers: 2 | 4
  entryCoins, totalPot, commissionPercent, commissionCoins, winningPrize
  roomId, roomPassword  ← NEVER in public lobby responses
  status: open → in_progress → result_pending → completed | disputed | cancelled
  participants [{
    user, joinedAt, entryTxId
    submission { claim, screenshotUrl, cancelReason, verificationStatus }
  }]
  winner, rewardDistributed, refundDistributed
  verifiedBy, adminRemarks
}
```

### WalletTransaction
Every coin movement is recorded here. Idempotency keys prevent duplicate credits/debits.

```
WalletTransaction {
  user, type, amount, balanceBefore, balanceAfter, description
  type: registration_bonus | daily_bonus | match_entry | match_win
      | admin_adjust | coin_request | admin_correction | tournament_reward
      | coin_purchase | refund
      | battle_entry | battle_win | battle_refund
      | withdrawal_lock | withdrawal_approved | withdrawal_refund
  refs: room, match, coinRequest, tournament, paymentOrder,
        subAdmin, openBattle, withdrawalRequest
  adjustedBy, idempotencyKey
}
```

### Other Models

| Model | Purpose |
|-------|---------|
| `SystemSettings` | Global settings: coinPriceRupees=1, min/max purchase & withdrawal, battleCommissionPercent=5%, orderExpiryMinutes=30, enabledGameModes |
| `Match` | Classic play match definitions (entryCoins, winnerReward, maxPlayers) |
| `Room` | Active game room — links match, players, game state, status |
| `GameState` | Live Ludo board state (pieces positions, turn, dice) |
| `GameHistory` | Completed game records |
| `Tournament` | 4-player tournament brackets, entry fee, prize pool |
| `Notification` | In-app notifications with socket emit |
| `AdminLog` | Audit log of all admin actions |
| `CoinRequest` | Legacy free-coin request (read-only, all create/approve APIs return 403) |
| `Dispute` | Classic play result disputes |

---

## 7. Backend API Routes

Base URL: `http://localhost:5000/api`

### Auth — `/api/auth`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/register` | — | Register new user (walletBalance = 0) |
| POST | `/login` | — | Login, sets HTTP-only cookie |
| GET | `/me` | ✓ | Get current user |
| POST | `/logout` | ✓ | Clear auth cookie |
| POST | `/forgot-password` | — | Send reset email |
| POST | `/reset-password` | — | Reset with token |

### Users — `/api/users`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/leaderboard` | — | Top players by wins |
| GET | `/profile/:username` | — | Public profile |
| PATCH | `/me` | ✓ | Update own profile / avatar |
| GET | `/me/stats` | ✓ | Personal stats |

### Wallet — `/api/wallet`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/balance` | ✓ | Current balance + stats |
| GET | `/history` | ✓ | Paginated transaction history |
| POST | `/daily-bonus/claim` | ✓ | **Returns 403** (disabled) |
| POST | `/coin-requests` | ✓ | **Returns 403** (disabled) |
| GET | `/coin-requests` | ✓ | Read legacy requests (history) |
| GET | `/sub-admins` | ✓ | Active sub-admins with UPI enabled |
| GET | `/my-sub-wallets` | ✓ | User's balances per sub-admin |

### Payment — `/api/payment`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/settings` | — | Min/max purchase, pricing |
| POST | `/initiate` | ✓ | Create order, get QR + UPI URL |
| POST | `/notify/:orderId` | ✓ | User confirms payment → alarm |
| POST | `/screenshot/:orderId` | ✓ | Upload payment proof |
| GET | `/my-orders` | ✓ | User's order history |
| GET | `/order/:orderId` | ✓ | Order status (checkout polling) |
| GET | `/admin/pending` | SubAdmin/Main | Pending orders (scoped) |
| GET | `/admin/all` | SubAdmin/Main | All orders (scoped) |
| PATCH | `/admin/:orderId/approve` | SubAdmin/Main | Approve → coins credited |
| PATCH | `/admin/:orderId/reject` | SubAdmin/Main | Reject order |
| PATCH | `/admin/:orderId/dismiss-alarm` | SubAdmin/Main | Dismiss alarm |
| GET | `/admin/settings` | MainAdmin | Full settings |
| PATCH | `/admin/settings` | MainAdmin | Update global settings |

### Sub-Admin — `/api/sub-admin`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/me` | SubAdmin/Main | Own profile + metrics |
| GET | `/me/ledger` | SubAdmin/Main | Own ledger entries |
| GET | `/me/users` | SubAdmin/Main | Users under own scope |
| GET | `/me/audit` | SubAdmin/Main | Audit equation metrics |
| PATCH | `/me/upi` | SubAdmin/Main | Update own UPI settings |
| GET | `/` | MainAdmin | List all sub-admins |
| POST | `/` | MainAdmin | Create sub-admin |
| GET | `/:id` | MainAdmin | Detail + audit |
| POST | `/:id/issue-coins` | MainAdmin | Add to coinStock |
| POST | `/:id/deduct-coins` | MainAdmin | Subtract from coinStock |
| PATCH | `/:id/toggle-active` | MainAdmin | Suspend / reactivate |
| PATCH | `/:id/upi` | MainAdmin | Update sub-admin's UPI |
| GET | `/:id/ledger` | MainAdmin | Sub-admin ledger |
| GET | `/:id/users` | MainAdmin | Users under sub-admin |
| GET | `/:id/audit` | MainAdmin | Audit equation |

### Withdrawals — `/api/withdrawals`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/` | ✓ User | Submit withdrawal request |
| GET | `/mine` | ✓ User | Own withdrawal history |
| GET | `/` | SubAdmin/Main | List (scoped) |
| GET | `/:id` | SubAdmin/Main | Detail |
| PATCH | `/:id/approve` | SubAdmin/Main | Approve with UTR (coins → stock) |
| PATCH | `/:id/reject` | SubAdmin/Main | Reject (coins refunded) |

### Battles — `/api/battles`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | ✓ | Lobby (credentials stripped) |
| GET | `/mine` | ✓ | My battles |
| POST | `/` | ✓ | Create battle |
| POST | `/:id/join` | ✓ | Join battle |
| POST | `/:id/leave` | ✓ | Leave open battle (refund) |
| POST | `/:id/screenshot` | ✓ | Upload result screenshot |
| POST | `/:id/submit` | ✓ | Submit claim (won/lost/cancel) |
| GET | `/:id` | ✓ | Detail (credentials if allowed) |
| GET | `/admin/all` | SubAdmin/Main | Admin battle list |
| GET | `/admin/:id` | SubAdmin/Main | Full detail with submissions |
| POST | `/:id/resolve` | SubAdmin/Main | Resolve dispute |

### Admin — `/api/admin`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/dashboard` | Admin | Stats overview |
| GET | `/users` | Admin | User list |
| GET | `/users/:id` | Admin | User detail |
| PATCH | `/users/:id/toggle-block` | Admin | Block/unblock user |
| GET/POST/PATCH/DELETE | `/matches` | Admin | Match CRUD |
| GET | `/rooms` | Admin | Room list |
| POST | `/rooms/:roomId/publish-credentials` | Admin | Publish Ludo King room for classic play |
| GET | `/results` | Admin | Game results |
| POST | `/coins/adjust` | Admin | **Returns 403** (disabled) |
| GET | `/wallet/analytics` | Admin | Wallet stats |
| GET | `/wallet/transactions/:userId` | Admin | User transactions |
| GET | `/coin-requests` | Admin | Legacy requests list |
| GET | `/logs` | Admin | Audit logs |
| POST | `/notifications` | Admin | Send notification |

### Tournaments — `/api/tournaments`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | — | Active tournaments |
| GET | `/:id` | — | Tournament detail |
| POST | `/:id/join` | ✓ | Join tournament (atomic, entry fee deducted) |
| POST | `/:id/submit-screenshot` | ✓ | Submit game result screenshot |
| GET | `/admin/all` | Admin | All tournaments |
| POST | `/admin` | Admin | Create tournament |
| PATCH | `/admin/:id/publish-room` | Admin | Publish Ludo King room credentials |
| PATCH | `/admin/:id/verify/:userId` | Admin | Approve participant result |
| PATCH | `/admin/:id/finalize` | Admin | Finalize tournament (award coins) |

### Matches & Rooms — `/api/matches`, `/api/rooms`
Classic play match join, game socket events (see §13).

---

## 8. Coin Economy — Full Lifecycle

```
Main Admin
    │  issues coinStock to Sub-Admin (SubAdminLedger: main_admin_issue)
    ▼
Sub-Admin coinStock (e.g. 10,000 coins)
    │
    │  User pays Sub-Admin ₹X via UPI
    │  Sub-Admin approves PaymentOrder
    │  coinStock -= X  (SubAdminLedger: user_coin_purchase)
    ▼
UserSubWallet(user, subAdmin).balance += X
User.walletBalance (aggregate) updated via syncUserAggregateBalance()
    │
    ├─── CLASSIC PLAY ────────────────────────────────────────────
    │    wallet.service.adjustWallet():
    │    balance -= entryCoins (WalletTransaction: match_entry)
    │    on win: balance += reward  (WalletTransaction: match_win)
    │
    ├─── OPEN BATTLE ─────────────────────────────────────────────
    │    lockEntry(): balance → lockedBattleBalance
    │    WalletTransaction: battle_entry
    │
    │    Result settled:
    │    ┌── ALL CANCEL: full refund, 0 commission
    │    │   lockedBattleBalance → balance for all players
    │    │   WalletTransaction: battle_refund
    │    │
    │    └── WINNER declared:
    │        lockedBattleBalance freed for all
    │        winner.balance += winningPrize
    │        WalletTransaction: battle_win
    │        commission BURNED:
    │        subAdmin.totalCommissionEarned += commissionCoins
    │        SubAdminLedger: battle_commission_recorded
    │
    └─── WITHDRAWAL ──────────────────────────────────────────────
         balance → lockedWithdrawalBalance
         WalletTransaction: withdrawal_lock

         Sub-Admin pays user ₹ via UPI (outside system)
         Sub-Admin approves with UTR:
         lockedWithdrawalBalance freed
         coinStock += amountCoins  (REVOLVING STOCK!)
         WalletTransaction: withdrawal_approved
         SubAdminLedger: user_withdrawal_return

         OR Sub-Admin rejects:
         lockedWithdrawalBalance → balance (refund)
         WalletTransaction: withdrawal_refund
```

---

## 9. Sub-Admin System

### Sub-Admin kya hai?
Sub-Admin ek designated operator hai jo:
1. Main Admin se coins receive karta hai (coinStock)
2. Apna UPI ID configure karta hai
3. Users directly Sub-Admin ko UPI payment karte hain
4. Sub-Admin payment verify karke approve karta hai → user ke wallet me coins add hote hain
5. User winning withdraw karta hai → Sub-Admin UTR ke saath approve karta hai → coins wapas uske stock me aate hain

### Revolving Stock Model
```
Stock issued by main_admin: 10,000
        ↓
User purchases 500 coins (pays ₹500 via UPI)
Stock: 9,500  |  User balance: 500
        ↓
User wins battle (prize 950 coins, 50 commission)
Stock: 9,500 (unchanged)  |  User balance: 950
Commission recorded: 50 coins BURNED
        ↓
User withdraws 900 coins (sub-admin pays ₹900 via UPI)
Stock: 9,500 + 900 = 10,400  ← revolving, stock INCREASES
User balance: 50
```

Commission coins kabhi kisi ko nahi milte — sirf `totalCommissionEarned` counter me add hote hain for the audit equation.

### Same-Sub-Admin Scoping
- User sirf usi Sub-Admin ke battles join kar sakta hai jiske paas uske coins hain
- `GET /api/battles?subAdminId=X` → sirf usi scope ke battles return karta hai
- Ek user ek time pe ek hi active battle rakh sakta hai per sub-admin

---

## 10. UPI Payment Flow

```
Step 1: User /buy-coins page kholata hai
        GET /api/wallet/sub-admins → active sub-admins with UPI enabled

Step 2: User sub-admin aur amount select karta hai
        POST /api/payment/initiate { subAdminId, coinsRequested }
        Backend:
          - Sub-Admin validate karta hai (isActive, upiEnabled, coinStock >= requested)
          - Existing pending order check (ek time pe ek hi order per user-subadmin pair)
          - PaymentOrder create
          - UPI URL build: upi://pay?pa=UPIID&pn=NAME&am=AMOUNT&cu=INR&tn=NOTE&tr=REF
            (@ NEVER percent-encoded, manually built to avoid URLSearchParams issue)
          - QR code generate (base64 PNG via qrcode library)
        Returns: order, upiUrl, qrCodeDataUrl, upiId, upiName

Step 3: User QR code scan karta hai ya UPI ID manually enter karta hai
        Apni UPI app (GPay/PhonePe/Paytm) se payment karta hai

Step 4: User payment screenshot upload karta hai (mandatory)
        POST /api/payment/screenshot/:orderId (multipart/form-data)
        → screenshotUrl saved on PaymentOrder

Step 5: User "I Have Paid" click karta hai
        POST /api/payment/notify/:orderId
        → PaymentOrder.status: pending → admin_notified
        → Notification create for sub-admin
        → Socket emit to subadmin:SUBADMINID + admin:room (payment:alarm)

Step 6: Sub-Admin apni UPI app me payment verify karta hai
        PATCH /api/payment/admin/:orderId/approve
        Backend (subAdmin.service.approveCoinPurchase):
          - Idempotency check (coin_purchase_ORDERID)
          - subAdmin.coinStock -= coinsRequested
          - UserSubWallet(user, subAdmin).balance += coinsRequested
          - syncUserAggregateBalance(userId) → User.walletBalance updated
          - WalletTransaction: coin_purchase
          - SubAdminLedger: user_coin_purchase
        → Socket: wallet:updated to user, payment:status-updated → redirectTo /wallet
        → Notification to user

Step 7 (alternative): Sub-Admin reject karta hai
        PATCH /api/payment/admin/:orderId/reject { adminRemarks }
        → No coins move, Notification to user with reason
```

**Order expiry:** Pending orders auto-expire via MongoDB TTL index after `orderExpiryMinutes` (default 30 minutes).

---

## 11. Withdrawal Flow

```
Step 1: User /wallet page → Withdraw button
        GET /api/wallet/my-sub-wallets → sub-wallets with balances

Step 2: User sub-admin, amount, UPI details bharta hai
        POST /api/withdrawals { subAdminId, amountCoins, payoutMethod, userUpiId, accountHolderName }
        Backend (subAdmin.service.submitWithdrawal):
          - SystemSettings min/max check
          - Sub-Admin active check
          - Existing pending withdrawal check (ek user ek sub-admin me ek pending hi allowed)
          - UserSubWallet.balance check
          - WithdrawalReference generate (WD-XXXXXX)
          - WithdrawalRequest create
          - balance → lockedWithdrawalBalance
          - WalletTransaction: withdrawal_lock
          - Socket alarm to sub-admin + main admin

Step 3: Sub-Admin APNI UPI app se user ko ₹ transfer karta hai
        (Yeh step system ke bahar hai — real world bank transfer)

Step 4: Sub-Admin UTR number le kar approve karta hai
        PATCH /api/withdrawals/:id/approve { utrReference, adminRemarks }
        Backend (subAdmin.service.approveWithdrawal):
          - Idempotency check (wd_approve_ID)
          - lockedWithdrawalBalance freed
          - totalWithdrawn += amountCoins
          - REVOLVING STOCK: coinStock += amountCoins (coins wapas!)
          - WalletTransaction: withdrawal_approved
          - SubAdminLedger: user_withdrawal_return
          - Socket: withdrawal:updated to user

Step 5 (alternative): Sub-Admin reject karta hai
        PATCH /api/withdrawals/:id/reject { adminRemarks }
        → lockedWithdrawalBalance → balance (full refund)
        → WalletTransaction: withdrawal_refund
        → Socket notification to user
```

---

## 12. Open Battles (Ludo King)

Open Battles ek wager system hai built on top of Ludo King app.

### Full Battle Lifecycle

```
CREATION
  User Ludo King me room banata hai, Room ID copy karta hai
  POST /api/battles { subAdminId, gameMode, maxPlayers, entryCoins, roomId, roomPassword }
  Backend:
    - Sub-Admin validate, SystemSettings min/max check
    - Active battle check (user ka koi active battle na ho is sub-admin me)
    - commissionPercent = sub-admin override ?? SystemSettings.battleCommissionPercent
    - winningPrize = totalPot - floor(totalPot * commission / 100)
    - OpenBattle create (roomId/roomPassword stored securely)
    - Creator ka entry lock (balance → lockedBattleBalance)
    - Socket: lobby:subadmin:SUBADMINID ← battle:created (without credentials)
    Status: OPEN

JOIN
  POST /api/battles/:id/join
  - Balance check karta hai us sub-admin ke wallet me
  - Entry lock karta hai
  - Participant add karta hai
  - Agar battle full hua:
      status: IN_PROGRESS
      Socket: battle:BATTLEID ← battle:started { roomId, roomPassword }
      Dono players ko notification

GAMEPLAY
  Players Ludo King me room join karte hain (credentials unhe socket se milte hain)
  Game Ludo King app me hoti hai (Ludo Arena track nahi karta)

RESULT SUBMISSION
  POST /api/battles/:id/submit { claim: 'won'|'lost'|'cancel', screenshotUrl }
  - 'won' ke liye screenshot mandatory hai
  - Jab sab participants submit karte hain → auto-transition

AUTO-TRANSITION
  All cancel   → CANCELLED, full refund (0 commission)
  1 won + rest lost → COMPLETED, winner gets prize
  Anything else → DISPUTED, sub-admin ko resolve karna padega

DISPUTE RESOLUTION
  POST /api/battles/:id/resolve { decision: 'winner'|'cancel', winnerId, remarks }
  - decision='winner' → winner select karo, prize pay karo, commission burn karo
  - decision='cancel' → sab ko full refund (0 commission)

COMPLETION
  Winner: lockedBattleBalance freed + winningPrize credited
  Commission: totalCommissionEarned += commissionCoins (BURNED, kisi ko nahi milta)
  Socket: battle:result to each participant
```

### Room Credentials Security
- `roomId` aur `roomPassword` **kabhi bhi** public lobby responses me nahi aata
- Sirf ye log dekh sakte hain:
  - Participants (once battle status = in_progress or later)
  - Sub-Admin (apne scope ke)
  - Main Admin (sab ke)
- `publicBattleView()` function in-place delete karta hai fields before response

---

## 13. Classic Play (Built-in Ludo Game)

Built-in browser-based Ludo game jo real-time Socket.IO pe chalti hai.

### Flow

```
1. Admin match create karta hai (entryCoins, winnerReward, maxPlayers)
2. User match browse karta hai → GET /api/matches
3. User join karta hai:
   POST /api/rooms (match join)
   → entryCoins deduct hote hain (adjustWallet)
   → Room create/join
   Socket: room join, waiting room
4. Admin Ludo King room credentials publish karta hai:
   POST /api/admin/rooms/:roomId/publish-credentials { ludoKingRoomId, ludoKingPassword }
   Socket: room:credentials-published to room participants
5. Admin game start karta hai:
   Socket: game:start
   GameState initialize hota hai (pieces positions, turn order)
6. Real-time gameplay:
   dice:roll → turn validation → movement calculation → capture check → win check
   All via gameSocket.js handlers
7. Game complete:
   Winner reward credited, all players recorded in GameHistory
```

### Game Engine (server-side)
Sab game logic server pe hota hai:
- `dice.engine.js` — dice roll, turn management
- `movement.engine.js` — piece movement with Ludo rules
- `capture.engine.js` — piece capture logic
- `winning.engine.js` — safe squares, win condition
- `board.config.js` — board layout, home columns, safe squares
- `turn.engine.js` — turn rotation, skip on no valid moves

---

## 14. Tournament System

4-player bracket tournaments with entry fee and prize pool.

```
1. Admin tournament create karta hai:
   entryCoins, prizePool, maxPlayers=4, gameMode, startTime

2. Users join karte hain (atomic operation):
   - entryCoins deduct
   - participants array me add
   - Agar 4/4 full → status: waiting
   - Socket: tournament:full to waiting room

3. Admin Ludo King room credentials publish karta hai:
   PATCH /api/tournaments/admin/:id/publish-room { ludoKingRoomId, ludoKingPassword }
   Socket: tournament:room-published to all participants

4. Players game khelate hain Ludo King me

5. Players screenshot submit karte hain:
   POST /api/tournaments/:id/submit-screenshot
   → screenshotUrl save hota hai

6. Admin results verify karta hai:
   PATCH /api/tournaments/admin/:id/verify/:userId

7. Admin finalize karta hai:
   PATCH /api/tournaments/admin/:id/finalize
   → prizePool winner ko award hota hai
   → Tournament.status: completed
```

---

## 15. Socket.IO Real-Time Events

### Connection & Rooms
```javascript
// Server-side room assignment on connect:
socket.join(`user:${userId}`)          // Har authenticated user
socket.join('admin:room')              // main_admin / admin
socket.join(`subadmin:${userId}`)      // sub_admin

// Client-side subscriptions:
socket.emit('lobby:subscribe', { subAdminId })     // Open Battle lobby
socket.emit('battle:subscribe', { battleId })       // Specific battle
socket.emit('tournament:subscribe', { tournamentId })
```

### Events Reference

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `payment:alarm` | Server → admin + subadmin | orderId, orderRef, amount, username | New payment to verify |
| `payment:alarm-dismissed` | Server → admin + subadmin | orderId | Alarm cleared |
| `payment:status-updated` | Server → user | orderId, status, coinsAdded, redirectTo | Real-time order update |
| `wallet:updated` | Server → user | newBalance, amount | Balance changed |
| `notification:new` | Server → user | notification object | In-app notification |
| `withdrawal:new` | Server → subadmin + admin | withdrawalId, amount | New withdrawal |
| `withdrawal:updated` | Server → user | withdrawalId, status, utrReference | Withdrawal resolved |
| `withdrawal:alarm-dismissed` | Server → subadmin + admin | withdrawalId | Withdrawal resolved |
| `battle:created` | Server → lobby | battle (no credentials) | New battle in lobby |
| `battle:updated` | Server → lobby | battle (no credentials) | Battle status changed |
| `battle:started` | Server → battle room | battleId, roomId, roomPassword | Battle full, credentials |
| `battle:submission` | Server → battle + subadmin | battleId, userId, claim | Result submitted |
| `battle:result` | Server → participants | battleId, isWinner, winningPrize | Battle resolved |
| `battle:disputed` | Server → subadmin + admin | battleId, reason | Needs manual resolution |
| `battle:completed` | Server → lobby | battleId | Battle finished |
| `battle:cancelled` | Server → lobby + participants | battleId | Battle cancelled |

---

## 16. Anti-Cheat Audit Equation

Har Sub-Admin ke liye yeh equation ALWAYS satisfied honi chahiye:

```
NetCoinsIssued = coinStock + activeUserBalances + activeEscrow + totalCommissionEarned

Where:
  NetCoinsIssued      = totalCoinsIssued - totalCoinsDeducted
  coinStock           = Sub-Admin ke paas remaining unused coins
  activeUserBalances  = Σ UserSubWallet.balance (sab users ka under this sub-admin)
  activeEscrow        = Σ lockedBattleBalance + Σ lockedWithdrawalBalance
  totalCommissionEarned = Burned commission from completed battles

```

**Example:**
```
Main Admin issues 10,000 coins → NetCoinsIssued = 10,000

User A buys 500 coins:
  coinStock = 9,500  |  balances = 500  |  escrow = 0  |  commission = 0
  9,500 + 500 + 0 + 0 = 10,000 ✓

User A enters battle (200 coins):
  coinStock = 9,500  |  balances = 300  |  escrow = 200  |  commission = 0
  9,500 + 300 + 200 + 0 = 10,000 ✓

Battle ends, User A wins (prize 190, commission 10 burned):
  coinStock = 9,500  |  balances = 490  |  escrow = 0  |  commission = 10
  9,500 + 490 + 0 + 10 = 10,000 ✓

User A withdraws 400 coins (approved, revolving):
  coinStock = 9,500 + 400 = 9,900  |  balances = 90  |  escrow = 0  |  commission = 10
  9,900 + 90 + 0 + 10 = 10,000 ✓
```

**Check karne ke liye:** `GET /api/sub-admin/:id/audit` ya `/me/audit`
Response me `auditBalanced: true/false` aur `discrepancyDelta` hota hai.

---

## 17. Admin Panel

**URL:** `/admin/*` — Sirf `main_admin` / `admin` role access kar sakta hai.

### Pages

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/admin/dashboard` | User count, matches, coins distributed, revenue |
| Sub-Admins | `/admin/sub-admins` | Create, issue/deduct coins, suspend, audit |
| Payments | `/admin/payments` | All pending UPI orders across all sub-admins, approve/reject |
| Tournaments | `/admin/tournaments` | Manage tournaments, publish room credentials, verify results |
| Users | `/admin/users` | User list, block/unblock |
| Matches | `/admin/matches` | Classic play match CRUD |
| Rooms | `/admin/rooms` | Active game rooms, publish Ludo King credentials |
| Wallet | `/admin/wallet` | Wallet analytics, user transaction history |
| Results | `/admin/results` | Game results history |
| Logs | `/admin/logs` | AdminLog audit trail |
| Settings | `/admin/settings` | SystemSettings update |

### Key Features
- **Persistent payment alarm** — browser audio plays when payment needs verification
- **Real-time updates** via Socket.IO (payment:alarm, battle:disputed)
- **Sub-Admin audit** — anti-cheat equation with discrepancy highlighting
- **Scoped views** — sub-admin scope filtering for payments/withdrawals/battles

---

## 18. Sub-Admin Panel

**URL:** `/subadmin` — Sirf `sub_admin` role access kar sakta hai (main_admin bhi dekh sakta hai).

### Tabs

| Tab | Description |
|-----|-------------|
| Overview | Coin stock, audit equation, deposits vs withdrawals |
| Payments | Pending UPI orders (apne scope ke). Screenshot dekho, approve/reject karo |
| Withdrawals | Pending withdrawals. UTR ke saath approve (coins wapas stock me), ya reject (refund) |
| Battles | Disputed/result-pending battles. Screenshots dekho, winner declare karo ya cancel karo |
| UPI Settings | Apna UPI ID, holder name, note update karo. Enable/disable toggle |

---

## 19. Frontend Pages & Navigation

### User Flow

```
Landing (/) → Login (/login) or Register (/register)
    ↓
Dashboard (/dashboard)
    ├── Buy Coins (/buy-coins)
    │     → Sub-Admin select → Amount → QR/UPI Pay → Screenshot → I Have Paid → Verifying → Done
    ├── Wallet (/wallet)
    │     → Sub-wallet cards → Transactions → Withdrawals
    │     → Withdraw modal (UPI/bank details)
    ├── Open Battles (/battles)
    │     → Sub-Admin select → Lobby (create/join/leave)
    │     → Battle Detail (/battles/:id) → Room credentials → Submit result
    ├── Tournaments (/tournaments)
    │     → List → Join → Waiting room → Screenshot submit
    ├── Classic Play (/matches)
    │     → Match list → Join → Waiting room → Game room (/room/:roomId)
    ├── Leaderboard (/leaderboard)
    ├── Profile (/profile)
    └── Rules (/rules)
```

### State Management (Zustand)
```javascript
// authStore.js
{
  user,           // current user object (synced with /api/auth/me)
  isAuthenticated,
  login(credentials),
  logout(),
  refreshUser()   // re-fetch /api/auth/me after wallet changes
}

// gameStore.js
{
  gameState,      // live Ludo board state
  room,
  updateFromSocket(event, data)
}

// toastStore.js
{
  toasts,
  toast.success(msg),
  toast.error(msg),
  toast.warning(msg)
}
```

### API Client
```javascript
// lib/api/axios.js
const api = axios.create({ baseURL: '/api', withCredentials: true })

// Memory token fallback for cross-origin deployments
// Request interceptor: adds Authorization: Bearer if memory token set
// Response interceptor: on 401 → clears token, fires auth:unauthorized event
```

---

## 20. Security Architecture

### Authentication
- JWT stored in HTTP-only cookie (`SameSite=Strict` dev, `SameSite=None; Secure` prod)
- Memory token fallback for Vercel ↔ Render cross-origin setup
- Token expiry: 7 days (configurable via `JWT_EXPIRES_IN`)
- Password: bcrypt with 12 salt rounds

### Authorization
```
authenticate → requireAdmin / requireMainAdmin / requireSubAdminOrMain
```
- Suspended sub-admin → 403 at authenticate middleware (before any route handler)
- Scope enforcement: sub-admins can only approve/reject their own orders/withdrawals/battles
- Main admin can override any scope

### Rate Limiting
- Global: 200 requests / 15 minutes
- Auth endpoints: 20 requests / 15 minutes
- Payment initiation: 3 requests / 10 minutes (skipped in development)

### Input Validation
- All `POST`/`PATCH` bodies validated via Zod schemas
- `validate(schema)` middleware returns structured field-level errors

### File Uploads
- Multer: images only (jpeg, png, webp), max 8MB
- Files stored in `server/uploads/screenshots/`
- Production: should use S3 or similar (multer-s3)

### UPI URL Security
- `@` character in UPI ID is NEVER percent-encoded
- URL built manually (not via URLSearchParams) to prevent UPI app rejection
- Sub-Admin's UPI ID never exposed in public payment settings endpoint

### Room Credential Security
- `roomId` / `roomPassword` deleted in `publicBattleView()` before any list response
- Only exposed to: authenticated participants (once battle is full), sub-admin, main-admin
- Backend checks `canSeeCredentials(battle, user)` before including in response

### Idempotency
Every financial operation uses a unique `idempotencyKey`:
```
coin_purchase_{orderId}
wd_lock_{ref}
wd_approve_{id}
wd_reject_{id}
battle_entry_{battleId}_{userId}
battle_win_{battleId}_{winnerId}
battle_refund_{battleId}_{userId}
battle_comm_{battleId}
```
If key already exists → operation silently returns existing record.

---

## 21. Environment Variables

### Backend (`server/.env`)
```env
NODE_ENV=development
PORT=5000
MONGO_URI=mongodb+srv://...
JWT_SECRET=your-32-char-min-secret
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:3000,http://localhost:3001
REGISTRATION_BONUS=0
DAILY_LOGIN_REWARD=100
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your@gmail.com
EMAIL_PASS=app-password
EMAIL_FROM=noreply@ludoarena.com
```

### Frontend (`client/.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:5000
```

---

## 22. File Upload System

```
POST /api/payment/screenshot/:orderId     → PaymentOrder.screenshotUrl
POST /api/battles/:id/screenshot           → returned URL for use in submit
POST /api/tournaments/:id/submit-screenshot → Tournament participant screenshotUrl
```

Upload middleware (`middleware/upload.js`):
```javascript
multer({
  storage: diskStorage({ destination: 'uploads/screenshots/', filename: uuid+ext }),
  limits: { fileSize: 8 * 1024 * 1024 },   // 8MB
  fileFilter: allow jpeg/png/webp only
})
```

Files served at: `GET /uploads/screenshots/filename.jpg`

---

## 23. Error Handling & Logging

### Response Format
```json
{ "success": true,  "message": "...", "data": {...} }
{ "success": false, "message": "...", "errors": [{field, message}] }
```

### Error Middleware (`middleware/errorHandler.js`)
- `notFound` — 404 for unmatched routes
- `errorHandler` — catches all thrown errors, returns 500 with message

### Logging (Pino)
```javascript
logger.info({ userId, amount, type }, 'Wallet adjusted')
logger.warn({ err }, 'Replica set not available, falling back')
logger.error({ err }, 'Payment approval failed')
```
Production: JSON format → redirect to log aggregator (Logtail, Datadog, etc.)
Development: pretty-printed via `pino-pretty`

### Wallet Transaction Fallback
`wallet.service.adjustWallet()` pehle MongoDB transaction try karta hai. Agar replica set available nahi hai (e.g. dev environment) → non-transactional fallback use karta hai with idempotency key protection.

---

## 24. Testing

```bash
cd server
npm test              # all tests (unit + integration)
npm run test:unit     # game engine + model tests
npm run test:integration  # API endpoint tests
```

### Test Setup
- **Unit tests:** Jest, in-memory mocks
- **Integration tests:** Supertest + MongoMemoryServer
- **Fix:** MongoDB driver 7.x loads `os` via dynamic `import()` which fails in Jest's VM sandbox → patched in `testDb.js` with `runtimeAdapters: { os }`
- **Coverage:** 311 tests, 9 test suites

### Test Files
```
tests/unit/
  ├── game.engine.test.js        ← Ludo board rules
  ├── payment.model.test.js      ← PaymentOrder model
  ├── tournament.model.test.js   ← Tournament logic
  └── wallet.system.test.js      ← Wallet service

tests/integration/
  ├── auth.test.js               ← Register, login, JWT
  ├── admin.test.js              ← Admin CRUD, role guards
  ├── wallet.test.js             ← Balance, history, daily bonus blocked
  └── match.test.js              ← Match join, result
```

---

## 25. Deployment Notes

### Backend (Render.com / Railway)
```
Build Command: npm install
Start Command: npm start
Environment: set all env vars from §21
```

### Frontend (Vercel)
```
Build Command: npm run build
Output: .next
Environment: NEXT_PUBLIC_API_URL=https://your-backend.onrender.com
```

### Cross-Origin Setup
- Backend `CLIENT_URL` = Vercel domain(s) comma-separated
- `credentials: true` on both CORS and axios client
- `SameSite=None; Secure` cookies required for cross-origin auth

### MongoDB Atlas
- IP Whitelist: `0.0.0.0/0` (or specific Render/Vercel IPs)
- Cluster: M0 free tier works for dev; M10+ for production transactions
- Indexes auto-created by Mongoose schema definitions

### Production Checklist
- [ ] `NODE_ENV=production`
- [ ] Strong `JWT_SECRET` (32+ chars)
- [ ] Email credentials for password reset
- [ ] Screenshot storage → S3/Cloudinary (replace local multer)
- [ ] MongoDB Atlas replica set (for session transactions in wallet service)
- [ ] Rate limiting tuned for expected traffic
- [ ] HTTPS enforced (Vercel/Render handle this automatically)
- [ ] Sub-Admin UPI IDs configured before launch

---

## Quick Reference — Coin Flow Summary

```
Main Admin → issues stock → Sub-Admin.coinStock
User → pays Sub-Admin via UPI → PaymentOrder approved → UserSubWallet.balance
UserSubWallet.balance → battle/tournament/match entry → locked/deducted
Winning → UserSubWallet.balance credited
User → withdrawal request → locked → Sub-Admin pays UPI → approved → stock revolves back
Commission → BURNED (counted, returned to no one)
User.walletBalance = SUM of all UserSubWallets (auto-synced)
```

---

*Documentation generated from source code — `server/` commit `ae3a2c2`, `client/` commit `742534d`*
