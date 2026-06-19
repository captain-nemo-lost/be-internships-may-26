# 10k RPS Scaling Plan

To scale this service to 10,000 requests per second across multiple instances safely, we must graduate from SQLite and single-node patterns to a distributed architecture.

## 1. Database & Persistence Layer
- **Replace SQLite with PostgreSQL**: SQLite's single-writer architecture and file-based locks will become a severe bottleneck. PostgreSQL natively supports high concurrency, connection pooling (via PgBouncer), and handles high-throughput `INSERT ... ON CONFLICT DO NOTHING` operations efficiently.
- **Connection Pooling**: Use a pooler to maintain a fixed number of DB connections to avoid overwhelming the database with 10k concurrent connections.

## 2. Distributed Rate Limiting
- **Redis for Rate Limits**: Migrate the rate limiter from SQLite to a distributed in-memory datastore like Redis. Redis provides extremely fast atomic operations (like `INCR` and `EXPIRE`) which are perfect for sliding-window or token-bucket rate limits across thousands of distributed Node.js workers.

## 3. Distributed Idempotency Store
- **Redis Cache Layer**: Querying the primary database (PostgreSQL) for every idempotency check at 10k RPS is expensive. We should cache idempotency keys in Redis to handle duplicates immediately without touching the DB.
- **TTL/Expiry Configuration**: Idempotency keys cannot be stored indefinitely. We must configure a strict TTL (Time-To-Live) on these keys in Redis (e.g., 24 hours), ensuring old keys are evicted to prevent unbounded memory growth.

## 4. Asynchronous Ingestion & Queuing
- **Message Broker (Kafka / RabbitMQ)**: Instead of processing the database insertion synchronously during the HTTP request, validate the rate limit and idempotency key, then push the valid payload to a message broker.
- **Background Workers**: Dedicated worker instances will pull from the message broker and batch insert into PostgreSQL, smoothing out traffic spikes and maximizing DB throughput.

## 5. Load Shedding & Backpressure
- **Handling Overload**: If the message queue backs up or the database experiences degraded performance, the service must implement **Load Shedding**. Rather than buffering indefinitely and crashing out of memory, the service should proactively return `503 Service Unavailable` or `429 Too Many Requests` (distinct from user-specific rate limits) to shed excess load and maintain stability for a subset of traffic.

## 6. Horizontal Scaling
- **Kubernetes / Orchestration**: Deploy the Fastify application in a container orchestrator like Kubernetes. Utilize a Horizontal Pod Autoscaler (HPA) to automatically spin up more Node.js instances behind a Load Balancer as CPU or memory utilization increases.
