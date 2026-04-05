# WebWardrobe - Technical Description

## Overview

WebWardrobe is a Chrome Extension that enables users to virtually try on clothes from any website. Users upload selfies, browse clothing sites, right-click on product images, and receive AI-generated images of themselves wearing the selected items.

---

## Architecture

The application consists of three main components:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Extension     │────▶│    Backend      │────▶│   Gemini API   │
│  (Chrome MV3)   │     │ (AWS Serverless)│     │  (Image Gen)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │
        │                       │
        ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│      Site       │     │     DynamoDB    │
│   (React SPA)   │     │   + S3 Bucket   │
└─────────────────┘     └─────────────────┘
```

---

## Components

### 1. Backend (`/backend`)

**Technology:** AWS SAM (Serverless Application Model), Python 3.9

**Infrastructure:**
- **API Gateway** (HTTP API) - REST endpoints with CORS enabled
- **Lambda Functions** - Multiple handlers in `dispatcher_lambda.py`
- **Step Functions** - Orchestrates image generation workflow
- **DynamoDB** - Three tables for state management
- **S3 Bucket** - Image storage (uploads and results)

**Lambda Handlers:**

| Handler | Endpoint | Purpose |
|---------|----------|---------|
| `dispatcher_handler` | `POST /try-on` | Initiates try-on job, deducts credits |
| `profile_handler` | `/user/*` | Manage user images, profile, generations |
| `status_handler` | `GET /status/{jobId}` | Poll job status |
| `generator_handler` | (Step Function) | Call Gemini API, save result to S3 |
| `saver_handler` | (Step Function) | Update job status, save generation history |
| `payment_link_handler` | `POST /payment/link` | Generate Prodamus payment URL |
| `payment_webhook_handler` | `POST /payment/webhook` | Process payment notifications |

**DynamoDB Tables:**

| Table | Partition Key | Sort Key | Purpose |
|-------|---------------|----------|---------|
| `TryOnJobs` | `jobId` | - | Job status tracking |
| `TryOnUserProfiles` | `userId` | - | User data, credits, images |
| `TryOnUserGenerations` | `userId` | `timestamp` | Generation history |

**Step Function Flow (`statemachine.asl.json`):**
```
PreparePayload → GenerateImage → SaveResult
                      ↓ (on error)
                  JobFailed
```

**Authentication:** Google OAuth 2.0 - validates Bearer tokens via Google's tokeninfo endpoint, extracts user ID from `sub` claim.

**Credit System:**
- New users start with 5 credits
- Each generation costs 1 credit
- Failed generations are refunded
- Payments processed via Prodamus (Russian payment provider)

---

### 2. Extension (`/extension`)

**Technology:** Chrome Extension Manifest V3, Vanilla JavaScript, Tailwind CSS

**Key Files:**

| File | Purpose |
|------|---------|
| `manifest.json` | Extension configuration, permissions, OAuth |
| `background.js` | Service worker, context menu, API communication |
| `content.js` | Injected script, overlays, image replacement |
| `popup.js` | Extension popup UI, image management |
| `popup.html` | Popup markup |

**Permissions:**
- `contextMenus` - Right-click menu on images
- `activeTab` - Access current tab
- `scripting` - Inject content scripts
- `identity` - Google OAuth
- `notifications` - User notifications

**Workflow:**
1. User right-clicks on product image
2. Context menu shows uploaded selfies
3. Background script initiates API call
4. Content script shows processing overlay
5. Polls status endpoint until completion
6. Replaces original image with result

**Error Monitoring:** Sentry integration for crash reporting.

---

### 3. Site (`/site`)

**Technology:** React 19, TypeScript, Vite, Redux Toolkit, React Router

**Pages:**

| Page | Route | Purpose |
|------|-------|---------|
| `Home` | `/` | Landing page, tariffs |
| `InstallationGuide` | `/install` | Extension installation instructions |
| `Account` | `/account` | User profile, selfies, generations history |
| `LoginCallback` | `/login_callback` | OAuth callback handler |

**State Management (Redux):**
- `userProfileSlice` - User data, images, credits
- `generationsSlice` - Generated images history
- `languageSlice` - UI language (EN, RU, DE, ES)

**Key Libraries:**
- `@react-oauth/google` - Google OAuth
- `react-redux` - State management
- `react-router-dom` - Routing
- `lucide-react` - Icons

**Deployment:** Netlify

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/try-on` | Required | Start generation job |
| GET | `/status/{jobId}` | None | Check job status |
| GET | `/user/profile` | Required | Get user profile |
| GET | `/user/images` | Required | List user images |
| POST | `/user/images/upload-url` | Required | Get S3 presigned URL |
| POST | `/user/images` | Required | Confirm image upload |
| DELETE | `/user/images/{fileId}` | Required | Delete image |
| PATCH | `/user/images/{fileId}` | Required | Rename image |
| GET | `/user/generations` | Required | List generations |
| DELETE | `/user/generations/{jobId}` | Required | Delete generation |
| POST | `/payment/link` | Required | Create payment URL |
| POST | `/payment/webhook` | None | Payment callback |

**API Base URL:** `https://nw2ghqgbe5.execute-api.us-east-1.amazonaws.com/prod`

---

## External Services

### Gemini API
- **Endpoint:** `generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent`
- **Purpose:** AI image generation (virtual try-on)
- **Input:** Two base64 images (selfie + product)
- **Output:** Generated image with user wearing the product

### Prodamus Payment
- Russian payment provider
- Webhook-based notification
- Tariffs: "On the go" (10), "Starter" (25), "Standard" (60 credits)

### Sentry
- Error tracking and monitoring
- DSN: `https://72cabbbdafe87f51a39927bec3d9e076@o4508982929588224.ingest.de.sentry.io/4508982935617616`

---

## Data Flow

### Virtual Try-On Flow

```
1. User right-clicks image → background.js
2. background.js calls POST /try-on
3. dispatcher_handler:
   - Validates auth
   - Checks/deducts credits
   - Creates job in DynamoDB
   - Starts Step Function
4. Step Function:
   - generator_handler downloads images
   - Calls Gemini API
   - Saves result to S3
   - saver_handler updates DynamoDB
5. background.js polls GET /status/{jobId}
6. On COMPLETED: content.js replaces image
```

### Image Upload Flow

```
1. User selects file in popup
2. popup.js generates thumbnail
3. POST /user/images/upload-url → presigned S3 URLs
4. PUT to S3 (original + thumbnail)
5. POST /user/images → confirm and save metadata
```

---

## Configuration

### Environment Variables (Backend)

| Variable | Purpose |
|----------|---------|
| `NanoBananaApiKey` | Gemini API key |
| `NanoBananaApiUrl` | Gemini API endpoint |
| `ProdamusSecretKey` | Payment webhook signing |
| `STATE_MACHINE_ARN` | Step Function ARN |
| `TABLE_NAME` | Jobs DynamoDB table |
| `USER_TABLE_NAME` | User profiles table |
| `USER_GENERATIONS_TABLE_NAME` | Generations table |
| `BUCKET_NAME` | S3 bucket name |

### Build Commands

**Extension:**
```bash
npm run build:css  # Compile Tailwind CSS
```

**Site:**
```bash
npm run dev        # Development server (port 3000)
npm run build      # Production build
npm run test       # Run tests (Vitest)
```

**Backend:**
```bash
sam build          # Build Lambda functions
sam deploy         # Deploy to AWS
```

---

## Constraints

- Maximum 5 selfies per user
- Job polling timeout: 5 minutes (100 attempts × 3 seconds)
- Gemini API retry: 5 attempts with exponential backoff
- Credit refund on job failure
- Payment idempotency via `processed_payments` list

---

## File Structure Summary

```
WebWardrobe/
├── backend/
│   ├── dispatcher_lambda.py    # All Lambda handlers
│   ├── template.yaml           # SAM configuration
│   ├── statemachine.asl.json   # Step Function definition
│   └── tests/                  # Python tests
│
├── extension/
│   ├── manifest.json           # Extension manifest
│   ├── background.js           # Service worker
│   ├── content.js              # Content script
│   ├── popup.js                # Popup logic
│   ├── popup.html              # Popup markup
│   └── lib/sentry.min.js       # Error tracking
│
├── site/
│   ├── App.tsx                 # Root component
│   ├── pages/                  # Page components
│   ├── components/             # Reusable components
│   ├── store/                  # Redux slices
│   ├── lib/                    # Utilities
│   └── translations.ts         # i18n translations
│
└── README.md                   # Project overview
```