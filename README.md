# 🚢 PortFlow AI

### IBM Bob AI Innovation Hackathon 2026

> **AI-powered port operations intelligence for congestion prediction, resource allocation, route optimisation, and operational planning.**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Render-46E3B7?logo=render\&logoColor=white)](https://bob-ai-hackathon-portflow-1.onrender.com/)
[![Backend API](https://img.shields.io/badge/Backend%20API-Render-46E3B7?logo=render\&logoColor=white)](https://bob-ai-hackathon-portflow.onrender.com/)
[![GitHub](https://img.shields.io/badge/GitHub-Repository-181717?logo=github\&logoColor=white)](https://github.com/krishapajvani/bob-ai-hackathon-portflow)

---

## 👥 Team

| **Field**     | **Value**      |
| ------------- | -------------- |
| **Team Name** | PortFlow AI    |
| **Track**     | AI             |
| **Team Lead** | Krisha Pajvani |
| **Members**   | Krisha Pajvani, Purvi Kotadiya, Niti, Riya |

> Update the member list above if you are submitting as a team with additional members.

---

## 🎯 Problem Statement

Modern ports must coordinate vessels, berths, cranes, routes, and operational schedules while dealing with constantly changing demand and congestion.

Port operators need to identify congestion risks early, understand **why** congestion is occurring, decide where incoming vessels should be assigned, select suitable alternative routes, and plan near-term operations. These decisions can become difficult when operational data is distributed across multiple resources and traditional rule-based dashboards provide limited explanation.

**PortFlow AI addresses this problem by turning port operational data into actionable recommendations for port operators.**

---

## 💡 Solution

**PortFlow AI** is an AI-powered port operations assistant designed to help operators make faster, more explainable operational decisions.

The platform combines a **deterministic operational intelligence engine** with optional **IBM watsonx.ai / Granite AI enrichment**. The deterministic layer calculates authoritative congestion scores and operational recommendations, while the AI layer converts those structured results into human-readable analysis, explanations, and recommendations.

This architecture ensures that AI improves the **understanding and usability of operational intelligence without replacing the authoritative operational calculations**.

---

## ✨ Key Features

### 🚢 1. Vessel Management

PortFlow provides operational visibility into vessels entering and operating within the port.

Operators can access vessel information and use vessel-specific analysis to understand how an individual vessel may affect port operations.

---

### 📊 2. Port Congestion Intelligence

The deterministic engine calculates a port-wide congestion score using operational data.

PortFlow can also provide vessel-specific congestion impact information, helping operators understand which vessels are contributing to operational pressure.

---

### 🧠 3. Explainable AI Analysis

The platform can enrich deterministic operational results using **IBM Granite through watsonx.ai**.

Instead of asking an LLM to independently make operational decisions, PortFlow provides the model with structured operational results and uses AI to generate:

* Executive summaries
* Explanations of congestion factors
* Vessel-specific insights
* Operational recommendations
* Human-readable decision support

---

### 🏗️ 4. Berth Recommendations

For incoming vessels, PortFlow evaluates available berth information and produces ranked berth recommendations.

The recommendation engine is deterministic, allowing operational constraints and scoring logic to remain consistent and auditable.

---

### 🏗️ 5. Crane Operations

PortFlow maintains crane operational information and incorporates crane availability/capacity into the operational decision-support workflow.

This helps operators consider resource availability when planning vessel operations.

---

### 🗺️ 6. Alternative Route Recommendations

When congestion or operational conditions make a route less desirable, PortFlow can evaluate available route definitions and return ranked route recommendations.

This provides operators with alternatives rather than relying on a single predefined route.

---

### 📅 7. 72-Hour Operational Planning

PortFlow generates a **72-hour operational plan** using the deterministic operational engine.

The plan provides a forward-looking view of recommended actions and operational priorities, helping operators move from simply monitoring the current situation toward proactive planning.

---

### 🔄 8. AI Fallback Architecture

PortFlow is designed to remain functional even when the external AI service is unavailable.

If watsonx.ai is unavailable because of:

* Missing credentials
* Network problems
* API errors
* Timeout
* Invalid AI response

the system automatically falls back to the deterministic operational engine.

This means the core operational functionality does not depend entirely on an external LLM.

---

### 🔐 9. AI Safety Boundary

The AI layer does **not** act as the authoritative source for numerical operational decisions.

The deterministic engine remains responsible for:

* Congestion calculations
* Berth recommendations
* Route recommendations
* Operational planning

The AI layer provides enrichment and explanation around those results.

This separation reduces the risk of an LLM inventing operational resources or overriding deterministic constraints.

---

## 🏗️ Architecture

PortFlow AI follows a two-layer architecture.

```text
                    ┌──────────────────────────┐
                    │      React Frontend      │
                    │      Vite + Bootstrap    │
                    └────────────┬─────────────┘
                                 │
                                 │ HTTP / REST API
                                 ▼
                    ┌──────────────────────────┐
                    │    Node.js + Express     │
                    │        Backend           │
                    └────────────┬─────────────┘
                                 │
                ┌────────────────┼─────────────────┐
                │                │                 │
                ▼                ▼                 ▼
       ┌────────────────┐ ┌───────────────┐ ┌─────────────────┐
       │ Deterministic  │ │    MongoDB    │ │  AI Enrichment  │
       │ Engine         │ │   Mongoose    │ │ IBM watsonx.ai  │
       │                │ │               │ │    Granite      │
       └───────┬────────┘ └───────────────┘ └────────┬────────┘
               │                                      │
               │ authoritative results                │
               └──────────────────┬───────────────────┘
                                  ▼
                       ┌────────────────────┐
                       │ Operational / AI   │
                       │ Decision Support   │
                       └────────────────────┘
```

### Deterministic Layer

The deterministic engine is the authoritative operational layer.

It calculates:

* Congestion scores
* Congestion factors
* Berth recommendations
* Route recommendations
* 72-hour operational planning

### AI Layer

The AI layer receives structured results from the deterministic engine and uses IBM Granite through watsonx.ai to produce natural-language explanations and recommendations.

The AI layer does not replace the deterministic calculations.

### Fallback

If watsonx.ai cannot be reached or returns an invalid response, PortFlow automatically returns deterministic results instead.

---

## 🛠️ Technology Stack

| **Category**                 | **Technology**                     |
| ---------------------------- | ---------------------------------- |
| **Frontend**                 | React, Vite, Bootstrap 5           |
| **Backend**                  | Node.js, Express                   |
| **Database**                 | MongoDB, Mongoose                  |
| **AI**                       | IBM watsonx.ai, IBM Granite        |
| **Operational Intelligence** | Deterministic rule/decision engine |
| **API**                      | REST                               |
| **Deployment**               | Render                             |
| **Source Control**           | GitHub                             |

---

## 📁 Repository Structure

```text
portflow/
│
├── src/
│   ├── client/                 # React + Vite frontend
│   └── server/                 # Node.js + Express backend
│
├── docs/
│   ├── architecture.md         # System architecture
│   ├── problem-statement.md    # Problem definition
│   ├── solution-overview.md    # Solution description
│   └── setup-guide.md          # Setup instructions
│
├── demo/
│   ├── screenshots/            # Application screenshots
│   ├── demo-video-link.txt     # Demo video reference
│   └── live-demo-url.txt       # Deployed application URL
│
├── .github/
│   └── workflows/              # GitHub workflow configuration
│
├── submission.yaml             # Hackathon submission metadata
├── README.md                   # Project documentation
└── .gitignore
```

---

## ⚡ How to Run Locally

### Prerequisites

Install:

* Node.js 18+
* npm
* MongoDB locally **or** a MongoDB Atlas database

---

### 1. Clone the repository

```bash
git clone https://github.com/krishapajvani/bob-ai-hackathon-portflow.git
cd bob-ai-hackathon-portflow
```

---

### 2. Install backend dependencies

```bash
cd src/server
npm install
```

---

### 3. Configure backend environment

Create the environment file:

```bash
cp .env.example .env
```

For local development without watsonx.ai:

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/portflow
AI_PROVIDER=rules
```

This configuration allows the deterministic operational engine to run without an external AI API.

---

### 4. Optional: Enable IBM watsonx.ai

To enable IBM Granite AI enrichment, configure:

```env
AI_PROVIDER=watsonx
WATSONX_API_KEY=your_api_key
WATSONX_PROJECT_ID=your_project_id
WATSONX_URL=https://us-south.ml.cloud.ibm.com
WATSONX_MODEL_ID=your_model_id
```

> **Never commit API keys or other secrets to GitHub.**

---

### 5. Seed the database

From `src/server`:

```bash
npm run seed
```

The seed process populates the application with the sample operational data used by PortFlow.

---

### 6. Start the backend

```bash
npm run dev
```

The backend will run on:

```text
http://localhost:5000
```

Health check:

```text
http://localhost:5000/api/health
```

---

### 7. Start the frontend

Open another terminal:

```bash
cd src/client
npm install
npm run dev
```

The frontend will normally be available at:

```text
http://localhost:3000
```

---

### 8. Run backend tests

```bash
cd src/server
npm test
```

---

## 🌐 Deployment

PortFlow AI is deployed as two services on **Render**.

### Frontend

The React/Vite client is deployed separately:

**Live Application**

https://bob-ai-hackathon-portflow-1.onrender.com/

### Backend

The Node.js/Express API is deployed separately:

**Backend API**

https://bob-ai-hackathon-portflow.onrender.com/

The frontend communicates with the backend through the deployed REST API.

---

## 🔌 API Endpoints

| **Method** | **Endpoint**                  | **Purpose**                       |
| ---------- | ----------------------------- | --------------------------------- |
| GET        | `/api/health`                 | Server and database health        |
| GET        | `/api/vessels`                | Retrieve vessels                  |
| POST       | `/api/vessels`                | Add a vessel                      |
| GET        | `/api/vessels/:id`            | Retrieve vessel details           |
| PUT        | `/api/vessels/:id`            | Update vessel                     |
| GET        | `/api/berths`                 | Retrieve berths                   |
| PUT        | `/api/berths/:id`             | Update berth                      |
| GET        | `/api/berths/recommend/:id`   | Ranked berth recommendations      |
| GET        | `/api/cranes`                 | Retrieve cranes                   |
| GET        | `/api/routes`                 | Retrieve route definitions        |
| GET        | `/api/routes/recommend/:id`   | Ranked route recommendations      |
| GET        | `/api/congestion`             | Port-wide congestion intelligence |
| GET        | `/api/congestion/vessels/:id` | Vessel-specific congestion impact |
| GET        | `/api/operations/plan`        | Generate 72-hour operational plan |
| GET        | `/api/ai/analysis`            | AI-enriched port analysis         |
| GET        | `/api/ai/vessels/:id`         | AI-enriched vessel analysis       |

---

## 🤖 AI Configuration

PortFlow AI is intentionally designed so that the core application does not depend exclusively on an LLM.

### Without watsonx.ai

```env
AI_PROVIDER=rules
```

The deterministic engine handles the operational intelligence.

### With watsonx.ai

```env
AI_PROVIDER=watsonx
```

The backend sends structured operational information to IBM Granite through watsonx.ai for AI-generated explanations and recommendations.

### AI response flow

```text
Port Data
   │
   ▼
Deterministic Engine
   │
   ├── Congestion Score
   ├── Berth Recommendations
   ├── Route Recommendations
   └── 72-Hour Plan
   │
   ▼
Structured Operational Context
   │
   ▼
IBM Granite / watsonx.ai
   │
   ▼
Human-readable AI Analysis
```

### Fallback flow

```text
IBM watsonx.ai
      │
      ├── Available ───────► AI-enriched response
      │
      └── Unavailable
                │
                ▼
       Deterministic fallback
                │
                ▼
        Complete operational result
```

The deterministic layer remains authoritative in both cases.

---

## 🔐 Security

PortFlow keeps AI credentials on the backend.

API keys and watsonx.ai configuration are stored in environment variables and are **not exposed to the React frontend**.

The browser communicates with the Express backend rather than directly accessing the IBM AI credentials.

For local development, secrets should be stored in `.env` and excluded from source control.

---

## 🖥️ Demo

### 🌐 Live Application

**Frontend**

https://bob-ai-hackathon-portflow-1.onrender.com/

**Backend**

https://bob-ai-hackathon-portflow.onrender.com/

### 💻 Source Code

**GitHub Repository**

https://github.com/krishapajvani/bob-ai-hackathon-portflow

### 📹 Demo Video

Add the final demo video link here:

```text
demo/demo-video-link.txt
```

### 🖼️ Screenshots

Application screenshots are available in:

```text
demo/screenshots/
```

### 📊 Presentation

The final hackathon presentation can be placed in:

```text
presentation/
```

---

## ⚠️ Known Limitations

* The current system uses representative/sample port operational data rather than live data from a real-world port management system.
* The quality of AI-generated explanations depends on the availability and response quality of the configured watsonx.ai model.
* The deterministic decision engine is designed for the hackathon scenario and would require additional domain validation before being used for safety-critical real-world port operations.
* Authentication and role-based access control are not the primary focus of the current hackathon implementation.
* Production deployment would require additional monitoring, security hardening, observability, and operational integrations.

---

## 🏅 What We're Most Proud Of

The strongest part of **PortFlow AI** is the separation between **authoritative operational logic and generative AI**.

Rather than allowing an LLM to independently make operational decisions, PortFlow first calculates the operational results using a deterministic engine and then uses IBM Granite to explain those results in a way that is easier for operators to understand.

This architecture gives the project two important properties:

**Reliability** — the core operational calculations continue to work even when the AI service is unavailable.

**Explainability** — operators can receive natural-language explanations and recommendations without allowing the LLM to override the underlying operational constraints.

This makes PortFlow AI more than a chatbot: it is a **decision-support system that combines deterministic operational intelligence with generative AI**.

---

## 🚀 Future Enhancements

Potential future improvements include:

* Integration with live AIS vessel tracking data
* Real-time port sensor and equipment feeds
* Historical data-driven congestion forecasting
* More advanced predictive models
* Integration with real Terminal Operating Systems (TOS)
* Authentication and role-based access control
* Real-time notifications and alerts
* Historical analytics and operational dashboards
* Production-grade observability and monitoring

---

## 📄 License

This project is licensed under the MIT License.

---

## 🔗 Project Links

| **Resource**             | **Link**                                                   |
| ------------------------ | ---------------------------------------------------------- |
| 🌐 **Live Frontend**     | https://bob-ai-hackathon-portflow-1.onrender.com/          |
| ⚙️ **Backend API**       | https://bob-ai-hackathon-portflow.onrender.com/            |
| 💻 **GitHub Repository** | https://github.com/krishapajvani/bob-ai-hackathon-portflow |

---

### Built for the IBM Bob AI Innovation Hackathon 2026 🚢🤖
