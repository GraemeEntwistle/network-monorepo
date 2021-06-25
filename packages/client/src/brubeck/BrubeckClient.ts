import { NetworkNode, NetworkNodeOptions, startNetworkNode } from 'streamr-network'
import { StreamrClientOptions } from '../Config'
import { pOnce, uuid, counterId } from '../utils'
import { StreamrClient } from '../StreamrClient'
import Publisher from './Publisher'
import Subscriber from './Subscriber'
import Debug from 'debug'
import { Context } from './Context'

const uid = process.pid != null ? process.pid : `${uuid().slice(-4)}${uuid().slice(0, 4)}`

type BrubeckClientOptions = StreamrClientOptions & {
    network?: Partial<NetworkNodeOptions>
}

export class BrubeckClient implements Context {
    publisher: Publisher
    subscriber: Subscriber
    client: StreamrClient
    options: BrubeckClientOptions
    private node?: NetworkNode
    id
    debug

    constructor(options: BrubeckClientOptions) {
        this.client = new StreamrClient(options)
        this.options = options
        this.id = counterId(`${this.constructor.name}:${uid}${options.id || ''}`)
        this.debug = Debug(`Streamr::${this.id}`)
        this.publisher = new Publisher(this)
        this.subscriber = new Subscriber(this)
    }

    connect = pOnce(async () => {
        const node = await startNetworkNode({
            host: '127.0.0.1',
            port: 33313,
            trackers: [
                'ws://127.0.0.1:30301',
                'ws://127.0.0.1:30302',
                'ws://127.0.0.1:30303'
            ],
            disconnectionWaitTime: 200,
            ...this.options.network,
            id: this.id,
            name: this.id,
        })
        node.start()
        this.node = node
        return this.node
    })

    async getUserId() {
        return this.client.getUserId()
    }

    async getSessionToken() {
        return this.client.session.getSessionToken()
    }

    async disconnect() {
        const node = await this.getNode()
        return node.stop()
    }

    async getNode(): Promise<NetworkNode> {
        const node = await this.connect()
        if (!node) { throw new Error('no node') }
        return node
    }

    async publish(...args: Parameters<Publisher['publish']>): ReturnType<Publisher['publish']> {
        return this.publisher.publish(...args)
    }

    async subscribe(...args: Parameters<Subscriber['subscribe']>): ReturnType<Subscriber['subscribe']> {
        return this.subscriber.subscribe(...args)
    }

    async unsubscribe(...args: Parameters<Subscriber['unsubscribe']>): ReturnType<Subscriber['unsubscribe']> {
        return this.subscriber.unsubscribe(...args)
    }
}
