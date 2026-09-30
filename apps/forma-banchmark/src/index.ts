import { startApi } from "./api.js"
import { startWorker } from "./worker.js"

const runtime = process.env.FORMA_RUNTIME

async function main() {
  switch (runtime) {
    case "api":
      console.log("[FORMA BENCHMARK] Runtime: API")
      await startApi()
      break

    case "worker":
      console.log("[FORMA BENCHMARK] Runtime: WORKER")
      await startWorker()
      break

    default:
      throw new Error(
        `Invalid FORMA_RUNTIME "${runtime}". Expected "api" or "worker".`
      )
  }
}

main().catch((error) => {
  console.error("[FORMA BENCHMARK] Fatal error", error)
  process.exit(1)
})