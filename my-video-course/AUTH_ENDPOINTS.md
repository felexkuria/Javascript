# Authentication API Endpoints

## Overview
This document describes the authentication endpoints for the Video Course Platform using AWS Cognito.

## Base URL
All endpoints are prefixed with `/api/auth`

## Endpoints

### 1. Sign Up
**POST** `/api/auth/signup`

Creates a new user account in AWS Cognito.

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com", 
  "password": "SecurePass123",
  "role": "student" // optional, defaults to "student"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Account created! Check your email for confirmation code."
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "Password must be at least 8 characters with uppercase, lowercase, and number"
}
```

### 2. Confirm Sign Up
**POST** `/api/auth/confirm`

Confirms user account with email verification code.

**Request Body:**
```json
{
  "email": "john@example.com",
  "confirmationCode": "123456"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Account confirmed successfully"
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "Invalid confirmation code"
}
```

### 3. Sign In
**POST** `/api/auth/signin`

Authenticates user and returns tokens.

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "SecurePass123"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "idToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "email": "john@example.com",
    "role": "student"
  },
  "redirect": "/dashboard"
}
```

**Error Response (401):**
```json
{
  "success": false,
  "error": "Invalid email or password"
}
```

### 4. Forgot Password
**POST** `/api/auth/forgot-password`

Initiates password reset process.

**Request Body:**
```json
{
  "email": "john@example.com"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Password reset code sent to your email"
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "No account found with this email"
}
```

### 5. Confirm Forgot Password
**POST** `/api/auth/confirm-forgot`

Completes password reset with verification code.

**Request Body:**
```json
{
  "email": "john@example.com",
  "code": "123456",
  "newPassword": "NewSecurePass123"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Password reset successfully"
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "Invalid reset code"
}
```

## Error Codes

### Common Cognito Error Mappings:
- `UsernameExistsException` → "An account with this email already exists"
- `InvalidPasswordException` → "Password must be at least 8 characters with uppercase, lowercase, and number"
- `NotAuthorizedException` → "Invalid email or password"
- `UserNotConfirmedException` → "Please confirm your email first"
- `UserNotFoundException` → "User not found" / "No account found with this email"
- `CodeMismatchException` → "Invalid confirmation code" / "Invalid reset code"
- `ExpiredCodeException` → "Confirmation code has expired" / "Reset code has expired"

## Authentication Flow

1. **Sign Up** → User creates account
2. **Confirm** → User verifies email with code
3. **Sign In** → User authenticates and receives tokens
4. **Use Tokens** → Include `accessToken` in Authorization header for protected routes

## Session Management

After successful sign-in, the server sets a session cookie containing user information for web routes. API routes should use the `accessToken` in the Authorization header:

```
Authorization: Bearer <accessToken>
```

## Role-Based Redirects

- **Teacher**: Redirected to `/admin/courses`
- **Student**: Redirected to `/dashboard`