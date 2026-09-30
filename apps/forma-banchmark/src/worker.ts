import {
    run,
    type TaskList,
} from "graphile-worker"

import {
    runImageBenchmark,
    type ImageBenchmarkPayload,
} from "./image-benchmark.js"

import {
    startWorkerMemoryMonitor,
} from "./worker-metrics.js"

type BenchmarkPayload = {
    benchmarkId: string
    durationMs: number
}

const taskList: TaskList = {
    benchmark_job: async (
        rawPayload,
        helpers
    ) => {
        const payload =
            rawPayload as BenchmarkPayload

        const startedAt = Date.now()
        const before = process.memoryUsage()

        helpers.logger.info(
            `Starting benchmark ${payload.benchmarkId}`
        )

        await new Promise((resolve) =>
            setTimeout(resolve, payload.durationMs)
        )

        const after = process.memoryUsage()
        const elapsedMs =
            Date.now() - startedAt

        console.log(
            JSON.stringify({
                event: "benchmark_job_completed",
                benchmarkId: payload.benchmarkId,
                requestedDurationMs:
                    payload.durationMs,
                elapsedMs,
                rssBeforeMb: Math.round(
                    before.rss / 1024 / 1024
                ),
                rssAfterMb: Math.round(
                    after.rss / 1024 / 1024
                ),
                heapUsedBeforeMb: Math.round(
                    before.heapUsed / 1024 / 1024
                ),
                heapUsedAfterMb: Math.round(
                    after.heapUsed / 1024 / 1024
                ),
                timestamp:
                    new Date().toISOString(),
            })
        )
    },

    image_benchmark: async (
        rawPayload,
        helpers
    ) => {
        const payload =
            rawPayload as ImageBenchmarkPayload

        helpers.logger.info(
            `Starting image benchmark ${payload.benchmarkId}`
        )

        try {
            const result =
                await runImageBenchmark(payload)

            console.log(
                JSON.stringify(result)
            )
        } catch (error) {
            console.error(
                JSON.stringify({
                    event:
                        "image_benchmark_failed",
                    benchmarkId:
                        payload.benchmarkId,
                    error:
                        error instanceof Error
                            ? error.message
                            : String(error),
                    timestamp:
                        new Date().toISOString(),
                })
            )

            throw error
        }
    },
}

export async function startWorker() {

    const connectionString =
        process.env.DATABASE_URL

    if (!connectionString) {
        throw new Error(
            "DATABASE_URL is required"
        )
    }

    console.log(
        "[FORMA BENCHMARK] Worker starting"
    )
    const memoryMonitor =
        startWorkerMemoryMonitor(10)
    const runner = await run({
        connectionString,
        concurrency: Number(
            process.env.WORKER_CONCURRENCY || 1
        ),
        taskList,
        noHandleSignals: false,
    })

    console.log(
        "[FORMA BENCHMARK] Worker ready"
    )
    memoryMonitor.checkpoint(
        "worker_ready"
    )
    try {
        await runner.promise
    } finally {
        memoryMonitor.checkpoint(
            "worker_shutdown"
        )

        memoryMonitor.stop()
    }
}