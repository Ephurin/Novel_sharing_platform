# Payment & Wallet API

Related SRS: `docs/SRS/payment-wallet-service.md`

## Scope

This API is mock/demo-only for the graduation-project scope. It must not process real payment cards, bank accounts, or real-money transfers.

## Resource Summary

| Resource | Description |
| :--- | :--- |
| `Wallet` | Available and locked mock Coin balance. |
| `Transaction` | Ledger entry for deposit, unlock, donation, or withdraw. |
| `DepositSession` | Mock checkout session. |
| `WithdrawRequest` | Author withdraw request pending Admin review. |

## Endpoints

### GET /wallet/me

Get current user's wallet.

**Auth:** Required  
**Roles:** Reader, Author, Admin

**Response**

```json
{
  "success": true,
  "data": {
    "walletId": "wallet_123",
    "coinsBalance": 500,
    "lockedCoins": 0
  },
  "error": null,
  "meta": {}
}
```

### GET /wallet/transactions

List current user's wallet transactions.

**Auth:** Required  
**Roles:** Reader, Author, Admin

**Query**

| Query | Description |
| :--- | :--- |
| `type` | `DEPOSIT`, `WITHDRAW`, `UNLOCK`, `DONATE`. |
| `status` | `PENDING`, `SUCCESS`, `FAILED`. |

### POST /wallet/deposit-sessions

Create a mock deposit session.

**Auth:** Required  
**Roles:** Reader, Author, Admin

**Request**

```json
{
  "packageCode": "COIN_500"
}
```

**Response**

```json
{
  "success": true,
  "data": {
    "depositSessionId": "deposit_123",
    "mockPaymentUrl": "/mock-payment/deposit_123",
    "amountCoins": 500,
    "status": "PENDING"
  },
  "error": null,
  "meta": {}
}
```

**Errors:** `PAYMENT_001`

### POST /wallet/mock-webhook/deposit-success

Mock endpoint to mark deposit as successful.

**Auth:** Internal/mock only  
**Roles:** System

**Request**

```json
{
  "depositSessionId": "deposit_123",
  "mockResult": "SUCCESS"
}
```

**Errors:** `PAYMENT_004`

### POST /chapters/{chapterId}/unlock

Unlock a VIP chapter permanently.

**Auth:** Required  
**Roles:** Reader, Author, Admin

**Response**

```json
{
  "success": true,
  "data": {
    "chapterId": "chapter_123",
    "unlocked": true,
    "transactionId": "tx_123"
  },
  "error": null,
  "meta": {}
}
```

**Errors:** `CONTENT_001`, `PAYMENT_002`, `PAYMENT_003`

### POST /authors/{authorId}/donations

Donate mock Coins to an author.

**Auth:** Required  
**Roles:** Reader, Author, Admin

**Request**

```json
{
  "amountCoins": 50,
  "message": "Thanks for the chapter!"
}
```

**Errors:** `PAYMENT_002`, `NOT_FOUND_001`

### POST /wallet/withdraw-requests

Create author withdraw request.

**Auth:** Required  
**Roles:** Author

**Request**

```json
{
  "amountCoins": 1000,
  "bankAccountLabel": "Demo Bank Account"
}
```

**Response**

```json
{
  "success": true,
  "data": {
    "withdrawRequestId": "withdraw_123",
    "transactionId": "tx_456",
    "status": "PENDING"
  },
  "error": null,
  "meta": {}
}
```

**Errors:** `PAYMENT_002`, `PAYMENT_005`
