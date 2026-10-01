import pg from "pg"

const { Client } = pg

const connectionString =
    process.env.DATABASE_URL

if (!connectionString) {
    throw new Error(
        "DATABASE_URL is required"
    )
}

const databaseUrl =
    new URL(connectionString)

async function main() {
    const rawJobId =
        process.argv[2]

    if (!rawJobId) {
        throw new Error(
            "Job ID is required. Example: node --env-file=.env dist/inspect-job.js 32"
        )
    }

    const jobId =
        Number(rawJobId)

    if (
        !Number.isInteger(jobId) ||
        jobId <= 0
    ) {
        throw new Error(
            `Invalid job ID: ${rawJobId}`
        )
    }

    const client =
        new Client({
            connectionString,
        })

    try {
        await client.connect()
        const activityResult =
            await client.query(`
        SELECT
            pid,
            application_name,
            client_addr,
            client_port,
            state,
            backend_start,
            query_start,
            wait_event_type,
            wait_event,
            LEFT(query, 200) AS query
        FROM pg_stat_activity
        WHERE datname = current_database()
        ORDER BY backend_start
    `)

        console.log(
            "\n[FORMA BENCHMARK] PostgreSQL active connections"
        )

        console.table(
            activityResult.rows
        )
        console.log(
            "\n[FORMA BENCHMARK] Database"
        )

        console.table([
            {
                host:
                    databaseUrl.hostname,
                port:
                    databaseUrl.port,
                database:
                    databaseUrl.pathname.replace(
                        /^\//,
                        ""
                    ),
                user:
                    databaseUrl.username,
            },
        ])

        const columnsResult =
            await client.query<{
                column_name: string
                data_type: string
            }>(
                `
                SELECT
                    column_name,
                    data_type
                FROM
                    information_schema.columns
                WHERE
                    table_schema = 'graphile_worker'
                    AND table_name = 'jobs'
                ORDER BY
                    ordinal_position
                `
            )

        console.log(
            "\n[FORMA BENCHMARK] graphile_worker.jobs columns"
        )

        console.table(
            columnsResult.rows
        )

        if (
            columnsResult.rows.length ===
            0
        ) {
            throw new Error(
                "graphile_worker.jobs was not found"
            )
        }

        const jobResult =
            await client.query(
                `
                SELECT *
                FROM graphile_worker.jobs
                WHERE id = $1
                `,
                [jobId]
            )

        console.log(
            `\n[FORMA BENCHMARK] Job ${jobId}`
        )

        if (
            jobResult.rows.length ===
            0
        ) {
            console.log(
                "Job not found."
            )

            return
        }

        console.dir(
            jobResult.rows[0],
            {
                depth: null,
                colors: true,
            }
        )
    } finally {
        await client.end()
    }
}

main().catch(
    (error) => {
        console.error(
            "\n[FORMA BENCHMARK] Inspect job failed"
        )

        console.error(error)

        process.exit(1)
    }
)