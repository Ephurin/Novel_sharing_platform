# API Conventions

This document defines shared API conventions for the Ephurin Novel Platform. All service API documents should follow these rules unless explicitly stated otherwise.

## Base URL

```txt
/api/v1
```

Example:

```txt
GET /api/v1/novels
```

## Authentication

Protected endpoints require an access token:

```http
Authorization: Bearer <accessToken>
```

Refresh tokens are stored in HTTP-only cookies and are used only by refresh/logout endpoints.

## Response Envelope

### Success

```json
{
  "success": true,
  "data": {},
  "error": null,
  "meta": {}
}
```

### Error

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_001",
    "message": "Invalid request payload",
    "details": {}
  },
  "meta": {}
}
```

## Pagination

List endpoints should support:

| Query | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `page` | number | `1` | Page number, starting from 1. |
| `limit` | number | `20` | Number of items per page. |
| `sort` | string | `createdAt` | Sort field. |
| `order` | string | `desc` | `asc` or `desc`. |

Pagination metadata:

```json
{
  "meta": {
    "page": 1,
    "limit": 20,
    "totalItems": 125,
    "totalPages": 7
  }
}
```

## Dates

All date/time values use ISO 8601:

```txt
2026-07-15T10:30:00Z
```

## IDs

IDs are represented as strings in API responses, regardless of database implementation.

```json
{
  "novelId": "novel_123"
}
```

## Enum Style

Use `UPPER_SNAKE_CASE` for enums.

Examples:

- `DRAFT`
- `PENDING_MODERATION`
- `PUBLISHED`
- `REJECTED`
- `APPROVED`
- `PENDING`
- `SUCCESS`
- `FAILED`

## HTTP Status Codes

| Status | Meaning |
| :--- | :--- |
| `200 OK` | Request succeeded. |
| `201 Created` | Resource created. |
| `204 No Content` | Request succeeded with no response body. |
| `400 Bad Request` | Invalid request payload/query. |
| `401 Unauthorized` | Missing or invalid authentication. |
| `403 Forbidden` | Authenticated but not allowed. |
| `404 Not Found` | Resource not found. |
| `409 Conflict` | Duplicate or invalid state transition. |
| `422 Unprocessable Entity` | Business validation failed. |
| `429 Too Many Requests` | Rate limit exceeded. |
| `500 Internal Server Error` | Unexpected system error. |
| `503 Service Unavailable` | Dependent service unavailable. |

## Endpoint Documentation Template

Use this structure for every endpoint:

| Section | Required | Notes |
| :--- | :---: | :--- |
| Heading | Yes | `### METHOD /resource/path` |
| Purpose | Yes | One short sentence. |
| Auth | Yes | Required, Optional, Internal/mock only, or Refresh token cookie. |
| Roles | Yes | Guest, Reader, Author, Admin, System. |
| Request | If applicable | JSON body or query table. |
| Response | Yes | Success envelope or `204 No Content`. |
| Errors | Yes | Error code, HTTP status, and condition. |
