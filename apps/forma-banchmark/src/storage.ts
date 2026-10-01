import {
    GetObjectCommand,
    PutObjectCommand,
    S3Client,
} from "@aws-sdk/client-s3"

import { createReadStream, createWriteStream } from "node:fs"
import { mkdir, stat } from "node:fs/promises"
import { dirname } from "node:path"
import { pipeline } from "node:stream/promises"

type StorageConfig = {
    endpoint: string
    accessKeyId: string
    secretAccessKey: string
    bucket: string
    region: string
}

let client: S3Client | undefined

function getConfig(): StorageConfig {
    const endpoint = process.env.R2_ENDPOINT
    const accessKeyId =
        process.env.R2_ACCESS_KEY_ID
    const secretAccessKey =
        process.env.R2_SECRET_ACCESS_KEY
    const bucket = process.env.R2_BUCKET
    const region =
        process.env.R2_REGION || "auto"

    if (!endpoint) {
        throw new Error(
            "R2_ENDPOINT is required"
        )
    }

    if (!accessKeyId) {
        throw new Error(
            "R2_ACCESS_KEY_ID is required"
        )
    }

    if (!secretAccessKey) {
        throw new Error(
            "R2_SECRET_ACCESS_KEY is required"
        )
    }

    if (!bucket) {
        throw new Error(
            "R2_BUCKET is required"
        )
    }

    return {
        endpoint,
        accessKeyId,
        secretAccessKey,
        bucket,
        region,
    }
}

function getClient() {
    if (client) {
        return client
    }

    const config = getConfig()

    client = new S3Client({
        region: config.region,
        endpoint: config.endpoint,
        credentials: {
            accessKeyId:
                config.accessKeyId,
            secretAccessKey:
                config.secretAccessKey,
        },
    })

    return client
}

export async function downloadObjectToFile(
    objectKey: string,
    destinationPath: string
) {
    const config = getConfig()

    await mkdir(
        dirname(destinationPath),
        {
            recursive: true,
        }
    )

    const response =
        await getClient().send(
            new GetObjectCommand({
                Bucket: config.bucket,
                Key: objectKey,
            })
        )

    if (!response.Body) {
        throw new Error(
            `R2 object has no body: ${objectKey}`
        )
    }

    await pipeline(
        response.Body as NodeJS.ReadableStream,
        createWriteStream(destinationPath)
    )
}

export async function uploadFile(
    sourcePath: string,
    objectKey: string,
    contentType: string
) {
    const config = getConfig()

    const file = await stat(sourcePath)

    await getClient().send(
        new PutObjectCommand({
            Bucket: config.bucket,
            Key: objectKey,
            Body: createReadStream(
                sourcePath
            ),
            ContentLength: file.size,
            ContentType: contentType,
        })
    )
}