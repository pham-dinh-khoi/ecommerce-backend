# Ecommerce Backend API

A production-oriented REST API for a full-stack ecommerce platform, built with Node.js, Express, TypeScript, MongoDB, and Redis.

The project goes beyond standard CRUD operations with transactional order placement, concurrency-safe coupon usage, dual guest/user carts, refresh-token rotation, hierarchical categories, product variants, faceted search, review moderation, and PayPal payment processing.

> Frontend repository: [ecommerce-frontend](https://github.com/pham-dinh-khoi/ecommerce-frontend)

## Key Engineering Highlights

- **Transactional checkout** — inventory deduction, order creation, coupon redemption, and cart cleanup run in one MongoDB transaction.
- **Concurrency safety** — conditional atomic updates prevent negative stock and coupon overuse under concurrent requests.
- **Dual cart architecture** — guest carts live in Redis, user carts persist in MongoDB, and both are merged automatically after login.
- **Secure sessions** — short-lived access tokens, refresh-token rotation, hashed refresh-token storage, multi-device logout, and password-change invalidation.
- **PayPal integration** — OAuth 2.0, order creation and capture, return/cancel callbacks, webhook verification, and idempotent processing.
- **Faceted search** — MongoDB aggregation returns products, pagination, brands, price statistics, and rating facets, with Redis caching.
- **Operational safeguards** — validated environment configuration, rate limiting, security headers, payload limits, input sanitization, health checks, and graceful shutdown.

## Tech Stack

| Area | Technologies |
| --- | --- |
| Runtime | Node.js 20 |
| API | Express 5, TypeScript |
| Data | MongoDB, Mongoose, Redis |
| Authentication | JWT, bcryptjs, HTTP-only cookies |
| Validation | Zod |
| Media | Multer, Cloudinary |
| Payments | PayPal REST API |
| Email | Nodemailer, SMTP |
| Security | Helmet, CORS, express-rate-limit |
| Tooling | ESLint, Prettier, Docker |

## Features

### Authentication and users

- Registration and email verification
- Login lockout after repeated failures
- Access and refresh token authentication
- Refresh-token rotation and hashed token storage
- Current-session and all-device logout
- Forgot, reset, and change password flows
- Role-based access for `user`, `seller`, and `admin`
- Profile, avatar, and address-book management

### Catalog

- Hierarchical categories using materialized paths
- Category tree with a maximum depth of three levels
- Product variants with independent SKU, price, images, attributes, and stock
- Aggregated price range and total stock
- Cloudinary product and variant images
- Archive and permanent-delete operations
- Featured products, tags, brands, ratings, and inventory status

### Cart, wishlist, and coupons

- Redis-backed guest carts identified by `X-Guest-Id`
- MongoDB-backed authenticated carts
- Automatic guest/user cart merge after login
- Server-side price and availability synchronization
- Wishlist toggle, lookup, and clear operations
- Percentage and fixed-amount discounts
- Coupon preview, atomic usage limits, and usage history

### Orders and payments

- Transactional order placement with product snapshots
- Cash on delivery and PayPal
- Explicit order state transitions and audit timeline
- Customer history, details, and cancellation
- Administrative filtering and order statistics
- PayPal return/cancel callbacks and verified webhook processing

### Search and reviews

- Keyword search with filtering, sorting, and pagination
- Brand, price, and rating facets
- Autocomplete, trending, and similar products
- Redis result caching and cache invalidation
- Reviews with images and verified-purchase detection
- Helpful votes, seller replies, and rule-based moderation

## Architecture

```text
HTTP Request
    |
    v
Route -> Middleware -> Controller -> Service -> Model / External service
                                            |
                                            +-- MongoDB
                                            +-- Redis
                                            +-- Cloudinary
                                            +-- SMTP
                                            +-- PayPal
```

- **Routes** define endpoints and access requirements.
- **Middleware** handles authentication, rate limits, uploads, sanitization, and errors.
- **Controllers** translate HTTP requests and responses.
- **Services** contain business rules and integrations.
- **Models** define persistence, indexes, validation, and document behavior.
- **Validations** parse incoming data with Zod.

### Transactional order flow

```text
Validate cart and shipping data
        |
        v
Start MongoDB transaction
        |
        +-- Deduct variant inventory atomically
        +-- Redeem coupon conditionally
        +-- Create an immutable order snapshot
        +-- Clear the persistent cart
        |
        v
Commit everything or roll everything back
```

MongoDB transactions require a replica set. MongoDB Atlas satisfies this requirement; a local MongoDB instance must be configured as a replica set.

### Guest-to-user cart flow

```text
Guest adds items -> Redis cart (X-Guest-Id) -> Login
    -> Merge with MongoDB cart -> Synchronize prices -> Remove guest cart
```

### Authentication flow

The API returns a short-lived access token and stores the refresh token in an HTTP-only cookie. When the access token expires, the client requests a new pair. The previous refresh token is rotated and its stored hash is removed.

## Project Structure

```text
src/
├── @types/         # Shared application and request types
├── config/         # Environment and database configuration
├── controllers/    # HTTP request/response handlers
├── middleware/     # Auth, upload, sanitization, rate limits, errors
├── models/         # Mongoose schemas and indexes
├── routes/         # Express route definitions
├── services/       # Business logic and external integrations
├── utils/          # JWT, Redis, Cloudinary, and error utilities
├── validations/    # Zod request schemas
├── app.ts          # Express application
└── server.ts       # Database connection and server lifecycle
```

## API Overview

All endpoints use the `/api` prefix.

| Module | Base path | Access | Description |
| --- | --- | --- | --- |
| Health | `/api/health` | Public | Service health check |
| Authentication | `/api/auth` | Public / User | Registration, sessions, email, passwords |
| Users | `/api/users` | User / Admin | Profiles, addresses, avatars, administration |
| Categories | `/api/categories` | Public / Admin | Category browsing and management |
| Products | `/api/products` | Public / Admin | Catalog, variants, images, archive/delete |
| Cart | `/api/cart` | Guest / User | Cart and item operations |
| Wishlist | `/api/wishlist` | User | Wishlist operations |
| Coupons | `/api/coupons` | User / Admin | Coupon preview and administration |
| Orders | `/api/orders` | User / Admin | Checkout, history, status, statistics |
| Search | `/api/search` | Public | Search, autocomplete, trending, similar products |
| Reviews | `/api/reviews` | Public / User / Seller / Admin | Reviews, votes, replies, moderation |
| Payments | `/api/payments` | Public callback / User | PayPal flow, webhook, status |

## Getting Started

### Prerequisites

- Node.js 20 or later
- npm
- MongoDB Atlas or a local MongoDB replica set
- Redis
- Cloudinary account
- SMTP credentials
- PayPal developer sandbox account

### Installation

```bash
git clone https://github.com/pham-dinh-khoi/ecommerce-backend.git
cd ecommerce-backend
npm ci
cp .env.example .env
```

Replace the placeholders in `.env`, then start the development server:

```bash
npm run dev
```

The API is available at `http://localhost:5000/api` by default.

```bash
curl http://localhost:5000/api/health
```

## Environment Variables

| Variable | Required | Purpose / example |
| --- | --- | --- |
| `NODE_ENV` | No | `development`, `production`, or `test` |
| `PORT` | No | Defaults to `5000` |
| `CLIENT_URL` | No | Primary frontend origin, such as `http://localhost:5173` |
| `CLIENT_URLS` | No | Comma-separated list of additional allowed CORS origins (each must be an absolute `http`/`https` origin with no path), e.g. `https://ecommerce-pdk-omega-steel.vercel.app,https://ecommerce-frontend-git-perf-initial-loading-phamdinhkhoik3.vercel.app` |
| `MONGO_URI` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | General secret, minimum 32 characters |
| `JWT_ACCESS_SECRET` | Yes | Access-token secret, minimum 30 characters |
| `JWT_REFRESH_SECRET` | Yes | Refresh-token secret, minimum 30 characters |
| `JWT_ACCESS_EXPIRES` | Yes | For example `15m` |
| `JWT_REFRESH_EXPIRES` | Yes | For example `7d` |
| `JWT_EXPIRES_IN` | Yes | JWT lifetime retained by the environment schema |
| `REDIS_URL` | No | Defaults to `redis://localhost:6379` |
| `CLOUDINARY_CLOUD_NAME` | Yes | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Yes | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Yes | Cloudinary API secret |
| `SMTP_HOST` | Yes | SMTP hostname |
| `SMTP_PORT` | No | Defaults to `587` |
| `SMTP_USER` | Yes | SMTP username |
| `SMTP_PASS` | Yes | SMTP password |
| `SMTP_FROM` | Yes | Sender name and address |
| `PAYPAL_CLIENT_ID` | Yes | PayPal application client ID |
| `PAYPAL_CLIENT_SECRET` | Yes | PayPal application secret |
| `PAYPAL_MODE` | No | `sandbox` or `live` |
| `PAYPAL_API_BASE` | No | PayPal API base URL |
| `PAYPAL_RETURN_URL` | Yes | Backend approval callback |
| `PAYPAL_CANCEL_URL` | Yes | Backend cancellation callback |
| `PAYPAL_WEBHOOK_ID` | Yes | Registered webhook ID |

Never commit `.env` or real credentials. See [`.env.example`](./.env.example) for safe placeholders.

## Available Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server in watch mode |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled production server |
| `npm run lint` | Check source with ESLint |
| `npm run lint:fix` | Fix supported lint and formatting issues |

## Docker

After creating `.env`:

```bash
docker compose up --build
```

The multi-stage Node.js 20 Alpine image installs production-only runtime dependencies, runs as a non-root user, and includes a health check.

The current Compose file starts only the API. MongoDB and Redis must be available separately through the URLs configured in `.env`.

## Quality Checks

```bash
npm run lint
npm run build
```

The project does not yet include an automated backend test suite. Priority test areas are authentication, order transactions, coupon concurrency, cart merging, and payment webhooks.

## Security Notes

- Passwords are hashed with bcryptjs.
- Refresh tokens are stored as SHA-256 hashes.
- Sensitive user fields are removed from serialized responses.
- Protected endpoints enforce authentication and roles.
- Rate limiters protect authentication and high-traffic endpoints.
- Helmet sets security-related HTTP headers.
- CORS accepts the configured frontend origin and credentials.
- Request bodies are limited before feature-specific upload handling.
- Zod validates request data and environment variables.

This is an educational portfolio project. Before commercial use, add comprehensive tests, centralized production logging, observability, secret management, and a formal security review.

## Current Limitations

- No automated backend test suite or coverage reporting
- No published OpenAPI/Swagger specification
- Docker Compose does not provision MongoDB or Redis
- Some ESLint warnings remain for explicit `any` types and operational logging
- External integration credentials are required by the current environment schema

## License

Licensed under the ISC License, as declared in `package.json`.
