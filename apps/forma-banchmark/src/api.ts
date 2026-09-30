import Fastify from "fastify"
import { randomUUID } from "node:crypto"
import { getWorkerUtils } from "./db.js"

export async function startApi() {
    const workerUtils = await getWorkerUtils()

    const app = Fastify({
        logger: true,
    })

    app.get("/health", async () => {
        return {
            status: "ok",
            runtime: "api",
            pid: process.pid,
            uptimeSeconds: Math.round(process.uptime()),
        }
    })

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
                error: "durationMs must be an integer between 100 and 60000",
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

    app.post(
        "/benchmark/images",
        async (request, reply) => {
            const body = request.body as {
                inputPath?: string
            }

            if (
                !body?.inputPath ||
                typeof body.inputPath !== "string"
            ) {
                return reply.code(400).send({
                    error: "inputPath is required",
                })
            }

            const benchmarkId = randomUUID()

            const job = await workerUtils.addJob(
                "image_benchmark",
                {
                    benchmarkId,
                    inputPath: body.inputPath,
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
                inputPath: body.inputPath,
                status: "queued",
            })
        }
    )

    const port = Number(process.env.PORT || 3000)

    await app.listen({
        port,
        host: "0.0.0.0",
    })

    console.log(
        `[FORMA BENCHMARK] API listening on 0.0.0.0:${port}`
    )
}