# Auth & User Profile API

Related SRS: `docs/SRS/auth-service.md`

## Resource Summary

| Resource | Description |
| :--- | :--- |
| `User` | Account identity and role metadata. |
| `AccessToken` | Short-lived JWT sent in `Authorization` header. |
| `RefreshToken` | Long-lived token stored in HTTP-only cookie. |

## Endpoints

### POST /auth/register

Create a new account with default role `READER`.

**Auth:** Optional  
**Roles:** Guest

**Request**

```json
{
  "email": "reader@example.com",
  "username": "reader01",
  "password": "StrongPassword123!"
}
```

**Response**

```json
{
  "success": true,
  "data": {
    "user": {
      "userId": "user_123",
      "email": "reader@example.com",
      "username": "reader01",
      "role": "READER",
      "status": "ACTIVE"
    },
    "accessToken": "jwt_access_token"
  },
  "error": null,
  "meta": {}
}
```

**Errors**

| Code | HTTP | Condition |
| :--- | :---: | :--- |
| `AUTH_001` | 400 | Invalid email format. |
| `USER_004` | 409 | Username already exists. |
| `USER_005` | 409 | Email already exists. |
| `VALIDATION_001` | 400 | Missing or weak password. |

### POST /auth/login

Authenticate user and issue token pair.

**Auth:** Optional  
**Roles:** Reader, Author, Admin

**Request**

```json
{
  "identifier": "reader@example.com",
  "password": "StrongPassword123!"
}
```

**Response**

```json
{
  "success": true,
  "data": {
    "user": {
      "userId": "user_123",
      "username": "reader01",
      "role": "READER"
    },
    "accessToken": "jwt_access_token"
  },
  "error": null,
  "meta": {}
}
```

**Notes**

- Refresh token is set as HTTP-only cookie.

**Errors**

| Code | HTTP | Condition |
| :--- | :---: | :--- |
| `AUTH_003` | 401 | Invalid credentials. |
| `AUTH_004` | 403 | Account locked. |

### POST /auth/refresh-token

Issue a new access token from refresh token cookie.

**Auth:** Refresh token cookie  
**Roles:** Reader, Author, Admin

**Response**

```json
{
  "success": true,
  "data": {
    "accessToken": "new_jwt_access_token"
  },
  "error": null,
  "meta": {}
}
```

**Errors**

| Code | HTTP | Condition |
| :--- | :---: | :--- |
| `AUTH_006` | 401 | Missing, expired, or revoked refresh token. |

### POST /auth/logout

Revoke current refresh token and clear cookie.

**Auth:** Required  
**Roles:** Reader, Author, Admin

**Response**

```json
{
  "success": true,
  "data": {
    "loggedOut": true
  },
  "error": null,
  "meta": {}
}
```

### GET /auth/me

Return current authenticated user.

**Auth:** Required  
**Roles:** Reader, Author, Admin

**Response**

```json
{
  "success": true,
  "data": {
    "userId": "user_123",
    "email": "reader@example.com",
    "username": "reader01",
    "displayName": "Reader One",
    "avatarUrl": null,
    "role": "READER",
    "status": "ACTIVE"
  },
  "error": null,
  "meta": {}
}
```

### PATCH /auth/change-password

Change current user's password.

**Auth:** Required  
**Roles:** Reader, Author, Admin

**Request**

```json
{
  "currentPassword": "OldPassword123!",
  "newPassword": "NewPassword123!"
}
```

**Response**

```json
{
  "success": true,
  "data": {
    "passwordChanged": true
  },
  "error": null,
  "meta": {}
}
```

**Errors**

| Code | HTTP | Condition |
| :--- | :---: | :--- |
| `AUTH_003` | 401 | Current password is wrong. |
| `VALIDATION_001` | 400 | New password is weak or invalid. |
