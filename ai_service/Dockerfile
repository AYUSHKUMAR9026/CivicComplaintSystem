FROM python:3.11-slim

WORKDIR /app

COPY ai_service/requirements-hosted.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY ai_service ./ai_service

EXPOSE 8001
CMD ["uvicorn", "ai_service.app:app", "--host", "0.0.0.0", "--port", "8001"]
