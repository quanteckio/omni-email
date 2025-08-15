# Docker Deployment Guide for Omni-Email

This guide explains how to deploy the Omni-Email application using Docker for production environments.

## Prerequisites

- Docker (version 20.10+)
- Docker Compose (version 2.0+)

## Quick Start

### Using Docker Compose (Recommended)

1. **Build and start the application:**
   ```bash
   npm run docker:compose:up
   ```

2. **Access the application:**
   - API: http://localhost:3000
   - Swagger docs: http://localhost:3000/api-docs

3. **View logs:**
   ```bash
   npm run docker:compose:logs
   ```

4. **Stop the application:**
   ```bash
   npm run docker:compose:down
   ```

### Using Docker directly

1. **Build the production image:**
   ```bash
   npm run docker:build:prod
   ```

2. **Run the container:**
   ```bash
   npm run docker:run:prod
   ```

## Available Docker Scripts

| Script | Description |
|--------|-------------|
| `docker:build` | Build development Docker image |
| `docker:build:prod` | Build production Docker image |
| `docker:run` | Run development container |
| `docker:run:prod` | Run production container |
| `docker:compose:up` | Start application with Docker Compose |
| `docker:compose:down` | Stop Docker Compose services |
| `docker:compose:logs` | View application logs |
| `docker:prune` | Clean up unused Docker resources |

## Production Deployment

### Environment Variables

Create a `.env.production` file for production environment variables:

```env
NODE_ENV=production
PORT=3000
# Add your Resend API key and other secrets
RESEND_API_KEY=your_api_key_here
```

### Nginx Proxy (Optional)

Uncomment the nginx service in `docker-compose.yml` to add a reverse proxy with SSL support.

### Health Checks

The Docker container includes health checks that ping the `/api-docs` endpoint every 30 seconds.

### Resource Limits

For production, consider adding resource limits to your `docker-compose.yml`:

```yaml
services:
  omni-email:
    # ... other configuration
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
```

## Security Considerations

- The Docker image runs as a non-root user (`node`)
- Uses `dumb-init` for proper signal handling
- Excludes development files via `.dockerignore`
- Multi-stage build reduces final image size

## Troubleshooting

### Container won't start
```bash
# Check container logs
docker-compose logs omni-email

# Check container status
docker-compose ps
```

### Port conflicts
If port 3000 is already in use, modify the port mapping in `docker-compose.yml`:
```yaml
ports:
  - "8080:3000"  # Change external port to 8080
```

### Memory issues
Monitor container resource usage:
```bash
docker stats omni-email-app
```
