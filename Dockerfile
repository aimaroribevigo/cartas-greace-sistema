FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py plazos.py whatsapp_notify.py normalizers.py import_excel.py clasificacion.py hilos.py auth.py dashboard.html ./

EXPOSE 5000

CMD ["python", "app.py"]
