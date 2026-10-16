# Civic Complaint Prioritization System

A full-stack civic-tech platform for reporting, prioritizing, and tracking municipal complaints. Built with React + Tailwind CSS frontend and FastAPI + PostgreSQL backend.

## Features

### Core Pipeline
```
Citizen submits complaint → System validates → Stores → Determines location/category → 
Calculates priority → Places in priority queue → Routes to department → 
Admin/department works on it → Status changes → Citizen notified → Resolved
```

### User Roles
- **Citizen**: Register, submit complaints, upload photos, track status, upvote, receive notifications
- **Admin**: View/filter all complaints, assign departments, update status, resolve, generate reports, undo actions
- **Department**: View assigned complaints, update resolution status

### Key Features
- **Automatic Prioritization**: Weighted scoring (severity, location sensitivity, ageing, votes)
- **Smart Routing**: Category → Department mapping
- **Real-time Priority Queue**: Max-heap based ranking with periodic re-evaluation
- **Location Search**: Trie-based prefix autocomplete
- **Evidence Upload**: Photo attachments with preview
- **Notifications**: In-app, email, SMS, push (stubbed for integration)
- **Admin Dashboard**: KPIs, charts, complaint management, undo functionality
- **Public Feed**: Transparency through browsable complaints

## Tech Stack

Phase 1 computer vision setup is available in [ai_service/README.md](ai_service/README.md).
It runs pretrained YOLO11 nano independently of the complaint application; custom
civic defect detection requires future training.

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Tailwind CSS, Vite |
| Backend | FastAPI, Python 3.11 |
| Database | PostgreSQL 15+ |
| Auth | JWT + RBAC |
| Charts | Recharts |
| Maps | Leaflet + React-Leaflet |
| Deployment | Docker |

## Project Structure

```
civic-complaint-system/
├── backend/
│   ├── auth/              # Authentication service
│   ├── complaint/         # Complaint CRUD service
│   ├── priority_engine/   # Priority calculation + max-heap + trie
│   ├── admin/             # Admin dashboard service
│   ├── notification/      # Notification service
│   ├── common/            # Shared auth, exceptions
│   ├── models/            # SQLAlchemy models
│   ├── schemas/           # Pydantic schemas
│   ├── db/                # Database session, init, seed
│   ├── main.py            # FastAPI app entry
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── components/    # Reusable UI components
    │   ├── pages/         # Page components
    │   ├── hooks/         # Custom React hooks
    │   ├── context/       # React context (Auth)
    │   ├── services/      # API client
    │   ├── utils/         # Helpers, formatters
    │   ├── styles/        # Global CSS + Tailwind
    │   ├── App.jsx        # Routes + layout
    │   └── main.jsx       # Entry point
    ├── package.json
    ├── tailwind.config.js
    ├── vite.config.js
    └── index.html
```

## Quick Start

### Prerequisites
- Docker & Docker Compose
- OR: Python 3.11+, Node 18+, PostgreSQL 15+

### Using Docker (Recommended)

```bash
# Clone and navigate
cd civic-complaint-system

# Copy environment files
cp .env.example .env
cp backend/.env.example backend/.env
# Edit .env and backend/.env with your settings

# Start all services
docker-compose up -d

# For a new database, load the initial departments and categories once
docker compose exec backend python -m db.seed

# Access:
# Frontend: http://localhost:3005
# Backend API: http://localhost:8000
# API Docs: http://localhost:8000/docs
```

The live scanner uses the `ai-service` container. Set `ROBOFLOW_API_KEY` in the
repository-root `.env` before starting Compose. The backend forwards detection
requests to that container. Browser camera and location access require HTTPS or
`localhost`; the hosted models also require network access. A signed-in user can
check scanner availability at `GET /api/detect/health`.
Garbage detections require the citizen to inspect the captured frame and confirm
before filing. The current hosted model has produced false positives, so its
accuracy needs labeled local images before automatic garbage filing is enabled.

### Manual Setup

