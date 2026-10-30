FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
# Text recognition for photographed papers (Arabic, English, French, Spanish).
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-ara tesseract-ocr-fra tesseract-ocr-spa && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY qubedu_ai ./qubedu_ai
RUN useradd --system --uid 10001 app
USER app
EXPOSE 8790
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request,sys;sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8790/health').status==200 else 1)"
CMD ["uvicorn", "qubedu_ai.main:app", "--host", "0.0.0.0", "--port", "8790", "--workers", "2"]
