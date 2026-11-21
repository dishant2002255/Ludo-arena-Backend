# Ludo Arena — Wallet System Documentation

**Last Updated:** Current build  
**Status:** Fully implemented and tested

---

## 1. Overview

Ludo Arena has a **virtual coin wallet** system. Coins are free-to-play credits with no monetary value.

There are **three ways to get coins:**

| Method | Type | Amount | Requires |
|--------|------|--------|---------|
| Registration Bonus | Auto-credit | 50 coins | Sign up |
| Daily Login Bonus | User-claimed | 100 coins | Once per 24 hours |
| Free Coin Request | Admin-approved | Min 200 | Submit request + admin approval |
| UPI Coin Purchase | Admin-verified | Min 200 | Pay via UPI + admin verification |
| Tournament Reward | Auto-credit | Configured | Win a tournament |
| Match Win Reward | Auto-credit | Configured | Win a classic Ludo match |
| Admin Manual Grant | Admin action | Variable | Admin adjusts directly |

**Important rules:**
- Coins cannot be purchased with real money through any automated system
- All UPI payments are manually verified by admin — no automated payment processing
- Coins cannot be withdrawn, transferred, or redeemed for cash
- Balance is always calculated server-side — the frontend never determines balance

---

## 2. Coin Transaction Types

All coin movements are stored in `WalletTransaction` with these types:

| Type | Direction | How It Happens |
|------|-----------|----------------|
| `registration_bonus` | +Credit | Auto on first sign-up (50 coins) |
| `daily_bonus` | +Credit | User claims once every 24 hours (100 coins) |
| `match_entry` | −Debit | User joins a paid Classic Play match |
| `match_win` | +Credit | User wins a Classic Play match (server-verified) |
| `tournament_reward` | +Credit | User wins a Tournament (server-verified) |
| `coin_request` | +Credit | Admin approves a free coin request |
| `coin_purchase` | +Credit | Admin approves a UPI payment (manual verify) |
| `admin_adjust` | +/−Both | Admin manually adjusts from Admin Panel |
| `admin_correction` | +/−Both | Admin correction with audit trail |
| `refund` | +Credit | Match/tournament cancellation refund |

---

## 3. Complete Wallet Flow Diagram

```
USER REGISTRATION
      │
      ▼
50 coins auto-credited (registration_bonus)
      │
      ▼
User can get more coins via:
      │
      ├──► Daily Bonus (100 coins/day) ──────────────────────────┐
      │       User clicks Claim → POST /wallet/daily-bonus/claim  │
      │       Server checks 24h cooldown → credits if eligible    │
      │                                                            │
      ├──► Free Coin Request ──────────────────────────────────────┤
      │       User submits request (min 200, reason required)     │
      │       POST /wallet/coin-requests                          │
      │       Status: pending → admin reviews →                   │
      │         Approved: coins credited instantly                 │
      │         Rejected: no balance change                       │
      │                                                            │
      ├──► UPI Coin Purchase (1 coin = ₹1) ────────────────────────┤
      │       [SEE SECTION 5 — FULL FLOW BELOW]                   │
      │                                                            │
      ├──► Classic Play Win ────────────────────────────────────────┤
      │       Win a Ludo match → server credits winner reward     │
      │       Idempotent: rewardDistributed flag prevents double   │
      │                                                            │
      └──► Tournament Win ─────────────────────────────────────────┘
              Win a Tournament → admin finalizes → server credits
              Idempotent: idempotencyKey prevents double credit
```

---

## 4. Free Coin Request Flow

For users who cannot pay but want more coins for demo/testing:

### User Steps
1. Go to **Wallet** page → click **"Request Free Coins"**
2. Enter amount (minimum **200 coins**, max **10,000**)
3. Enter reason (minimum 10 characters)
4. Submit → `POST /api/wallet/coin-requests`
5. Status shows as **Pending**
6. User receives a real-time notification when reviewed

### Admin Steps
1. Admin → **Wallet** page → see all pending requests
2. Search by username or filter by status (Pending / Approved / Rejected)
3. Click **Approve** → enter optional remarks → confirm
   - Coins credited atomically to user wallet
   - `CoinRequest` status set to `approved`
   - User gets socket notification + balance updates in real time
4. Or click **Reject** → user notified with reason

### Rules
- Only one pending request per user at a time
- Admin cannot approve their own request
- Once approved/rejected, status cannot be changed
- Idempotency key: `coin_req_approve_{requestId}` prevents double credit

