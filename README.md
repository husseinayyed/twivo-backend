# Twivo - Social Media Backend API 🚀

![GitHub License](https://img.shields.io/badge/license-ISC-blue.svg)
![Node.js Version](https://img.shields.io/badge/node-18%2B-green.svg)
![Fastify](https://img.shields.io/badge/fastify-migrating-blue.svg)
![MongoDB](https://img.shields.io/badge/mongodb-8.17.1-orange.svg)
![Redis](https://img.shields.io/badge/redis-5.8.2-red.svg)

A high-performance, scalable backend API for a modern social media platform inspired by Twitter/X.

Built with a **fully passwordless authentication system**, Redis-first caching, and a performance-focused architecture.

---

## ⚠️ Active Refactor Notice

This backend is currently undergoing a major architectural migration.

- Express → Fastify migration in progress  
- Authentication system rebuilt (fully passwordless)  
- Custom internal image hosting replacing ImgBB  
- Modular restructuring of routes and services  

🚧 **All routes should be considered unstable.**  
🚧 **Request and response schemas may change without notice.**  
🚧 **Breaking changes may occur between commits.**

This project is under active development and is not production-stable yet.

---

# ✨ Features

- 🔐 **Fully Passwordless Authentication** – Magic-link login (no passwords stored)
- 🎟️ **JWT Access + Refresh Tokens** – Stateless scalable sessions
- ⚡ **Redis-First Caching Strategy** – Feeds, likes, follows, sessions
- 🚀 **Fastify Migration** – High-performance routing & schema validation
- 🖼️ **Custom Image Hosting (WIP)** – Removing third-party dependency
- 🛡️ **Security-First Design** – Secure cookies, CORS, Helmet
- 📦 **Modular Architecture** – Clean separation of routes, models, cache
- 📊 **Scalable MongoDB Models** – Flexible social graph design

---

# 🧠 Architecture Philosophy

Twivo is designed with:

- Stateless authentication
- Cache-first read strategy
- Separation of concerns
- Modular route architecture
- Performance optimization mindset
- Minimal external dependency reliance

The goal is to build a backend capable of handling high concurrency and real-time workloads.

---

# 🔐 Authentication System (Passwordless)

Twivo uses a **fully passwordless model**.

There is **no password field stored in the database**.

Authentication flow:

### 1️⃣ Request Magic Link
`POST /api/auth/sign`

User submits email (should be unique ) and username ( should be unique ) and name.  
Server generates a secure, time-limited token and it will be sent to your email

---

### 2️⃣ Verify Magic Link
`POST /api/auth/login`

Server:
- Validates magic token
- Issues Access Token (10 min)
- Issues Refresh Token (7 days)
- Stores hashed refresh token
- Sets HTTP-only secure cookies

---

### 3️⃣ Refresh Access Token
`POST /api/auth/refresh`

- Validates refresh token
- Rotates refresh token
- Issues new access token

---

# 🛠️ Tech Stack

## Core
- Node.js (18+)
- Fastify (primary framework – Express being deprecated)
- MongoDB (Mongoose ODM)
- Redis (ioredis)

## Authentication & Security
- Passwordless Magic-Link System
- JWT (Access & Refresh Tokens)
- Secure HTTP-only cookies
- Helmet
- CORS

## Media & File Handling
- Multer
- Sharp
- Custom Image Hosting Server (WIP)

---

# 📦 Installation

## Prerequisites

- Node.js v18+
- MongoDB (Atlas or local)
- Redis (recommended)

---

## Setup

### 1. Clone Repository

```bash
git clone https://github.com/husseinayyed/twivo-backend.git
cd twivo-backend

2. Install Dependencies

npm install

3. Create .env File

DB_URL=mongodb+srv://<username>:<password>@cluster.mongodb.net/twivo
JWT_SECRET=your_jwt_secret
REFRESH_SECRET=your_refresh_secret
FRONTEND_URL=http://localhost:3000
PORT=5000
REDIS_URL=redis://localhost:6379
NODE_ENV=development

4. Start Server

npm run dev

Server runs on:

http://localhost:5000


---

📁 Project Structure (Evolving)

twivo-backend/
├── server.js
├── routes/
├── models/
├── middleware/
├── Redis/
├── utils/
└── README.md

Structure may change during refactor.


---

🚧 Roadmap

In Progress

Complete Express → Fastify migration

Strengthen refresh token rotation

Deploy internal image hosting server

Schema validation improvements


Planned

WebSocket real-time updates

Comment system

Direct messaging

Notification system

Monitoring & metrics

API versioning



---

🧪 Stability & Versioning

API is currently unstable

Schemas may change

Breaking changes are possible

Semantic versioning will be introduced after stabilization


Production deployment is not recommended yet.


---

🤝 Contributing

Contributions are open and always welcome.

You can help with:

Performance optimization

Security improvements

Testing coverage

Architectural refinements

Feature proposals


Contribution Flow

git checkout -b feature/your-feature
git commit -m "feat: describe change"
git push origin feature/your-feature

Then open a Pull Request.


---

👨‍💻 Author

Hussein Ayyed
GitHub: https://github.com/husseinayyed

Backend-focused developer building scalable, secure, and performance-driven systems.


---

📝 License

Licensed under the ISC License.

You are free to use, modify, and distribute this software (including commercial use) provided the license notice is included.


---

⭐ Support

If you find this project interesting:

⭐ Star the repository

🐛 Open issues

🚀 Contribute improvements
