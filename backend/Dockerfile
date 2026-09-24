FROM python:3.11-slim

WORKDIR /app

# Системные C-библиотеки и утилиты проверки портов (netcat)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Копируем код бэкенда и смежные модули корня
COPY backend ./backend
COPY ai_agent ./ai_agent
COPY scripts ./scripts
COPY parser ./parser

ENV PYTHONPATH="/app:/app/backend"
WORKDIR /app/backend

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
