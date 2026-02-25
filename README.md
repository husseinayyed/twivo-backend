# Twivo – High-Performance Social Backend API

Twivo is a performance-focused backend API for a modern social media platform inspired by Twitter/X.

The system is designed around stateless authentication, cache-first data access, modular architecture, and high-concurrency readiness.

⚠️ This project is under active architectural refactoring and is not production-ready.

---

# Design Goals

- High concurrency handling
- Stateless authentication
- Cache-first read strategy
- Strict separation of concerns
- Minimal external dependency reliance
- Security-first architecture

---

# Architecture Overview

Core principles:

- Fastify-based HTTP layer
- JWT stateless access control
- Refresh token rotation with hashing
- Redis as primary cache layer
- MongoDB as durable storage
- Modular route/service separation

High-level flow:

Client → Fastify API → Redis → MongoDB

---

# Authentication Model (Passwordless)

Twivo uses a fully passwordless authentication model.

No password fields are stored in the database.

## Step 1 – Request Magic Link

```
POST /api/auth/sign
```

Input:
- email (unique)
- username (unique)
- name

Server:
- Generates secure time-limited token
- Sends magic link via email

---

## Step 2 – Verify Magic Link

```
POST /api/auth/login
```

Server:
- Validates token
- Issues Access Token (10m)
- Issues Refresh Token (7d)
- Hashes and stores refresh token
- Sets HTTP-only secure cookies

---

## Step 3 – Refresh Token Rotation

```
POST /api/auth/refresh
```

Server:
- Validates refresh token
- Rotates refresh token
- Issues new access token

Refresh tokens are rotated on every use to reduce replay risk.

---

# Caching Strategy (Redis-First)

Redis is used as the primary read layer.

Examples:
- Session storage
- Feed caching
- Like counters
- Follow relationships

Read Strategy:
1. Attempt Redis lookup
2. Fallback to MongoDB
3. Repopulate Redis cache

This significantly reduces database pressure under high concurrency.

---

# Media Architecture

Twivo does not rely on third-party image hosting services.

An independent high-performance image server is currently under development using:

- C++
- uWebSockets

This image server will operate as a separate service and will later be integrated into Twivo as an internal media infrastructure component.

Goal:
- Maximum performance
- Minimal overhead
- Full infrastructure control

---

# Tech Stack

## Core
- Node.js (18+)
- Fastify
- MongoDB (Mongoose)
- Redis (ioredis)

## Security
- JWT (Access + Refresh)
- Secure HTTP-only cookies
- Helmet
- CORS

## Media
- Custom C++ Image Server (uWebSockets) – In Development

---

# Installation

## Clone Repository

```
git clone https://github.com/husseinayyed/twivo-backend.git
cd twivo-backend
```

## Install Dependencies

```
npm install
```

## Environment Variables

Create a `.env` file:

```
DB_URL=mongodb+srv://<username>:<password>@cluster.mongodb.net/twivo
JWT_SECRET=your_jwt_secret
REFRESH_SECRET=your_refresh_secret
FRONTEND_URL=http://localhost:3000
PORT=5000
REDIS_URL=redis://localhost:6379
NODE_ENV=development
```

## Run Development Server

```
npm run dev
```

Server runs at:

```
http://localhost:5000
```

---

# Project Structure

```
twivo-backend/
├── server.js
├── routes/
├── services/
├── models/
├── middleware/
├── Redis/
├── utils/
└── README.md
```

Structure may evolve during refactor.

---

# Roadmap

In Progress:
- Complete Express → Fastify migration
- Harden refresh token rotation logic
- Integrate internal C++ image server
- Improve schema validation

Planned:
- WebSocket-based real-time updates
- Comment system
- Direct messaging
- Notification service
- Monitoring & metrics
- API versioning

---

# Stability Notice

- API contracts may change
- Breaking changes are possible
- Not production-stable

Semantic versioning will be introduced after stabilization.

---

# Contributing

Contributions are welcome.

Recommended focus areas:
- Performance profiling
- Security auditing
- Test coverage
- Architectural improvements

Contribution flow:

```
git checkout -b feature/your-feature
git commit -m "feat: describe change"
git push origin feature/your-feature
```

Open a Pull Request after pushing.

---

# License

Licensed under GNU Affero General Public License v3.0 (AGPL-3.0).

---

# Author

Hussein Ayyed  
https://github.com/husseinayyed
