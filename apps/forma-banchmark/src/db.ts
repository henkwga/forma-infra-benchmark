import {
  makeWorkerUtils,
  type WorkerUtils,
} from "graphile-worker"

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error("DATABASE_URL is required")
}

let workerUtilsInstance: WorkerUtils | undefined

export async function getWorkerUtils(): Promise<WorkerUtils> {
  if (!workerUtilsInstance) {
    workerUtilsInstance = await makeWorkerUtils({
      connectionString,
    })

    await workerUtilsInstance.migrate()
  }

  return workerUtilsInstance
}

export async function closeDatabase() {
  if (workerUtilsInstance) {
    await workerUtilsInstance.release()
    workerUtilsInstance = undefined
  }
}