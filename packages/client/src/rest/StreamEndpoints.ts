import { Agent as HttpAgent } from 'http'
import { Agent as HttpsAgent } from 'https'

import qs from 'qs'

import { getEndpointUrl } from '../utils'
import { Debug } from '../utils/log'
import { validateOptions } from '../stream/utils'
import { Stream, StreamOperation } from '../stream'
import { StreamPart } from '../stream/StreamPart'

import authFetch, { ErrorCode, NotFoundError } from './authFetch'
import { EthereumAddress } from '../types'
import { StreamrClient } from '../StreamrClient'
// TODO change this import when streamr-client-protocol exports StreamMessage type or the enums types directly
import { ContentType, EncryptionType, SignatureType, StreamMessageType } from 'streamr-client-protocol/dist/src/protocol/message_layer/StreamMessage'
import { StorageNode } from '../stream/StorageNode'

const debug = Debug('StreamEndpoints')

export interface StreamListQuery {
    name?: string
    uiChannel?: boolean
    noConfig?: boolean
    search?: string
    sortBy?: string
    order?: 'asc'|'desc'
    max?: number
    offset?: number
    grantedAccess?: boolean
    publicAccess?: boolean
    operation?: StreamOperation
}

export interface StreamMessageAsObject { // TODO this could be in streamr-protocol
    streamId: string
    streamPartition: number
    timestamp: number
    sequenceNumber: number
    publisherId: string
    msgChainId: string
    messageType: StreamMessageType
    contentType: ContentType
    encryptionType: EncryptionType
    groupKeyId: string|null
    content: any
    signatureType: SignatureType
    signature: string|null
}

const agentSettings = {
    keepAlive: true,
    keepAliveMsecs: 5000,
}

const agentByProtocol = {
    http: new HttpAgent(agentSettings),
    https: new HttpsAgent(agentSettings),
}

function getKeepAliveAgentForUrl(url: string) {
    if (url.startsWith('https')) {
        return agentByProtocol.https
    }

    if (url.startsWith('http')) {
        return agentByProtocol.http
    }

    throw new Error(`Unknown protocol in URL: ${url}`)
}

/** TODO the class should be annotated with at-internal, but adding the annotation hides the methods */
export class StreamEndpoints {

    /** @internal */
    readonly client: StreamrClient

    constructor(client: StreamrClient) {
        this.client = client
    }

    async getStreamByName(name: string) {
        this.client.debug('getStreamByName %o', {
            name,
        })
        const json = await this.client.listStreams({
            name,
            // @ts-expect-error
            public: false,
        })
        return json[0] ? new Stream(this.client, json[0]) : Promise.reject(new NotFoundError('Stream: name=' + name))
    }

    /**
     * @category Important
     */
    async getOrCreateStream(props: { id?: string, name?: string }) {
        this.client.debug('getOrCreateStream %o', {
            props,
        })
        // Try looking up the stream by id or name, whichever is defined
        try {
            if (props.id) {
                const stream = await this.client.getStream(props.id)
                return stream
            }

            if (props.name) {
                const stream = await this.getStreamByName(props.name)
                return stream
            }
        } catch (err: any) {
            if (err.errorCode !== ErrorCode.NOT_FOUND) {
                throw err
            }
        }

        const stream = await this.client.createStream(props)
        debug('Created stream: %s (%s)', props.name, stream.id)
        return stream
    }

    async getStreamLast(streamObjectOrId: Stream|string): Promise<StreamMessageAsObject> {
        const { streamId, streamPartition = 0, count = 1 } = validateOptions(streamObjectOrId)
        this.client.debug('getStreamLast %o', {
            streamId,
            streamPartition,
            count,
        })

        const url = (
            // @ts-expect-error
            getEndpointUrl(this.client.options.restUrl, 'streams', streamId, 'data', 'partitions', streamPartition, 'last')
            + `?${qs.stringify({ count })}`
        )

        const json = await authFetch<StreamMessageAsObject>(url, this.client.session)
        return json
    }

    async getStreamPartsByStorageNode(node: StorageNode|EthereumAddress) {
        const address = (node instanceof StorageNode) ? node.getAddress() : node
        type ItemType = { id: string, partitions: number}
        const json = await authFetch<ItemType[]>(getEndpointUrl(this.client.options.restUrl, 'storageNodes', address, 'streams'), this.client.session)
        let result: StreamPart[] = []
        json.forEach((stream: ItemType) => {
            result = result.concat(StreamPart.fromStream(stream))
        })
        return result
    }

    async publishHttp(streamObjectOrId: Stream|string, data: any, requestOptions: any = {}, keepAlive: boolean = true) {
        let streamId
        if (streamObjectOrId instanceof Stream) {
            streamId = streamObjectOrId.id
        } else {
            streamId = streamObjectOrId
        }
        this.client.debug('publishHttp %o', {
            streamId, data,
        })

        // Send data to the stream
        await authFetch(
            getEndpointUrl(this.client.options.restUrl, 'streams', streamId, 'data'),
            this.client.session,
            {
                ...requestOptions,
                method: 'POST',
                body: JSON.stringify(data),
                agent: keepAlive ? getKeepAliveAgentForUrl(this.client.options.restUrl!) : undefined,
            },
        )
    }
}