#### Backend
```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with DATABASE_URL, SECRET_KEY, etc.

# Initialize database
python -m db.init_db

# Seed sample data
python -m db.seed

# Run server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

For manual live scanning, start `ai_service.app` on port 8001 using the setup in
[ai_service/README.md](ai_service/README.md), set `ROBOFLOW_API_KEY` in the
repository-root `.env`, and point backend `AI_SERVICE_URL` to that service.

#### Frontend
```bash
cd frontend

# Install dependencies
npm install

# Run dev server
npm run dev

# Build for production
npm run build
```

## Default Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@city.gov | admin123 |
| Citizen | citizen@example.com | citizen123 |
| Department (Roads) | roads@city.gov | dept123 |

## Priority Formula (Configurable)

The priority engine uses a weighted combination of four factors:

```
Priority Score = (0.30 × Severity) + (0.25 × Location) + (0.25 × Ageing) + (0.20 × Votes)
```

### Factor Details

| Factor | Weight | Calculation |
|--------|--------|-------------|
| **Severity** | 30% | From category `base_severity` (0-1). Sewage=0.9, Pothole=0.7, Garbage=0.4 |
| **Location** | 25% | Sensitive zone proximity: Hospital=0.6, School=0.7, High footfall=0.9, Normal=0.1 |
| **Ageing** | 25% | Linear: `min(days_since_created / 30, 1.0)`. Maxes out at 30 days. |
| **Votes** | 20% | Saturation curve: `votes / (votes + 50)`. 50 votes = ~0.5 score. |

### Priority Thresholds
- **HIGH**: Score ≥ 0.70
- **MEDIUM**: Score ≥ 0.40
- **LOW**: Score < 0.40

### Recalculation
- Runs on complaint creation
- Runs on upvote/downvote
- Background job re-evaluates all active complaints periodically (ageing factor increases over time)

### Configuration
Weights and thresholds are configurable in `backend/priority_engine/engine.py`:
```python
PRIORITY_WEIGHTS = {
    "severity": 0.30,
    "location": 0.25,
    "ageing": 0.25,
    "votes": 0.20,
}
HIGH_THRESHOLD = 0.7
MEDIUM_THRESHOLD = 0.4
MAX_AGE_DAYS = 30
VOTE_SATURATION = 50
```

## Data Structures

### Priority Max-Heap
- `PriorityQueue` class in `backend/priority_engine/engine.py`
- Max-heap using negative scores (Python's `heapq` is min-heap)
- Supports: push, pop, peek, update_priority, remove, get_top_n
- Used for department queue ranking

### Location Trie
- `LocationTrie` class in `backend/priority_engine/engine.py`
- Prefix search over area names, landmarks, address words
- O(m) search where m = prefix length
- Built on startup from database locations
- Used in citizen submission autocomplete and admin filters

## API Endpoints

### Auth
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login, returns JWT tokens
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/me` - Current user profile
- `PUT /api/auth/me` - Update profile

### Complaints
- `POST /api/complaints` - Submit complaint (multipart)
- `GET /api/complaints` - List complaints (filtered)
- `GET /api/complaints/{id}` - Get complaint detail
- `PUT /api/complaints/{id}` - Update complaint
- `POST /api/complaints/{id}/upvote` - Upvote
- `DELETE /api/complaints/{id}/upvote` - Remove upvote
- `GET /api/complaints/locations/search?q=` - Location autocomplete

### Priority Engine
- `POST /api/priority/calculate` - Preview priority calculation
- `POST /api/priority/recalculate/{id}` - Recalculate single complaint
- `POST /api/priority/recalculate-all` - Background job endpoint
- `GET /api/priority/queue/top` - Top N complaints for department
- `GET /api/priority/queue/stats` - Queue statistics

### Admin
- `GET /api/admin/dashboard/stats` - KPI dashboard
- `GET /api/admin/complaints` - All complaints with filters
- `GET /api/admin/complaints/{id}` - Full detail + history
- `PUT /api/admin/complaints/{id}/assign` - Assign department
- `PUT /api/admin/complaints/{id}/resolve` - Mark resolved
- `POST /api/admin/complaints/{id}/undo` - Undo last action
- `GET/POST/PUT/DELETE /api/admin/categories` - Category CRUD
- `GET/POST /api/admin/departments` - Department CRUD
- `GET /api/admin/reports/*` - Analytics endpoints
- `GET/POST /api/admin/clusters` - Geographic clustering

