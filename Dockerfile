# Stage 1: build the React dashboard into static files.
FROM node:22-slim AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# Stage 2: FastAPI serves the API, the built dashboard and the committed January data.
FROM python:3.14-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000
WORKDIR /app
COPY backend/requirements.txt backend/
RUN pip install --no-cache-dir --disable-pip-version-check --root-user-action=ignore -r backend/requirements.txt
COPY backend/app backend/app
COPY backend/data backend/data
COPY --from=frontend /frontend/dist frontend/dist
RUN useradd --create-home --uid 10001 windlens
USER windlens
WORKDIR /app/backend
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD ["python", "-c", "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/api/health' % os.environ['PORT'], timeout=4)"]
# Shell form so a platform-assigned $PORT (e.g. Heroku) is used; exec makes uvicorn PID 1 for clean shutdowns.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
