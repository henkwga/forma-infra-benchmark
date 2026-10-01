import sharp from "sharp"

import {
    mkdir,
    rm,
    stat,
} from "node:fs/promises"

import {
    basename,
    extname,
    join,
} from "node:path"

import { tmpdir } from "node:os"

import {
    downloadObjectToFile,
    uploadFile,
} from "./storage.js"

export type ImageBenchmarkPayload = {
    benchmarkId: string
    objectKey: string
}

type MemorySnapshot = {
    rssMb: number
    heapUsedMb: number
    heapTotalMb: number
    externalMb: number
    arrayBuffersMb: number
}

type MemoryPeak =
    MemorySnapshot & {
        elapsedMs: number
    }

function bytesToMb(bytes: number) {
    return (
        Math.round(
            (bytes / 1024 / 1024) *
                100
        ) / 100
    )
}

function memorySnapshot(): MemorySnapshot {
    const memory =
        process.memoryUsage()

    return {
        rssMb:
            bytesToMb(memory.rss),

        heapUsedMb:
            bytesToMb(
                memory.heapUsed
            ),

        heapTotalMb:
            bytesToMb(
                memory.heapTotal
            ),

        externalMb:
            bytesToMb(
                memory.external
            ),

        arrayBuffersMb:
            bytesToMb(
                memory.arrayBuffers
            ),
    }
}

function createMemorySampler(
    startedAt: number,
    intervalMs = 10
) {
    const initial =
        memorySnapshot()

    let samples = 1

    let peak: MemoryPeak = {
        ...initial,
        elapsedMs: 0,
    }

    const sample = () => {
        const current =
            memorySnapshot()

        samples += 1

        if (
            current.rssMb >
            peak.rssMb
        ) {
            peak = {
                ...current,
                elapsedMs:
                    Date.now() -
                    startedAt,
            }
        }
    }

    const interval =
        setInterval(
            sample,
            intervalMs
        )

    return {
        stop() {
            clearInterval(interval)

            sample()

            return {
                intervalMs,
                samples,
                peak,
            }
        },
    }
}

