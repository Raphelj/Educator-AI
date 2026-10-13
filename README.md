# Educator AI — Enterprise Document Intelligence Platform

[![Live Demo](https://img.shields.io/badge/Live_Demo-Render-46E3B7.svg?style=for-the-badge&logo=render&logoColor=white)](https://educator-ai-frontend.onrender.com/)
[![Enterprise CI Pipeline](https://github.com/Raphelj/Educator-AI/actions/workflows/ci.yml/badge.svg)](https://github.com/Raphelj/Educator-AI/actions/workflows/ci.yml)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-pgvector-4169E1.svg?logo=postgresql&logoColor=white)](https://github.com/pgvector/pgvector)
[![LangGraph](https://img.shields.io/badge/LangGraph-Agentic_AI-FF6F00.svg)](https://www.langchain.com/langgraph)
[![Docker](https://img.shields.io/badge/Docker-Multi--Stage-2496ED.svg?logo=docker&logoColor=white)](https://www.docker.com)
[![Langfuse](https://img.shields.io/badge/Langfuse-Observability-000000.svg)](https://langfuse.com)

> 🚀 **Live Production Application:** [https://educator-ai-frontend.onrender.com](https://educator-ai-frontend.onrender.com/)

**Educator AI** is an enterprise-grade document intelligence platform designed to ingest complex multi-page PDF documents, perform semantic indexing into a high-concurrency vector database, and orchestrate autonomous multi-turn reasoning with real-time observability.

---

## Architecture Overview

```
+-----------------------------------------------------------------------------------+
|                                 CLIENT TIER                                       |
|  React 19 + Vite (Served via Nginx / Alpine, Port 3000)                           |
|  - ChatGPT-style collapsible sidebar with persistent chat history & deletion      |
|  - Real-time status polling for background tasks                                  |
+----------------------------------------+------------------------------------------+
                                         | HTTP / REST (JWT Bearer, Nginx Reverse Proxy)
                                         v
+-----------------------------------------------------------------------------------+
|                                 API GATEWAY                                       |
|  FastAPI (Uvicorn, Non-root Appuser, Port 8000)                                   |
|  - OAuth2 Password Flow + Native Bcrypt + JWT Access Tokens                       |
|  - Non-blocking BackgroundTasks worker queue for document ingestion               |
+-------------------+------------------------------------+--------------------------+
                    |                                    |
                    v (Background Thread Pool)           v (Multi-Turn Tool Invocation)
+---------------------------------------+  +----------------------------------------+
|       ASYNC INGESTION WORKER          |  |         LANGGRAPH REACT AGENT          |
| - PyMuPDF Text Streaming              |  | - Stateful Reasoning Loop              |
| - Recursive Character Splitter        |  | - ChatGroq (qwen/qwen3.8-27b)          |
| - Sentence-Transformers (all-MiniLM)  |  | - PDF_Search Tool (Vector Retrieval)   |
| - State Update: processing->completed |  | - Calculator Tool (Deterministic Math) |
+-------------------+-------------------+  +-------------------+--------------------+
                    |                                          |
                    | Vector & Relational Storage              | Deep Tracing Callbacks
                    v                                          v
+---------------------------------------+  +----------------------------------------+
|      SUPABASE POSTGRESQL + PGVECTOR   |  |          LANGFUSE CLOUD                |
| - Port 6543 Transaction Pooler        |  | - Full Waterfall Latency Analysis      |
| - Vector(384) L2 Distance Indexing    |  | - Token Accounting & Cost Metrics      |
| - Relational Users, Docs & Messages   |  | - Step-by-Step Tool Audit Trail        |
+---------------------------------------+  +----------------------------------------+
```

---

## Key Enterprise Modules

### 1. Enterprise Relational & Vector Data Layer
* **Supabase PostgreSQL with `pgvector`**: Embeddings (384-dimensional dense vectors generated via `all-MiniLM-L6-v2`) and relational business entities (users, documents, chat messages) reside in the same ACID-compliant database.
* **Connection Pooling**: Connected via Supabase transaction pooler (port `6543`) to prevent connection starvation under high concurrency.

### 2. Autonomous Agentic AI & Observability
* **LangGraph ReAct Loop**: Employs cyclic decision reasoning to autonomously route between vector retrieval (`PDF_Search`) and deterministic evaluation (`Calculator`).
* **Multi-Turn Conversational Memory**: Retains the last 6 turns of dialogue from PostgreSQL, enabling natural follow-up questions without prompt degradation.
* **Langfuse Tracing**: Full telemetry with execution waterfall traces, token usage breakdown, and step-by-step tool route auditing.

### 3. Asynchronous Scalability
* **FastAPI `BackgroundTasks`**: Ingestion (text extraction, chunking, embedding generation, executive summarization) executes on background worker threads.
* **Non-Blocking UI**: Instant response with `HTTP 202 Accepted` and client-side status polling every 2 seconds.

### 4. DevOps, Containerization & CI/CD
* **True Multi-Stage Docker**:
  * **Backend**: Builder stage compiles C-extensions; runtime stage contains only `libpq5` without compilers, running under a non-root `appuser`.
  * **Frontend**: Node builder compiles the React bundle; production runner uses an ultra-lean Nginx image (~25 MB) with reverse-proxying.
* **Docker Compose**: Orchestrates services with healthcheck dependencies on an isolated bridge network.
* **Automated CI/CD**: GitHub Actions workflow that executes Pytest unit tests, compiles the frontend bundle, and validates container definitions on every push and pull request.

---

## Quickstart

### Option A: Running with Docker (Recommended)

1. Clone the repository and configure your environment:
   ```bash
   git clone https://github.com/Raphelj/Educator-AI.git
   cd Educator-AI
   cp .env.example .env
   # Add your GROQ_API_KEY, DATABASE_URL, and LANGFUSE credentials to .env
   ```

2. Start the full stack with Docker Compose:
   ```bash
   docker compose up --build
   ```

3. Open your browser:
   * **Frontend Application:** [http://localhost:3000](http://localhost:3000)
   * **Backend API Docs (Swagger):** [http://localhost:8000/docs](http://localhost:8000/docs)

---

### Option B: Running Locally for Development

1. **Backend:**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: .\venv\Scripts\activate
   pip install -r backend/requirements.txt
   uvicorn backend.main:app --reload
   ```

2. **Frontend:**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   Open [http://localhost:5173](http://localhost:5173).

---

## Running Automated Tests

Run the test suite locally:
```bash
python -m pytest backend/test_api.py -v
```

---

## License
MIT License. Built for enterprise AI engineering evaluation.