### API Endpoints
```
POST   /api/wallet/coin-requests              → Submit request
GET    /api/wallet/coin-requests              → View my requests
GET    /api/admin/coin-requests               → Admin: list all
GET    /api/admin/coin-requests/:id           → Admin: view details
PATCH  /api/admin/coin-requests/:id/approve  → Admin: approve
PATCH  /api/admin/coin-requests/:id/reject   → Admin: reject
```

---

## 5. UPI Coin Purchase Flow (Complete)

**Important:** This is a **manual verification system**. No automated payment processing.  
Admin personally checks their bank account and approves manually.

### How the User Experience Works

```
Step 1 — Select Amount
  User opens Buy Coins page → selects amount (200, 500, 1000, 2000, 5000 or custom)
  Minimum: ₹200 | Maximum: ₹10,000 | Rate: 1 coin = ₹1
  Clicks "Proceed to Pay ₹X"
       │
       ▼
Step 2 — QR Code + UPI ID shown
  Backend creates PaymentOrder (status: pending)
  Generates UPI QR code from: upi://pay?pa=ADMIN_UPI_ID&am=AMOUNT&...
  User sees:
    ┌─────────────────────────────────────────┐
    │  [QR CODE — scan with any UPI app]      │
    │  ─────────── OR ───────────             │
    │  UPI ID: admin@upi        [COPY]        │
    │  Amount: ₹200             [COPY]        │
    │  Reference: LA-XXXXX      [COPY]        │
    └─────────────────────────────────────────┘
  User opens GPay / PhonePe / Paytm → scans QR or enters UPI ID manually
       │
       ▼
Step 3 — Upload Payment Screenshot (MANDATORY)
  After paying in their UPI app, user comes back to the website
  User uploads screenshot of payment confirmation (JPG/PNG/WebP, max 8MB)
  Screenshot is stored in server/uploads/screenshots/
       │
       ▼
Step 4 — Click "I Have Paid"
  POST /api/payment/screenshot/:orderId  → uploads screenshot
  POST /api/payment/notify/:orderId      → notifies admin, fires alarm
  Page switches to "Admin is Verifying Your Payment" screen
       │
       ▼
Step 5 — Admin Verifies
  Admin receives persistent alarm notification in Admin → Payments
  Admin checks their own bank / UPI app manually
  Admin views the user's payment screenshot in the admin panel
  Admin clicks Approve (or Reject)
       │
       ▼
Step 6 — Coins Credited (on approval)
  Coins added to user wallet atomically
  PaymentOrder status → approved
  User's page automatically shows "Coins Transferred! 🎉"
  Page redirects to Wallet after 5 seconds
  Real-time: socket event payment:status-updated sent to user
```

### PaymentOrder Status Lifecycle

```
pending → admin_notified → approved
                        ↘ rejected
        ↘ expired (auto after 30 minutes if not acted on)
```

| Status | Meaning |
|--------|---------|
| `pending` | Order created, QR code shown to user |
| `admin_notified` | User clicked "I Have Paid" + screenshot uploaded |
| `approved` | Admin verified payment, coins credited |
| `rejected` | Admin rejected (payment not received or wrong amount) |
| `expired` | Auto-expired after 30 minutes (TTL index) |

### API Endpoints
```
GET    /api/payment/settings                      → Public: pricing, UPI enabled?
POST   /api/payment/initiate                      → Create order + get QR code
POST   /api/payment/screenshot/:orderId           → Upload payment screenshot
POST   /api/payment/notify/:orderId               → Notify admin (fires alarm)
GET    /api/payment/order/:orderId                → Poll order status
GET    /api/payment/my-orders                     → User's order history

GET    /api/payment/admin/settings                → Admin: get full settings
PATCH  /api/payment/admin/settings                → Admin: configure UPI ID etc.
GET    /api/payment/admin/all                     → Admin: all orders (filterable)
GET    /api/payment/admin/pending                 → Admin: pending orders only
PATCH  /api/payment/admin/:orderId/approve        → Admin: approve + credit coins
PATCH  /api/payment/admin/:orderId/reject         → Admin: reject payment
PATCH  /api/payment/admin/:orderId/dismiss-alarm  → Admin: dismiss alarm (no action)
```

### Admin Payment Alarm
When user clicks "I Have Paid":
- Admin receives a **persistent beeping alarm** (mobile ring tone) in Admin → Payments
- Alarm continues every 3 seconds until admin approves, rejects, or dismisses
- Admin can click **Mute** to silence without acting
- Shows all pending payments with username, amount, reference

