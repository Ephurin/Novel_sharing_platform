# Admin API

Related SRS: `docs/SRS/README.md`, `docs/SRS/content-control-moderation-service.md`, `docs/SRS/payment-wallet-service.md`

## Resource Summary

| Resource | Description |
| :--- | :--- |
| `UserAdminView` | Admin-managed user account summary. |
| `Taxonomy` | Genres and tags configuration. |
| `DashboardStats` | Operational dashboard statistics. |
| `WithdrawRequest` | Author withdraw request awaiting Admin decision. |

## Moderation

Moderation queue, user reports, and content decisions are owned by `docs/API/content-control-api.md`.

Admin Dashboard should call:

- `GET /admin/moderation/reviews`
- `GET /admin/moderation/reviews/{reviewId}`
- `POST /admin/moderation/reviews/{reviewId}/resolve`
- `POST /reports`

## User Management

### GET /admin/users

List users.

**Auth:** Required  
**Roles:** Admin

**Query:** `role`, `status`, `q`, pagination fields.

### PATCH /admin/users/{userId}/lock

Lock a user account.

**Auth:** Required  
**Roles:** Admin

**Request**

```json
{
  "reason": "Repeated policy violations."
}
```

### PATCH /admin/users/{userId}/unlock

Unlock a user account.

**Auth:** Required  
**Roles:** Admin

## Taxonomy

### GET /admin/taxonomy

List genres and tags.

**Auth:** Required  
**Roles:** Admin

### POST /admin/taxonomy/genres

Create a genre.

**Auth:** Required  
**Roles:** Admin

### POST /admin/taxonomy/tags

Create a tag.

**Auth:** Required  
**Roles:** Admin

## Withdraw Review

### GET /admin/withdraw-requests

List author withdraw requests.

**Auth:** Required  
**Roles:** Admin

### POST /admin/withdraw-requests/{withdrawRequestId}/approve

Approve mock withdraw request.

**Auth:** Required  
**Roles:** Admin

### POST /admin/withdraw-requests/{withdrawRequestId}/reject

Reject mock withdraw request.

**Auth:** Required  
**Roles:** Admin

**Request**

```json
{
  "reason": "Demo payout information is incomplete."
}
```

## Dashboard

### GET /admin/dashboard/stats

Get operational dashboard statistics.

**Auth:** Required  
**Roles:** Admin

**Response**

```json
{
  "success": true,
  "data": {
    "totalUsers": 1200,
    "totalNovels": 300,
    "pendingModerationItems": 12,
    "mockRevenueCoins": 150000
  },
  "error": null,
  "meta": {}
}
```