export async function runImageBenchmark(
    payload: ImageBenchmarkPayload
) {
    if (
        !payload?.benchmarkId ||
        typeof payload.benchmarkId !==
            "string"
    ) {
        throw new Error(
            "image_benchmark requires benchmarkId"
        )
    }

    if (
        !payload?.objectKey ||
        typeof payload.objectKey !==
            "string"
    ) {
        throw new Error(
            "image_benchmark requires objectKey"
        )
    }

    const startedAt =
        Date.now()

    const extension =
        extname(payload.objectKey) ||
        ".bin"

    const workDirectory =
        join(
            tmpdir(),
            "forma-image-benchmark",
            payload.benchmarkId
        )

    const inputPath =
        join(
            workDirectory,
            `source${extension}`
        )

    const previewPath =
        join(
            workDirectory,
            "preview.jpg"
        )

    const sourceBaseName =
        basename(
            payload.objectKey,
            extension
        )

    const previewObjectKey =
        `benchmark/output/` +
        `${payload.benchmarkId}-` +
        `${sourceBaseName}-preview.jpg`

    await mkdir(
        workDirectory,
        {
            recursive: true,
        }
    )

    /*
     * Este sampler cobre o job inteiro:
     *
     * download
     * metadata
     * preview
     * upload
     *
     * Assim conseguimos observar também
     * qualquer pico fora do Sharp.
     */
    const sampler =
        createMemorySampler(
            startedAt,
            10
        )

    let memorySampling:
        ReturnType<
            ReturnType<
                typeof createMemorySampler
            >["stop"]
        >
        | undefined

    try {
        console.log(
            JSON.stringify({
                event:
                    "image_benchmark_started",
                benchmarkId:
                    payload.benchmarkId,
                objectKey:
                    payload.objectKey,
                memory:
                    memorySnapshot(),
                timestamp:
                    new Date()
                        .toISOString(),
            })
        )

        /*
         * DOWNLOAD
         */
        const downloadStartedAt =
            Date.now()

        await downloadObjectToFile(
            payload.objectKey,
            inputPath
        )

        const downloadElapsedMs =
            Date.now() -
            downloadStartedAt

        const inputFile =
            await stat(inputPath)

        console.log(
            JSON.stringify({
                event:
                    "image_benchmark_downloaded",
                benchmarkId:
                    payload.benchmarkId,
                sizeBytes:
                    inputFile.size,
                sizeMb:
                    bytesToMb(
                        inputFile.size
                    ),
                downloadMs:
                    downloadElapsedMs,
                memory:
                    memorySnapshot(),
                timestamp:
                    new Date()
                        .toISOString(),
            })
        )

        /*
         * METADATA
         */
        const metadataStartedAt =
            Date.now()

        const metadata =
            await sharp(
                inputPath
            ).metadata()

        const metadataElapsedMs =
            Date.now() -
            metadataStartedAt

        const memoryAfterMetadata =
            memorySnapshot()

        /*
         * PREVIEW
         */
        const previewStartedAt =
            Date.now()

        const previewInfo =
            await sharp(inputPath)
                .autoOrient()
                .resize({
                    width: 2000,
                    height: 2000,
                    fit: "inside",
                    withoutEnlargement:
                        true,
                })
                .jpeg({
                    quality: 82,
                })
                .toFile(
                    previewPath
                )

        const previewElapsedMs =
            Date.now() -
            previewStartedAt

        const memoryAfterPreview =
            memorySnapshot()

        console.log(
            JSON.stringify({
                event:
                    "image_benchmark_processed",

                benchmarkId:
                    payload.benchmarkId,

                metadata: {
                    format:
                        metadata.format ??
                        null,

                    width:
                        metadata.width ??
                        null,

                    height:
                        metadata.height ??
                        null,

                    channels:
                        metadata.channels ??
                        null,

                    depth:
                        metadata.depth ??
                        null,

                    density:
                        metadata.density ??
                        null,

                    orientation:
                        metadata.orientation ??
                        null,

                    space:
                        metadata.space ??
                        null,

                    hasAlpha:
                        metadata.hasAlpha ??
                        null,

                    pages:
                        metadata.pages ??
                        null,
                },

                preview: {
                    format:
                        previewInfo.format,

                    width:
                        previewInfo.width,

                    height:
                        previewInfo.height,

                    channels:
                        previewInfo.channels,

                    sizeBytes:
                        previewInfo.size,

                    sizeMb:
                        bytesToMb(
                            previewInfo.size
                        ),
                },

                metadataMs:
                    metadataElapsedMs,

                previewMs:
                    previewElapsedMs,

                memory:
                    memoryAfterPreview,

                timestamp:
                    new Date()
                        .toISOString(),
            })
        )

        /*
         * UPLOAD DA PREVIEW
         */
        const uploadStartedAt =
            Date.now()

        await uploadFile(
            previewPath,
            previewObjectKey,
            "image/jpeg"
        )

        const uploadElapsedMs =
            Date.now() -
            uploadStartedAt

        const totalElapsedMs =
            Date.now() -
            startedAt

        /*
         * Captura final antes
         * de encerrar o sampler.
         */
        memorySampling =
            sampler.stop()

        const result = {
            event:
                "image_benchmark_completed",

            benchmarkId:
                payload.benchmarkId,

            input: {
                objectKey:
                    payload.objectKey,

                temporaryPath:
                    inputPath,

                sizeBytes:
                    inputFile.size,

                sizeMb:
                    bytesToMb(
                        inputFile.size
                    ),
            },

            metadata: {
                format:
                    metadata.format ??
                    null,

                width:
                    metadata.width ??
                    null,

                height:
                    metadata.height ??
                    null,

                channels:
                    metadata.channels ??
                    null,

                depth:
                    metadata.depth ??
                    null,

                density:
                    metadata.density ??
                    null,

                orientation:
                    metadata.orientation ??
                    null,

                space:
                    metadata.space ??
                    null,

                hasAlpha:
                    metadata.hasAlpha ??
                    null,

                pages:
                    metadata.pages ??
                    null,
            },

            preview: {
                objectKey:
                    previewObjectKey,

                format:
                    previewInfo.format,

                width:
                    previewInfo.width,

                height:
                    previewInfo.height,

                channels:
                    previewInfo.channels,

                sizeBytes:
                    previewInfo.size,

                sizeMb:
                    bytesToMb(
                        previewInfo.size
                    ),
            },

            timing: {
                downloadMs:
                    downloadElapsedMs,

                metadataMs:
                    metadataElapsedMs,

                previewMs:
                    previewElapsedMs,

                uploadMs:
                    uploadElapsedMs,

                totalMs:
                    totalElapsedMs,
            },

            memory: {
                afterMetadata:
                    memoryAfterMetadata,

                afterPreview:
                    memoryAfterPreview,

                peakObserved:
                    memorySampling.peak,

                sampling: {
                    intervalMs:
                        memorySampling
                            .intervalMs,

                    samples:
                        memorySampling
                            .samples,
                },
            },

            timestamp:
                new Date()
                    .toISOString(),
        }

        console.log(
            JSON.stringify(result)
        )

        return result
    } catch (error) {
        /*
         * Garante que o sampler seja
         * encerrado também em falhas.
         */
        if (!memorySampling) {
            memorySampling =
                sampler.stop()
        }

        console.error(
            JSON.stringify({
                event:
                    "image_benchmark_failed",

                benchmarkId:
                    payload.benchmarkId,

                objectKey:
                    payload.objectKey,

                peakObserved:
                    memorySampling
                        .peak,

                error:
                    error instanceof Error
                        ? error.message
                        : String(error),

                stack:
                    error instanceof Error
                        ? error.stack
                        : undefined,

                timestamp:
                    new Date()
                        .toISOString(),
            })
        )

        throw error
    } finally {
        /*
         * O disco do runtime é temporário.
         * Source e preview não devem
         * permanecer no container.
         */
        try {
            await rm(
                workDirectory,
                {
                    recursive: true,
                    force: true,
                }
            )

            console.log(
                JSON.stringify({
                    event:
                        "image_benchmark_tmp_cleaned",

                    benchmarkId:
                        payload.benchmarkId,

                    timestamp:
                        new Date()
                            .toISOString(),
                })
            )
        } catch (
            cleanupError
        ) {
            console.error(
                JSON.stringify({
                    event:
                        "image_benchmark_tmp_cleanup_failed",

                    benchmarkId:
                        payload.benchmarkId,

                    error:
                        cleanupError instanceof
                        Error
                            ? cleanupError.message
                            : String(
                                  cleanupError
                              ),

                    timestamp:
                        new Date()
                            .toISOString(),
                })
            )
        }
    }
}