### Notifications
- `GET /api/notifications` - User notifications
- `PUT /api/notifications/{id}/read` - Mark read
- `PUT /api/notifications/read-all` - Mark all read
- `POST /api/notifications/send` - Admin send notification
- `POST /api/notifications/broadcast` - Broadcast to role

## UI/UX Highlights

### Design System
- **Primary**: Deep teal (#2d8ab4) - municipal trust
- **Priority Colors**: 
  - HIGH: Red (#c0152f) with icon + label (not color-only)
  - MEDIUM: Amber (#ad6800)
  - LOW: Green (#166534)
- **Status Colors**: Distinct per lifecycle stage
- **Typography**: Inter font, clear hierarchy (heading/body/caption)
- **Spacing**: 4px base, generous card padding

### State Handling
- **Loading**: Skeletons matching content structure
- **Empty**: Illustrated states with CTAs
- **Error**: Inline, human-readable, dismissible
- **Optimistic**: Upvotes, status changes with rollback

### Accessibility
- Semantic HTML5 + ARIA labels
- Focus-visible outlines
- WCAG AA contrast ratios
- Keyboard navigable
- Screen reader friendly

## Out of Scope (Future Enhancements)

The following are explicitly **not implemented** but documented for future work:

1. **ML-based severity classification** from text/photo analysis
2. **Public analytics dashboard** with GIS heat maps
3. **SLA-based automatic escalation** with time-based alerts
4. **Multilingual support** (i18n)
5. **Advanced clustering UI** with map visualization
6. **Mobile app** (React Native / Flutter)
7. **Offline-first** capability for field workers
8. **Integration** with municipal ERP/CRM systems

## Environment Variables

### Backend (.env)
```env
DATABASE_URL=postgresql://user:pass@localhost:5432/civic_complaints
SECRET_KEY=your-32-char-secret-key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# Priority Engine (optional overrides)
PRIORITY_WEIGHT_SEVERITY=0.30
PRIORITY_WEIGHT_LOCATION=0.25
PRIORITY_WEIGHT_AGEING=0.25
PRIORITY_WEIGHT_VOTES=0.20
PRIORITY_HIGH_THRESHOLD=0.7
PRIORITY_MEDIUM_THRESHOLD=0.4
MAX_AGE_DAYS=30
VOTE_SATURATION=50

# External Services (stubs)
EMAIL_SERVICE_API_KEY=
SMS_SERVICE_API_KEY=
PUSH_SERVICE_API_KEY=
```

### Frontend (.env)
```env
VITE_API_URL=http://localhost:8000/api
```

## Development

### Running Tests
```bash
# Backend
cd backend
pytest -v --cov

# Frontend
cd frontend
npm run test
```

### Code Quality
```bash
# Backend
ruff check .
black .

# Frontend
npm run lint
```

### Database Migrations
```bash
cd backend
alembic revision --autogenerate -m "description"
alembic upgrade head
```

## Deployment

### Production Checklist
- [ ] Set strong `SECRET_KEY` (32+ chars)
- [ ] Use managed PostgreSQL (RDS, Cloud SQL)
- [ ] Configure HTTPS/TLS
- [ ] Set up Redis for session/cache
- [ ] Configure object storage (S3) for evidence files
- [ ] Set up email/SMS/push providers
- [ ] Configure log aggregation
- [ ] Set up monitoring/alerting
- [ ] Run database migrations
- [ ] Load test priority engine

### Docker Production
```bash
# Build images
docker-compose -f docker-compose.prod.yml build

# Deploy
docker-compose -f docker-compose.prod.yml up -d
```

## License

MIT License - Feel free to use for civic projects.

## Contributing

1. Fork the repository
2. Create feature branch
3. Commit changes with clear messages
4. Submit pull request

## Support

For issues or questions, please open a GitHub issue.

---

**Built for civic trust** — Making municipal complaint tracking transparent, efficient, and citizen-centric.
