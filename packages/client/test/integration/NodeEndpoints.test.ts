import { Wallet } from '@ethersproject/wallet'
import debug from 'debug'
import { EthereumAddress } from '../../src'
import { Stream, StreamOperation } from '../../src/stream'
import { StorageNode } from '../../src/stream/StorageNode'
import { StreamrClient } from '../../src/StreamrClient'
import { until } from '../../src/utils'
import { uid, fakeAddress, getNewProps, createTestStream } from '../utils'
// import { id } from '@ethersproject/hash'

import config from './config'

jest.setTimeout(100000)
const log = debug('StreamrClient::NodeEndpointsIntegrationTest')

/**
 * These tests should be run in sequential order!
 */

let client: StreamrClient
let wallet: Wallet
// let createdStream: Stream
// let createdNode: StorageNode
const nodeAddress: EthereumAddress = fakeAddress()
const nodeUrl = 'http://a.a'

const createClient = (opts = {}) => new StreamrClient({
    ...config,
    autoConnect: false,
    autoDisconnect: false,
    ...opts,
} as any)

beforeAll(() => {
    const key = config.auth.privateKey
    // const hash = id(`marketplace-contracts${1}`)
    // return new Wallet(hash, provider)
    wallet = new Wallet(key)
    client = createClient({ auth: {
        privateKey: key
    } })
})

// beforeAll(async () => {
//     createdNode = await create(client, module, {
//         name: getName()
//     })
//     return until(async () => {
//         try {
//             return client.streamExists(createdStream.id)
//         } catch (err) {
//             log('stream not found yet %o', err)
//             return false
//         }
//     }, 100000, 1000)
// })

describe('createNode', () => {
    it('creates a node ', async () => {
        const newNode: StorageNode = await client.setNode(nodeAddress, nodeUrl)
        await until(async () => {
            try {
                const addr = await client.getAddress()
                const node = await client.getNode(addr)
                return typeof node !== 'undefined'
            } catch (err) {
                log('node not found yet %o', err)
                return false
            }
        }, 100000, 1000)
        expect(newNode.address).toEqual(nodeAddress)
        return expect(newNode.url).toEqual(nodeUrl)
    })
})

// describe('Storage node assignment', () => {
//     it('add', async () => {
//         const storageNode = StorageNode.STREAMR_DOCKER_DEV
//         const stream = await client.createStream()
//         await stream.addToStorageNode(storageNode)
//         const storageNodes = await stream.getStorageNodes()
//         expect(storageNodes.length).toBe(1)
//         expect(storageNodes[0].getAddress()).toBe(storageNode.getAddress())
//         const storedStreamParts = await client.getStreamPartsByStorageNode(storageNode)
//         expect(storedStreamParts.some(
//             (sp) => (sp.getStreamId() === stream.id) && (sp.getStreamPartition() === 0)
//         )).toBeTruthy()
//     })

//     it('remove', async () => {
//         const storageNode = StorageNode.STREAMR_DOCKER_DEV
//         const stream = await client.createStream()
//         await stream.addToStorageNode(storageNode)
//         await stream.removeFromStorageNode(storageNode)
//         const storageNodes = await stream.getStorageNodes()
//         expect(storageNodes).toHaveLength(0)
//         const storedStreamParts = await client.getStreamPartsByStorageNode(storageNode)
//         expect(storedStreamParts.some(
//             (sp) => (sp.getStreamId() === stream.id)
//         )).toBeFalsy()
//     })
// })
