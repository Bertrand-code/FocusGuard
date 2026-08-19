FROM python:3.12-slim@sha256:2c941e860699f878900b0edc2403613c234d4b32eda3cc9fa7036991a2a63c4a AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN addgroup --system focusguard && adduser --system --ingroup focusguard focusguard
WORKDIR /app
COPY pyproject.toml ./
COPY src ./src
RUN pip install --no-cache-dir .

FROM base AS test
USER root
COPY tests ./tests
RUN pip install --no-cache-dir '.[dev]'
CMD ["pytest", "--cov=focusguard_api", "--cov-report=term-missing"]

FROM base AS runtime
USER focusguard
EXPOSE 8000
CMD ["uvicorn", "focusguard_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-server-header"]
