import Fastify from "fastify"
import { randomUUID } from "node:crypto"
import { getWorkerUtils } from "./db.js"

export async function startApi() {
    const workerUtils = await getWorkerUtils()

    const app = Fastify({
        logger: true,
    })

    /**
     * Health check
     */
    app.get("/health", async () => {
        return {
            status: "ok",
            runtime: "api",
            pid: process.pid,
            uptimeSeconds: Math.round(process.uptime()),
        }
    })

    /**
     * Synthetic benchmark job
     *
     * Used to validate:
     * API -> PostgreSQL -> Graphile Worker -> Worker
     */
    app.post("/benchmark/jobs", async (request, reply) => {
        const body = request.body as {
            durationMs?: number
        }

        const durationMs = body?.durationMs ?? 5000

        if (
            !Number.isInteger(durationMs) ||
            durationMs < 100 ||
            durationMs > 60_000
        ) {
            return reply.code(400).send({
                error:
                    "durationMs must be an integer between 100 and 60000",
            })
        }

        const benchmarkId = randomUUID()

        const job = await workerUtils.addJob(
            "benchmark_job",
            {
                benchmarkId,
                durationMs,
            },
            {
                maxAttempts: 3,
                jobKey: `benchmark:${benchmarkId}`,
            }
        )

        return reply.code(202).send({
            benchmarkId,
            graphileJobId: job.id,
            durationMs,
            status: "queued",
        })
    })

    /**
     * Image benchmark job
     *
     * The API does NOT receive a local filesystem path anymore.
     *
     * It receives the key of an object already stored in R2.
     *
     * Flow:
     *
     * API
     *   -> Graphile Worker
     *   -> Forma Worker
     *   -> R2 GetObject
     *   -> /tmp
     *   -> Sharp
     *   -> R2 PutObject (preview)
     */
    app.post(
        "/benchmark/images",
        async (request, reply) => {
            const body = request.body as {
                objectKey?: string
            }

            if (
                !body?.objectKey ||
                typeof body.objectKey !== "string"
            ) {
                return reply.code(400).send({
                    error: "objectKey is required",
                })
            }

            const objectKey = body.objectKey.trim()

            if (!objectKey) {
                return reply.code(400).send({
                    error: "objectKey cannot be empty",
                })
            }

            const benchmarkId = randomUUID()

            const job = await workerUtils.addJob(
                "image_benchmark",
                {
                    benchmarkId,
                    objectKey,
                },
                {
                    maxAttempts: 1,
                    jobKey:
                        `image-benchmark:${benchmarkId}`,
                }
            )

            return reply.code(202).send({
                benchmarkId,
                graphileJobId: job.id,
                objectKey,
                status: "queued",
            })
        }
    )

    /**
     * Start HTTP server
     *
     * Railway supplies PORT automatically.
     * Local fallback: 3000.
     */
    const port = Number(process.env.PORT || 3000)

    await app.listen({
        port,
        host: "0.0.0.0",
    })

    console.log(
        `[FORMA BENCHMARK] API listening on 0.0.0.0:${port}`
    )
}