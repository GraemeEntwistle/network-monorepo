export { GroupKey } from './encryption/Encryption'

import { StorageNode } from './StorageNode'
import { StreamrClient } from '../StreamrClient'
import { EthereumAddress } from '../types'
import { BigNumber } from '@ethersproject/bignumber'

// TODO explicit types: e.g. we never provide both streamId and id, or both streamPartition and partition
export type StreamPartDefinitionOptions = {
    streamId?: string,
    streamPartition?: number,
    id?: string,
    partition?: number,
    stream?: StreamrStream|string
}

export type StreamPartDefinition = string | StreamPartDefinitionOptions

export type ValidatedStreamPartDefinition = { streamId: string, streamPartition: number, key: string}

export interface StreamPermission {
    streamId: string
    userAddress: string
    edit: boolean
    canDelete: boolean
    publishExpiration: BigNumber
    subscribeExpiration: BigNumber
    share: boolean
}

export enum StreamOperation {
    // STREAM_GET = 'stream_get',
    STREAM_EDIT = 'edit',
    STREAM_DELETE = 'canDelete',
    STREAM_PUBLISH = 'publishExpiration',
    STREAM_SUBSCRIBE = 'subscribeExpiration',
    STREAM_SHARE = 'share'
}

export class StreamProperties {
    id?: string
    name?: string
    description?: string
    config?: {
        fields: Field[];
    }
    partitions?: number // error if  not number+ >0, 1 default
    storageDays?: number
    inactivityThresholdHours?: number
}

const VALID_FIELD_TYPES = ['number', 'string', 'boolean', 'list', 'map'] as const

export type Field = {
    name: string;
    type: typeof VALID_FIELD_TYPES[number];
}

function getFieldType(value: any): (Field['type'] | undefined) {
    const type = typeof value
    switch (true) {
        case Array.isArray(value): {
            return 'list'
        }
        case type === 'object': {
            return 'map'
        }
        case (VALID_FIELD_TYPES as ReadonlyArray<string>).includes(type): {
            // see https://github.com/microsoft/TypeScript/issues/36275
            return type as Field['type']
        }
        default: {
            return undefined
        }
    }
}

class StreamrStream {
    // @ts-expect-error
    id: string
    // @ts-expect-error
    name: string
    description?: string
    config: {
        fields: Field[];
    } = { fields: [] }
    partitions?: number
    /** @internal */
    _client: StreamrClient
    requireEncryptedData?: boolean
    requireSignedData?: boolean
    storageDays?: number
    inactivityThresholdHours?: number

    constructor(client: StreamrClient, props: StreamProperties) {
        this._client = client
        Object.assign(this, props)
    }

    async update() {
        await this._client.updateStream(this.toObject())
    }

    async delete() {
        await this._client.deleteStream(this.id)
    }

    async publish(content: object, timestamp?: number|string|Date, partitionKey?: string) {
        return this._client.publish(this.id, content, timestamp, partitionKey)
    }

    /** @internal */
    toObject() {
        const result = {}
        Object.keys(this).forEach((key) => {
            if (!key.startsWith('_')) {
                // @ts-expect-error
                result[key] = this[key]
            }
        })
        return result
    }

    async detectFields() {
        // Get last message of the stream to be used for field detecting
        const sub = await this._client.resend({
            stream: this.id,
            resend: {
                last: 1,
            },
        })

        const receivedMsgs = await sub.collect()

        if (!receivedMsgs.length) { return }

        const [lastMessage] = receivedMsgs

        const fields = Object.entries(lastMessage).map(([name, value]) => {
            const type = getFieldType(value)
            return !!type && {
                name,
                type,
            }
        }).filter(Boolean) as Field[] // see https://github.com/microsoft/TypeScript/issues/30621

        // Save field config back to the stream
        this.config.fields = fields
        await this.update()
    }

    async getPermissions() {
        return this._client.getAllPermissionsForStream(this.id)
    }

    async getMyPermissions() {
        return this._client.getPermissionsForUser(this.id, await this._client.getAddress())
    }

    async hasPermission(operation: StreamOperation, userId: EthereumAddress) {
        // eth addresses may be in checksumcase, but userId from server has no case

        // const userIdCaseInsensitive = typeof userId === 'string' ? userId.toLowerCase() : undefined // if not string then undefined
        const permissions = await this._client.getPermissionsForUser(this.id, userId)

        if (operation === StreamOperation.STREAM_PUBLISH || operation === StreamOperation.STREAM_SUBSCRIBE) {
            return permissions[operation].gt(Date.now())
        }
        return permissions[operation]
    }

    async grantPermission(operation: StreamOperation, recipientId: EthereumAddress) {
        await this._client.grantPermission(this.id, operation, recipientId.toLowerCase())
    }

    async grantPublicPermission(operation: StreamOperation) {
        await this._client.grantPublicPermission(this.id, operation)
    }

    async revokePermission(operation: StreamOperation, recipientId: EthereumAddress) {
        await this._client.revokePermission(this.id, operation, recipientId.toLowerCase())
    }

    async revokePublicPermission(operation: StreamOperation) {
        await this._client.revokePublicPermission(this.id, operation)
    }

    async addToStorageNode(node: StorageNode | EthereumAddress) {
        // @ts-ignore
        await this._client.addStreamToStorageNode(this.id, node.address || node)
    }

    async removeFromStorageNode(node: StorageNode | EthereumAddress) {
        // @ts-ignore
        return this._client.removeStreamFromStorageNode(this.id, node.address || node)
    }

    private async isStreamStoredInStorageNode(node: StorageNode | EthereumAddress) {
        // @ts-ignore
        return this._client.isStreamStoredInStorageNode(this.id, node.address || node)
    }

    async getStorageNodes() {
        return this._client.getAllStorageNodes()
    }
}

export {
    StreamrStream as Stream
}
