import sharp from "sharp"
import { mkdir, stat } from "node:fs/promises"
import path from "node:path"

export type ImageBenchmarkPayload = {
  benchmarkId: string
  inputPath: string
}

type MemorySnapshot = {
  rssMb: number
  heapUsedMb: number
  heapTotalMb: number
  externalMb: number
  arrayBuffersMb: number
}

type MemoryPeak = MemorySnapshot & {
  elapsedMs: number
}

function bytesToMb(bytes: number) {
  return Math.round(
    (bytes / 1024 / 1024) * 100
  ) / 100
}

function memorySnapshot(): MemorySnapshot {
  const memory = process.memoryUsage()

  return {
    rssMb: bytesToMb(memory.rss),
    heapUsedMb: bytesToMb(
      memory.heapUsed
    ),
    heapTotalMb: bytesToMb(
      memory.heapTotal
    ),
    externalMb: bytesToMb(
      memory.external
    ),
    arrayBuffersMb: bytesToMb(
      memory.arrayBuffers
    ),
  }
}

function createMemorySampler(
  startedAt: number,
  intervalMs = 10
) {
  const initial = memorySnapshot()

  let samples = 1

  let peak: MemoryPeak = {
    ...initial,
    elapsedMs: 0,
  }

  const sample = () => {
    const current = memorySnapshot()
    samples += 1

    if (current.rssMb > peak.rssMb) {
      peak = {
        ...current,
        elapsedMs:
          Date.now() - startedAt,
      }
    }
  }

  const interval = setInterval(
    sample,
    intervalMs
  )

  return {
    stop() {
      clearInterval(interval)

      // Uma última medição no momento
      // imediatamente posterior ao trabalho.
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
  const startedAt = Date.now()

  const inputPath = path.resolve(
    payload.inputPath
  )

  const outputDirectory = path.resolve(
    process.cwd(),
    "benchmark-data",
    "output"
  )

  await mkdir(outputDirectory, {
    recursive: true,
  })

  const outputPath = path.join(
    outputDirectory,
    `${payload.benchmarkId}.jpg`
  )

  const inputFile = await stat(inputPath)

  const memoryBefore =
    memorySnapshot()

  const metadataStartedAt =
    Date.now()

  const metadata =
    await sharp(inputPath).metadata()

  const metadataElapsedMs =
    Date.now() - metadataStartedAt

  const memoryAfterMetadata =
    memorySnapshot()

  /*
   * A amostragem começa imediatamente
   * antes da operação pesada.
   */
  const previewStartedAt =
    Date.now()

  const sampler =
    createMemorySampler(
      previewStartedAt,
      10
    )

  let previewInfo:
    | sharp.OutputInfo
    | undefined

  let memorySampling:
    ReturnType<
      ReturnType<
        typeof createMemorySampler
      >["stop"]
    >

  try {
    previewInfo =
      await sharp(inputPath)
        .autoOrient()
        .resize({
          width: 2000,
          height: 2000,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({
          quality: 82,
        })
        .toFile(outputPath)
  } finally {
    memorySampling =
      sampler.stop()
  }

  if (!previewInfo) {
    throw new Error(
      "Preview processing did not produce output information"
    )
  }

  const previewElapsedMs =
    Date.now() - previewStartedAt

  const memoryAfterPreview =
    memorySnapshot()

  const totalElapsedMs =
    Date.now() - startedAt

  return {
    event:
      "image_benchmark_completed",

    benchmarkId:
      payload.benchmarkId,

    input: {
      path: inputPath,
      sizeBytes: inputFile.size,
      sizeMb:
        bytesToMb(inputFile.size),
    },

    metadata: {
      format:
        metadata.format ?? null,
      width:
        metadata.width ?? null,
      height:
        metadata.height ?? null,
      channels:
        metadata.channels ?? null,
      depth:
        metadata.depth ?? null,
      density:
        metadata.density ?? null,
      orientation:
        metadata.orientation ?? null,
      space:
        metadata.space ?? null,
      hasAlpha:
        metadata.hasAlpha ?? null,
      pages:
        metadata.pages ?? null,
    },

    preview: {
      path: outputPath,
      format: previewInfo.format,
      width: previewInfo.width,
      height: previewInfo.height,
      channels:
        previewInfo.channels,
      sizeBytes: previewInfo.size,
      sizeMb:
        bytesToMb(
          previewInfo.size
        ),
    },

    timing: {
      metadataMs:
        metadataElapsedMs,
      previewMs:
        previewElapsedMs,
      totalMs:
        totalElapsedMs,
    },

    memory: {
      before:
        memoryBefore,

      afterMetadata:
        memoryAfterMetadata,

      peakObservedDuringPreview:
        memorySampling.peak,

      afterPreview:
        memoryAfterPreview,

      sampling: {
        intervalMs:
          memorySampling.intervalMs,
        samples:
          memorySampling.samples,
      },
    },

    timestamp:
      new Date().toISOString(),
  }
}