### Real-Time Updates (Socket Events)

| Event | Direction | Trigger |
|-------|-----------|---------|
| `payment:alarm` | Server → admin:room | User submits "I Have Paid" |
| `payment:alarm-dismissed` | Server → admin:room | Admin dismisses alarm |
| `payment:status-updated` | Server → user socket | Admin approves or rejects |
| `wallet:updated` | Server → user socket | Coins credited to wallet |

### How to Activate UPI Payments
1. Go to **Admin → Settings**
2. Enter your **UPI ID** (e.g. `yourname@upi` or `9999999999@paytm`)
3. Enter your **Name** (displayed to user during payment)
4. Toggle **"Enable UPI Coin Purchases"** to ON
5. Save settings

**UPI URL Format used:**  
`upi://pay?pa=YOURUPI@ID&pn=YourName&am=200.00&cu=INR&tn=LudoArena+LA-REF&tr=LA-REF`

Note: `@` is kept unencoded in the URL — encoding it as `%40` causes UPI apps to show "Payment declined for security reasons".

### Why QR Code Instead of App Deep-Links
UPI apps (GPay, PhonePe, Paytm, AmazonPay) **block** `upi://` protocol deep-links from websites because:
- Websites are not registered merchants with NPCI
- Chrome on Android blocks `upi://` from non-app contexts
- QR codes bypass this — user opens app manually and scans

---

## 6. Admin UPI Configuration Settings

Stored in `SystemSettings` model (singleton document):

| Field | Default | Description |
|-------|---------|-------------|
| `upiEnabled` | `false` | Master switch — must be enabled by admin |
| `upiId` | `''` | Admin's UPI ID (e.g. `name@upi`) |
| `upiName` | `''` | Display name shown to user |
| `upiNote` | `'Ludo Arena Coins Purchase'` | Payment note |
| `coinPriceRupees` | `1` | 1 coin = ₹1 |
| `minimumPurchaseCoins` | `200` | Min ₹200 per order |
| `maximumPurchaseCoins` | `10000` | Max ₹10,000 per order |
| `orderExpiryMinutes` | `30` | Auto-expire pending orders |
| `adminAlarmEnabled` | `true` | Enable payment alarm sound |

---

## 7. Wallet Page (User Interface)

**Path:** `/wallet`

Displays:
- Current coin balance
- Total coins earned (all time)
- Total coins used (all time)
- Total match/tournament rewards

**Tabs:**
1. **Transaction History** — all transactions with type, amount, balance after, timestamp
2. **Coin Requests** — free coin requests with status (Pending/Approved/Rejected)

**Actions available:**
- Claim Daily Bonus (100 coins, once per 24h)
- Request Free Coins (min 200, needs reason, admin approval)
- Buy Coins (UPI payment — only if admin has enabled + configured UPI)

---

## 8. Database Models

### WalletTransaction
```
user            ObjectId → User        (required, indexed)
type            String enum             (see transaction types)
amount          Number                  (+credit / -debit)
balanceBefore   Number
balanceAfter    Number
description     String
room            ObjectId → Room         (optional — for match transactions)
match           ObjectId → Match        (optional)
tournament      ObjectId → Tournament   (optional)
paymentOrder    ObjectId → PaymentOrder (optional — for UPI purchases)
coinRequest     ObjectId → CoinRequest  (optional — for free requests)
adjustedBy      ObjectId → User         (optional — admin who acted)
idempotencyKey  String                  (unique, sparse — prevents duplicates)
```

### CoinRequest (Free Coin Request)
```
user              ObjectId → User
requestedAmount   Number (min 200)
reason            String (min 10 chars, max 500)
status            enum: pending | approved | rejected
adminRemarks      String (max 500)
reviewedBy        ObjectId → User (admin)
reviewedAt        Date
walletTransaction ObjectId → WalletTransaction (linked after approval)
```

### PaymentOrder (UPI Coin Purchase)
```
user                   ObjectId → User
coinsRequested         Number (min 200)
amountRupees           Number (min 200) — same value since 1 coin = ₹1
orderReference         String (unique) — shown to user as payment note
status                 enum: pending | admin_notified | approved | rejected | expired
upiPlatform            enum: gpay | phonepe | paytm | bhim | other
screenshotUrl          String — uploaded payment proof image path
screenshotOriginalName String
screenshotSubmittedAt  Date
adminRemarks           String
reviewedBy             ObjectId → User (admin)
reviewedAt             Date
walletTransaction      ObjectId → WalletTransaction (linked after approval)
adminAlarmActive       Boolean — true while alarm is ringing
adminAlarmDismissedAt  Date
expiresAt              Date — auto-expires pending orders via TTL index
```

