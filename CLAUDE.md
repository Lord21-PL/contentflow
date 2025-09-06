# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ContentFlow AI is a monorepo with a Node.js/Express backend and React frontend for automated WordPress content generation. The application uses OpenAI API to generate SEO-optimized articles from keywords and schedules them for publication.

## Development Commands

### Root Level Commands
- `npm run dev` - Start both backend (port 3001) and frontend (port 3000) in development mode
- `npm start` - Start only the backend server
- `npm run heroku-postbuild` - Production build script for Heroku deployment

### Backend (backend/)
- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon

### Frontend (frontend/)
- `npm start` - Start React development server (port 3000)
- `npm run build` - Build production React app
- `npm test` - Run React tests
- `npm run eject` - Eject from Create React App

## Architecture

### Monorepo Structure
The project uses npm workspaces with two main packages:
- `backend/` - Express.js API server
- `frontend/` - React SPA

### Backend Architecture
- **Entry Point**: `backend/server.js` - Express server with CORS, static file serving, and catch-all routing for React
- **Database**: PostgreSQL with connection pooling via `backend/db.js`
- **Routes**: 
  - `backend/routes/projects.js` - Project CRUD operations, keyword management, CSV upload
  - `backend/routes/cron.js` - Scheduled post execution and cron jobs
- **Services**:
  - `backend/services/aiService.js` - OpenAI integration for keyword analysis and article generation
  - `backend/services/wordpressService.js` - WordPress REST API integration
  - `backend/services/cronWorker.js` - Background job processing

### Frontend Architecture
- **React Router**: Client-side routing with `/` (Dashboard) and `/project/:id` (Project Detail)
- **Components**:
  - `Dashboard.js` - Main project listing with create/delete functionality
  - `ProjectDetail.js` - Project management, keyword upload, scheduling
  - `ProjectForm.js` - Project creation form
- **API Layer**: `frontend/src/api.js` - Centralized API communication
- **Proxy Configuration**: Frontend proxies `/api` requests to backend (port 3001)

### Database Schema
Key tables include:
- `projects` - WordPress site configurations
- `keywords` - SEO keywords with categories and analysis
- `scheduled_posts` - Post scheduling with status tracking (`pending`, `processing`, `completed`, `failed`)

### AI Integration
- Uses GPT-4 for keyword analysis (language detection, title generation, categorization)
- Generates articles with structured content including H2 headings
- Configurable via `OPENAI_API_KEY` environment variable

## Environment Setup

Copy `.env.example` to `.env` and configure:
- `DATABASE_URL` - PostgreSQL connection string
- `OPENAI_API_KEY` - OpenAI API access
- `CRON_SECRET_KEY` - Security key for cron endpoints
- `PORT` - Backend server port (default: 3001)
- `FRONTEND_URL` - Frontend URL for CORS

## Deployment

Configured for Heroku deployment:
- `Procfile` specifies web process
- Database migrations in `database.sql`
- Production build process combines both workspaces

## Key Features

1. **Multi-site Management** - Handle multiple WordPress installations
2. **Keyword Analysis** - AI-powered keyword processing with language detection
3. **Content Scheduling** - Automated post scheduling with configurable frequency
4. **CSV Import** - Bulk keyword upload functionality
5. **WordPress Integration** - Direct publishing via REST API
6. **Background Processing** - Cron job system for scheduled content generation