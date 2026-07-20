# Phase 6 Mock Wallet Backend APIs Checklist

Use this checklist after Phase 5 is approved.

Phase 6 implements mock/demo wallet APIs only. It does not integrate real payment gateways, real cards, real banks, or real-money transfer.

## 1. Implemented Scope

- [x] Add `transaction_type` enum.
- [x] Add `transaction_status` enum.
- [x] Add `transactions` table.
- [x] Add `deposit_sessions` table.
- [x] Add `chapter_unlocks` table.
- [x] Add `withdraw_requests` table.
- [x] Add `GET /api/v1/wallet/me`.
- [x] Add `GET /api/v1/wallet/transactions`.
- [x] Add `POST /api/v1/wallet/deposit-sessions`.
- [x] Add `POST /api/v1/wallet/mock-webhook/deposit-success`.
- [x] Add `POST /api/v1/chapters/{chapterId}/unlock`.
- [x] Add `POST /api/v1/authors/{authorId}/donations`.
- [x] Add `POST /api/v1/wallet/withdraw-requests`.
- [x] Reader VIP chapter endpoint allows access after unlock.

## 2. Validation

- [x] `npm.cmd --prefix backend run typecheck` passes.
- [x] `npm.cmd --prefix backend run build` passes.
- [x] `npm.cmd --prefix backend run db:migrate` applies `007_wallet_transactions.sql`.
- [x] Smoke test creates a published VIP chapter fixture.
- [x] Wallet starts with available/locked balances.
- [x] Mock deposit session is created as `PENDING`.
- [x] Mock deposit success credits wallet and creates `DEPOSIT` transaction.
- [x] VIP chapter read is blocked before unlock.
- [x] Unlock deducts reader Coins, credits author Coins, creates unlock record and transaction.
- [x] VIP chapter read works after unlock.
- [x] Donation deducts reader Coins, credits author Coins, creates transaction.
- [x] Author withdraw request locks Coins and creates pending transaction.
- [x] Transaction history includes deposit, unlock, and donation rows.

## 3. Manual Review Guide

Run backend:

```txt
npm.cmd --prefix backend run dev
```

Postman collection:

```txt
docs/API/postman/phase-6-mock-wallet-backend.postman_collection.json
```

Prepare:

- one `READER` token;
- one `AUTHOR` token;
- one published VIP chapter with `is_vip = true`, `price_coins > 0`, and non-null `content`;
- the `authorId` of that chapter's novel.

If needed, make a chapter VIP/published directly in PostgreSQL:

```sql
update novels
set status = 'PUBLISHED',
    published_at = now(),
    updated_at = now()
where novel_id = '<novel_id>';

update chapters
set status = 'PUBLISHED',
    is_vip = true,
    price_coins = 50,
    content = coalesce(content, 'Published VIP test content.'),
    published_at = now(),
    updated_at = now()
where chapter_id = '<chapter_id>';
```

### 3.1 Wallet Balance

```http
GET http://localhost:4000/api/v1/wallet/me
Authorization: Bearer <READER_TOKEN>
```

Expected:

- response includes `walletId`, `coinsBalance`, and `lockedCoins`.

### 3.2 Create Mock Deposit Session

```http
POST http://localhost:4000/api/v1/wallet/deposit-sessions
Authorization: Bearer <READER_TOKEN>
Content-Type: application/json

{
  "packageCode": "COIN_500"
}
```

Expected:

- `status = PENDING`;
- response includes `depositSessionId`;
- response includes `mockPaymentUrl`.

### 3.3 Complete Mock Deposit

```http
POST http://localhost:4000/api/v1/wallet/mock-webhook/deposit-success
Content-Type: application/json

{
  "depositSessionId": "{depositSessionId}",
  "mockResult": "SUCCESS"
}
```

Expected:

- `status = SUCCESS`;
- reader wallet balance increases by package amount;
- `DEPOSIT` transaction is created.

### 3.4 VIP Read Before Unlock

```http
GET http://localhost:4000/api/v1/reading/chapters/{chapterId}
```

Expected:

- response is `402`;
- error code is `PAYMENT_002`.

### 3.5 Unlock VIP Chapter

```http
POST http://localhost:4000/api/v1/chapters/{chapterId}/unlock
Authorization: Bearer <READER_TOKEN>
```

Expected:

- `unlocked = true`;
- response includes `transactionId`;
- reader Coins decrease;
- author Coins increase;
- `chapter_unlocks` row is created.

### 3.6 VIP Read After Unlock

```http
GET http://localhost:4000/api/v1/reading/chapters/{chapterId}
Authorization: Bearer <READER_TOKEN>
```

Expected:

- response is `200`;
- content is visible.

### 3.7 Donate To Author

```http
POST http://localhost:4000/api/v1/authors/{authorId}/donations
Authorization: Bearer <READER_TOKEN>
Content-Type: application/json

{
  "amountCoins": 100,
  "message": "Thanks for the chapter!"
}
```

Expected:

- `donated = true`;
- response includes `transactionId`;
- reader Coins decrease;
- author Coins increase.

### 3.8 Author Withdraw Request

```http
POST http://localhost:4000/api/v1/wallet/withdraw-requests
Authorization: Bearer <AUTHOR_TOKEN>
Content-Type: application/json

{
  "amountCoins": 100,
  "bankAccountLabel": "Demo Bank Account"
}
```

Expected:

- `status = PENDING`;
- response includes `withdrawRequestId` and `transactionId`;
- author `coinsBalance` decreases;
- author `lockedCoins` increases.

### 3.9 Transaction History

```http
GET http://localhost:4000/api/v1/wallet/transactions
Authorization: Bearer <READER_TOKEN>
```

Expected:

- includes `DEPOSIT`, `UNLOCK`, and `DONATE` transactions after the above flow.

## 4. Phase 6 Done Criteria

- [ ] Wallet balance is readable by authenticated users.
- [ ] Mock deposit credits Coins without external payment gateway.
- [ ] All wallet mutations create transaction rows.
- [ ] VIP unlock is transaction-safe and creates permanent access.
- [ ] Reader can read unlocked VIP chapter.
- [ ] Donation transfers Coins from reader wallet to author wallet.
- [ ] Withdraw request locks author Coins and creates pending transaction.
- [ ] No real payment/card/bank data is processed.
- [ ] Phase 6 reviewed and approved.

If approved, continue to Phase 7: Admin Backend APIs.
