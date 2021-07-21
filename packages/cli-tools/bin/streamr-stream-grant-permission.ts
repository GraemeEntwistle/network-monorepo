#!/usr/bin/env node
import { Command } from 'commander'
import {
    envOptions,
    authOptions,
    formStreamrOptionsWithEnv,
    getStreamId
} from './common'
import pkg from '../package.json'
import { StreamOperation, StreamrClient, StreamPermission } from 'streamr-client'
import EasyTable from 'easy-table'

const PUBLIC_PERMISSION_ID = 'public'
const OPERATION_PREFIX = 'stream_'

const getOperation = (id: string) => {
    // we support both short ids (e.g. "publish"), and long ids (e.g. "stream_publish")
    // the actual StreamOperation constant is the long id string
    // backend does the validation of invalid constants
    if (!id.startsWith(OPERATION_PREFIX)) {
        return (OPERATION_PREFIX + id) as StreamOperation
    } else {
        return id as StreamOperation
    }
}

const getShortOperationId = (operation: StreamOperation) => {
    const longOperationId = operation as string
    if (longOperationId.startsWith(OPERATION_PREFIX)) {
        return longOperationId.substring(OPERATION_PREFIX.length)
    } else {
        throw new Error(`Assertion failed: unknown prefix for in ${longOperationId}`)
    }
}

const getTarget = (user: string): string|undefined => {
    if (user === PUBLIC_PERMISSION_ID) {
        return undefined
    } else {
        return user
    }
}

const program = new Command()
program
    .arguments('<streamId> <user> <operations...>')
    .description('grant permission: use keyword "public" as a user to grant a public permission')
authOptions(program)
envOptions(program)
    .version(pkg.version)
    .action(async (streamIdOrPath: string, user: string, operationIds: string[], options: any) => {
        const operations = operationIds.map((o: string) => getOperation(o))
        const target = getTarget(user)
        const client = new StreamrClient(formStreamrOptionsWithEnv(options))
        const streamId = getStreamId(streamIdOrPath, options)!
        const stream = await client.getStream(streamId)
        let tasks
        if (target) {
            tasks = operations.map((operation: StreamOperation) => stream.grantPermission(operation, target))
        } else {
            tasks = operations.map((operation: StreamOperation) => stream.grantPublicPermission(operation))
        }
        const permissions = await Promise.all(tasks)
        console.info(EasyTable.print(permissions))
    })
    .parseAsync(process.argv)
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })