# User Profile API

Related SRS: `docs/SRS/auth-service.md`, `docs/SRS/README.md`

This document separates profile-facing endpoints from authentication endpoints. Account security endpoints remain in `auth-api.md`.

## Resource Summary

| Resource | Description |
| :--- | :--- |
| `UserProfile` | Public and private profile metadata. |
| `AuthorProfile` | Public author information and work list summary. |

## Endpoints

### GET /users/{userId}/profile

Get public user profile.

**Auth:** Optional  
**Roles:** Guest, Reader, Author, Admin

**Response**

```json
{
  "success": true,
  "data": {
    "userId": "user_123",
    "username": "author01",
    "displayName": "Author One",
    "avatarUrl": "https://example.com/avatar.png",
    "bio": "Fantasy novelist.",
    "role": "AUTHOR"
  },
  "error": null,
  "meta": {}
}
```

**Errors:** `NOT_FOUND_001`

### GET /authors/{authorId}/profile

Get public author profile with novel summary.

**Auth:** Optional  
**Roles:** Guest, Reader, Author, Admin

**Response**

```json
{
  "success": true,
  "data": {
    "authorId": "user_author_1",
    "displayName": "Author One",
    "bio": "Fantasy novelist.",
    "followersCount": 200,
    "novels": [
      {
        "novelId": "novel_123",
        "title": "The Moonlit Archive",
        "status": "PUBLISHED"
      }
    ]
  },
  "error": null,
  "meta": {}
}
```

### GET /users/me/profile

Get current user's private profile.

**Auth:** Required  
**Roles:** Reader, Author, Admin

### PATCH /users/me/profile

Update current user's profile metadata.

**Auth:** Required  
**Roles:** Reader, Author, Admin

**Request**

```json
{
  "displayName": "Author One",
  "bio": "Fantasy novelist.",
  "avatarUrl": "https://example.com/avatar.png"
}
```

### GET /users/me/settings

Get current user's account-level settings.

**Auth:** Required  
**Roles:** Reader, Author, Admin

### PATCH /users/me/settings

Update current user's account-level settings.

**Auth:** Required  
**Roles:** Reader, Author, Admin

**Request**

```json
{
  "language": "vi",
  "notificationEnabled": true
}
```
