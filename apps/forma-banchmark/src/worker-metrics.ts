type MemorySnapshot = {
  rssMb: number
  heapUsedMb: number
  heapTotalMb: number
  externalMb: number
  arrayBuffersMb: number
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
    heapUsedMb: bytesToMb(memory.heapUsed),
    heapTotalMb: bytesToMb(memory.heapTotal),
    externalMb: bytesToMb(memory.external),
    arrayBuffersMb: bytesToMb(
      memory.arrayBuffers
    ),
  }
}

export function startWorkerMemoryMonitor(
  intervalMs = 10
) {
  const startedAt = Date.now()

  let samples = 0

  let peak = {
    ...memorySnapshot(),
    elapsedMs: 0,
  }

  const interval = setInterval(() => {
    const current = memorySnapshot()

    samples += 1

    if (current.rssMb > peak.rssMb) {
      peak = {
        ...current,
        elapsedMs:
          Date.now() - startedAt,
      }
    }
  }, intervalMs)

  console.log(
    JSON.stringify({
      event: "worker_memory_monitor_started",
      intervalMs,
      initial: memorySnapshot(),
      timestamp:
        new Date().toISOString(),
    })
  )

  return {
    checkpoint(label: string) {
      const current = memorySnapshot()

      console.log(
        JSON.stringify({
          event:
            "worker_memory_checkpoint",
          label,
          current,
          peakObserved: peak,
          samples,
          uptimeMs:
            Date.now() - startedAt,
          timestamp:
            new Date().toISOString(),
        })
      )
    },

    stop() {
      clearInterval(interval)

      const current = memorySnapshot()

      console.log(
        JSON.stringify({
          event:
            "worker_memory_monitor_stopped",
          current,
          peakObserved: peak,
          samples,
          uptimeMs:
            Date.now() - startedAt,
          timestamp:
            new Date().toISOString(),
        })
      )
    },
  }
}