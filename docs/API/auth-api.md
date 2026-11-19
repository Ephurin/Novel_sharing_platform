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

Request a confirmation email for an `@gmail.com` address. It contains a confirmation link, an eight-digit backup code and an email-ownership recovery link. A `202 Accepted` response sets an HTTP-only browser cookie and returns the signup status. The account and login session are created after confirmation.

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
    "expiresAt": "2026-11-19T16:00:00.000Z",
    "resendAfterSeconds": 60,
    "resendsRemaining": 3
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
| `AUTH_EMAIL_RATE_LIMIT` | 429 | The address already has an active signup session. Resume that session or use the recovery link from the mailbox. |
| `AUTH_EMAIL_DELIVERY_LIMIT` | 429 | Five deliveries for this address have already been accepted within the current one-hour window. |
| `AUTH_EMAIL_UNAVAILABLE` | 503 | Email delivery is unavailable. |

### POST /auth/register/resend

Submit `registrationId` from the signup browser with the registration cookie and the configured web origin. There is a one-minute cooldown and a maximum of three successful resends per registration. The signup deadline is one hour after creation. It does not move when resending. A successful resend replaces both proofs and returns the updated signup status. The new pair is valid for up to 15 minutes within the absolute deadline. A failed send preserves the previous pair and does not consume a delivery.

| Code | HTTP | Condition |
| :--- | :---: | :--- |
| `AUTH_EMAIL_BROWSER` | 403 | The registration cookie or origin is invalid. |
| `AUTH_EMAIL_REGISTRATION_EXPIRED` | 400 | The pending registration expired or was consumed. |
| `AUTH_EMAIL_RATE_LIMIT` | 429 | The resend cooldown is active. |
| `AUTH_EMAIL_RESEND_LIMIT` | 429 | All three resends have been used. |
| `AUTH_EMAIL_DELIVERY_LIMIT` | 429 | The address has reached its hourly delivery limit. |
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

### Native email registration

`POST /auth/register/native` accepts the same fields as web registration and sends an eight-digit code for the StoryCraft app. Its `202` response includes a signed `resendToken` bound to the pending registration. Submit `registrationId` and `code` to `POST /auth/register/verify` to finish signup.

`POST /auth/register/native/resend` requires `registrationId` and the app's `resendToken`. The signed token expires at the original signup deadline. The same delivery and resend limits apply, including when the previous code is expired or exhausted. On Android and iOS the app keeps the token, registration ID and deadline in secure storage until verification, cancellation or expiry.

### Pending registration and cancellation

`POST /auth/register/pending` returns the current signup status or `null` using the original web origin and HTTP-only cookie. `POST /auth/register/cancel` requires the same cookie, origin and `registrationId`. Native clients send `registrationId` and `resendToken` to `POST /auth/register/native/pending` or `POST /auth/register/native/cancel`. Cancellation returns `204` and releases the signup without resetting the address's delivery budget.

### POST /auth/register/recover

Submit the recovery `token` from the email with a fresh `username` and `password` from the configured web origin. The token proves ownership of an email address for one hour from delivery and works independently of a browser cookie or native signup ticket. Recovery creates the account using the new credentials and atomically clears any previous signup for that address. It cannot change an existing account's password.

### Google sign-in availability

Google Identity Services is supported on the website. Android and iOS use password login. An account first created through Google sign-in can continue on the website with Google. Linking Google to an existing password account preserves password access in the mobile app.

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
