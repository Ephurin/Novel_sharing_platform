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

Request a confirmation email for an `@gmail.com` address. It contains a confirmation link and an eight-digit backup code. A `202 Accepted` response returns `registrationId`, `email`, and `resendAfterSeconds` and sets an HTTP-only browser cookie for link verification and resend. The account and login session are created after confirmation.

**Auth:** Optional  
**Roles:** Guest

**Request**

```json
{
  "email": "reader@gmail.com",
  "username": "reader01",
  "password": "StrongPassword123!"
}
```

**Response**

```json
{
  "success": true,
  "data": {
    "registrationId": "6e32f264-731c-445e-9965-5e1ff6a90062",
    "email": "reader@gmail.com",
    "resendAfterSeconds": 60
  },
  "error": null,
  "meta": {}
}
```

| Code | HTTP | Condition |
| :--- | :---: | :--- |
| `AUTH_001` | 400 | Invalid email format. |
| `AUTH_EMAIL_DOMAIN` | 400 | Registration requires a Gmail address. |
| `VALIDATION_001` | 400 | Missing or weak password. |
| `USER_004` | 409 | Username already exists. |
| `USER_005` | 409 | Email already exists. |
| `AUTH_EMAIL_RATE_LIMIT` | 429 | A confirmation email was requested less than a minute ago. |
| `AUTH_EMAIL_UNAVAILABLE` | 503 | Email delivery is unavailable. |

### POST /auth/register/resend

Submit `registrationId` from the signup browser with the registration cookie and the configured web origin. Resend is available one minute after the last send, for up to one hour. A successful resend returns the same `202 Accepted` response as signup and replaces the old link and backup code. The new pair is valid for 15 minutes. A failed send preserves the previous pair.

| Code | HTTP | Condition |
| :--- | :---: | :--- |
| `AUTH_EMAIL_BROWSER` | 403 | The registration cookie or origin is invalid. |
| `AUTH_EMAIL_REGISTRATION_EXPIRED` | 400 | The pending registration expired or was consumed. |
| `AUTH_EMAIL_RATE_LIMIT` | 429 | The resend cooldown is active. |
| `AUTH_EMAIL_UNAVAILABLE` | 503 | Email delivery is unavailable. |

### POST /auth/register/verify

Submit `registrationId` and the eight-digit `code` received by email. The code expires after 15 minutes and allows up to five incorrect attempts. A verified registration creates a `READER` account and returns `201 Created` with an access token and an HTTP-only refresh cookie.

**Response**

```json
{
  "success": true,
  "data": {
    "user": {
      "userId": "user_123",
      "email": "reader@gmail.com",
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
| `AUTH_EMAIL_CODE` | 400 | Invalid, expired, or used confirmation code. |
| `USER_004` | 409 | Username already exists. |
| `USER_005` | 409 | Email already exists. |
| `VALIDATION_001` | 400 | Invalid registration ID or code format. |

### POST /auth/register/verify-link

The link opens `/verify-email#token=…` on the configured `WEB_ORIGIN`. Only pressing the confirmation button submits `token` in a POST from the browser that started registration. This method and the backup code use the same pending registration. Either successful verification consumes both and returns `201 Created` with the same session response.

| Code | HTTP | Condition |
| :--- | :---: | :--- |
| `AUTH_EMAIL_BROWSER` | 403 | The request is missing the signup browser cookie or comes from another origin. Use the code in the signup tab. |
| `AUTH_EMAIL_LINK` | 400 | The link is invalid, expired, or used. |

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
