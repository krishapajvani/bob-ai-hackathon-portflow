# PortFlow AI

**IBM Bob AI Innovation Hackathon 2026**

PortFlow AI is an AI-powered port operations assistant that helps port operators:

- 🚢 **Predict vessel congestion** before it becomes critical
- 🧠 **Understand congestion causes** through explainable AI analysis
- 🏗️ **Optimise berth and crane allocation** for incoming vessels
- 🗺️ **Recommend alternative routes** when the port is congested
- 📅 **Generate a 72-hour operational plan** with AI-driven recommendations

---

## Technology Stack

| Layer    | Technology                              |
|----------|-----------------------------------------|
| Frontend | React (Vite), Bootstrap 5               |
| Backend  | Node.js, Express                        |
| Database | MongoDB (Mongoose)                      |
| AI       | IBM watsonx.ai (Granite), rule engine   |

---

## Project Structure

```
portflow/
├── src/
│   ├── client/        ← React frontend (Vite)
│   └── server/        ← Node.js/Express backend
├── docs/              ← Architecture, problem statement, setup guide
├── demo/              ← Screenshots and demo assets
├── submission.yaml    ← Hackathon submission metadata
└── README.md
```

---

## Quick Start

### Prerequisites

- Node.js 18+
- MongoDB (local install **or** MongoDB Atlas account)

---

### 1. Clone the repository

```bash
git clone <repo-url>
cd portflow
```

---

### 2. Set up the backend

```bash
cd src/server
npm install
```

Copy the environment file and fill in your values:

```bash
cp .env.example .env
```

Minimum required in `.env` for local development:

```
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/portflow
AI_PROVIDER=rules
```

If you want to enable watsonx.ai:

```
AI_PROVIDER=watsonx
WATSONX_API_KEY=your_key_here
WATSONX_PROJECT_ID=your_project_id_here
WATSONX_URL=https://us-south.ml.cloud.ibm.com
WATSONX_MODEL_ID=ibm/granite-13b-chat-v2
```

---

### 3. Seed the database

```bash
npm run seed
```

This inserts 14 vessels, 8 berths, 15 cranes, and 7 route records.

---

### 4. Start the backend

```bash
npm run dev
```

The API will be available at `http://localhost:5000`.
Health check: `http://localhost:5000/api/health`

---

### 5. Set up the frontend

In a separate terminal:

```bash
cd src/client
npm install
npm run dev
```

The frontend will be available at `http://localhost:3000`.
API requests are proxied automatically to `http://localhost:5000`.

---

### 6. Run backend tests

```bash
cd src/server
npm test
```

---

## API Endpoints

| Method | Endpoint                        | Description                                       |
|--------|---------------------------------|---------------------------------------------------|
| GET    | `/api/health`                   | Server and database status                        |
| GET    | `/api/vessels`                  | List all vessels (filter by status/type)          |
| POST   | `/api/vessels`                  | Add a new vessel                                  |
| GET    | `/api/vessels/:id`              | Single vessel detail                              |
| PUT    | `/api/vessels/:id`              | Update a vessel                                   |
| GET    | `/api/berths`                   | List all berths                                   |
| PUT    | `/api/berths/:id`               | Update a berth                                    |
| GET    | `/api/berths/recommend/:id`     | Ranked berth recommendations for a vessel         |
| GET    | `/api/cranes`                   | List all cranes                                   |
| GET    | `/api/routes`                   | List all route definitions                        |
| GET    | `/api/routes/recommend/:id`     | Ranked route recommendations for a vessel         |
| GET    | `/api/congestion`               | Port-wide congestion score and factors            |
| GET    | `/api/congestion/vessels/:id`   | Congestion impact for a specific vessel           |
| GET    | `/api/operations/plan`          | Generate and return the 72-hour operational plan  |
| GET    | `/api/ai/analysis`              | AI-enriched port analysis (with fallback)         |
| GET    | `/api/ai/vessels/:id`           | AI-enriched vessel-specific analysis              |

---

## AI Configuration

### How it works

PortFlow AI uses a two-layer architecture:

1. **Deterministic engine** (always runs): computes congestion scores, berth recommendations, route options, and the 72-hour plan. These results are always authoritative.
2. **AI enrichment** (optional): sends the engine's structured output to IBM Granite via watsonx.ai and returns human-readable explanations and recommendations.

The AI layer **cannot** change numerical scores, invent berths, invent vessels, or override safety constraints. If the LLM is unavailable, the deterministic fallback always provides a complete response.

### Running without AI (default)

Set `AI_PROVIDER=rules` (or leave it unset). No API keys required. All endpoints work fully with the deterministic engine.

### Running with IBM watsonx.ai

1. Create an IBM Cloud account and generate an API key at https://cloud.ibm.com/iam/apikeys
2. Create a watsonx.ai project and copy the project ID
3. Add these variables to `src/server/.env`:

```
AI_PROVIDER=watsonx
WATSONX_API_KEY=your_api_key_here
WATSONX_PROJECT_ID=your_project_id_here
WATSONX_URL=https://us-south.ml.cloud.ibm.com
WATSONX_MODEL_ID=ibm/granite-13b-chat-v2
```

The model is configurable via `WATSONX_MODEL_ID` — do not hardcode it.

### Fallback behaviour

If watsonx.ai is unavailable (network error, missing credentials, timeout, API error, invalid JSON response), the service automatically falls back to the deterministic engine. The response will contain:

```json
{
  "provider": "deterministic-fallback",
  "aiAvailable": false,
  "fallbackReason": "...",
  "executiveSummary": "...",
  ...
}
```

When watsonx.ai is working:

```json
{
  "provider": "watsonx-granite",
  "aiAvailable": true,
  "modelId": "ibm/granite-13b-chat-v2",
  ...
}
```

**The deterministic services remain authoritative in both cases.** The frontend always displays the numerical congestion score from the engine, not from the AI.

### Security note

API keys are stored in `src/server/.env` only. They are never sent to the React frontend. The browser communicates only with the Express backend.

---

## Team

*Add team member names here.*

---

## License

MIT