### SystemSettings (UPI Configuration)
```
key                   String ('global' — singleton)
upiEnabled            Boolean (default: false)
upiId                 String — admin's UPI ID
upiName               String — display name
upiNote               String — payment note
coinPriceRupees       Number (default: 1)
minimumPurchaseCoins  Number (default: 200)
maximumPurchaseCoins  Number (default: 10000)
orderExpiryMinutes    Number (default: 30)
adminAlarmEnabled     Boolean (default: true)
upiApps               Object — which apps to show (gpay/phonepe/paytm/bhim)
```

---

## 9. Security Rules

| Rule | Implementation |
|------|----------------|
| Balance never goes negative | `adjustWallet()` throws if `newBalance < 0` |
| Balance never calculated client-side | All balance changes via `adjustWallet()` server-side only |
| No duplicate transactions | `idempotencyKey` unique index on WalletTransaction |
| No duplicate approvals | Idempotency keys on every approval operation |
| Admin cannot approve own request | Checked in `approveCoinRequest()` service |
| Only admins can approve/grant | `requireAdmin` middleware on all admin wallet APIs |
| Payment not auto-processed | No webhook, no payment gateway — 100% manual |
| Screenshot required before notify | Frontend enforces; server stores it atomically |
| Coins not withdrawable | No withdrawal endpoint exists anywhere in codebase |
| Coins not transferable | No transfer endpoint exists anywhere in codebase |
| All admin actions audited | `AdminLog` created for every wallet admin action |
| UPI ID not exposed publicly | `getPublicSettings` returns `upiConfigured: bool` only, not the ID |

---

## 10. Error Scenarios & Handling

| Scenario | What Happens |
|----------|-------------|
| User clicks "I Have Paid" without screenshot | Frontend blocks — shows "Please upload screenshot first" |
| Screenshot upload fails | Error shown, user stays on PAY step — can retry |
| Admin notification fails after screenshot | Non-fatal — user proceeds to VERIFYING, admin sees order in list |
| Order expires (30 min) | Status → `expired`, user shown "Order Expired" screen |
| Admin approves twice | Idempotency key blocks second credit silently |
| Wallet debit exceeds balance | 400 error: "Insufficient coins" |
| Duplicate free coin request | 400 error: "You already have a pending coin request" |

---

## 11. Atomic Operations & Idempotency Keys

Every wallet credit/debit goes through `adjustWallet()` in `wallet.service.js`.

**Idempotency keys used:**

| Operation | Idempotency Key Pattern |
|-----------|------------------------|
| Registration bonus | `reg_bonus_{userId}` |
| Daily bonus | `daily_bonus_{userId}_{dateString}` |
| Match entry deduction | `match_entry_{userId}_{roomId}` |
| Match win reward | `match_win_{userId}_{roomId}` |
| Tournament reward | `tournament_reward_{userId}_{tournamentId}` |
| Free coin request approval | `coin_req_approve_{requestId}` |
| UPI purchase approval | `coin_purchase_{orderId}` |

**MongoDB Transaction Support:**
- Tries replica-set transactions first
- Falls back to non-transactional updates on standalone MongoDB (local dev)
- Production should use MongoDB Atlas with replica set for full ACID guarantees

---

## 12. Notification Events (Complete List)

All delivered via Socket.IO to `user:{userId}` room:

| Notification Type | When Triggered |
|-------------------|----------------|
| `coin_request_submitted` | User submits free coin request |
| `coin_request_approved` | Admin approves free coin request |
| `coin_request_rejected` | Admin rejects free coin request |
| `payment_approved` | Admin approves UPI payment → coins credited |
| `payment_rejected` | Admin rejects UPI payment |
| `payment_alarm` | User clicks "I Have Paid" → fires to admin:room |
| `match_won` | User wins a classic Ludo match |
| `match_result` | Classic Ludo match finishes (all 4 players) |
| `tournament_completed` | Tournament finalized by admin |
| `wallet:updated` socket event | Balance changes in real time |
| `payment:status-updated` socket event | UPI order approved/rejected |

---

## 13. Quick Summary

```
Coins in = Registration(50) + Daily(100/day) + Free Request(admin) 
         + UPI Purchase(admin-verified) + Win Rewards(auto)

Coins out = Classic Play entry fee + Tournament entry fee

Coins never = withdrawn / transferred / redeemed / auto-purchased / expiring
```
