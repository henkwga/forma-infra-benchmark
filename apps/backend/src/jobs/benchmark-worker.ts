import { MedusaContainer } from "@medusajs/framework/types"

export default async function benchmarkWorkerJob(
  container: MedusaContainer
) {
  const logger = container.resolve("logger")

  logger.info("[BENCHMARK] Medusa worker executed")
}

export const config = {
  name: "benchmark-worker",
  schedule: "* * * * *",
}