import { Wallet } from '@ethersproject/wallet'
import { Utils } from 'streamr-client-protocol'
import { EthereumAddress } from '../../src'
import { Stream, StreamOperation, StreamProperties } from '../../src/stream'
import { StorageNode } from '../../src/stream/StorageNode'
import { StreamrClient } from '../../src/StreamrClient'
import { until } from '../../src/utils'
import { uid, fakeAddress } from '../utils'

import config from './config'

jest.setTimeout(100000)

/**
 * These tests should be run in sequential order!
 */
let counter = 0
const getNewProps = () : StreamProperties => {
    counter += 1
    return {
        id: `/path-${Date.now()}-${counter}`
    }
}

function TestStreamEndpoints(getName: () => string) {
    let client: StreamrClient
    let wallet: Wallet
    let createdStreamPath: string
    let createdStream: Stream

    const createClient = (opts = {}) => new StreamrClient({
        ...config.clientOptions,
        autoConnect: false,
        autoDisconnect: false,
        ...opts,
    } as any)

    beforeAll(() => {
        const key = config.clientOptions.auth.privateKey
        wallet = new Wallet(key)
        client = createClient({})
    })

    beforeAll(async () => {
        createdStreamPath = `/StreamEndpoints-${Date.now()}`
        createdStream = await client.createStream({
            id: `${wallet.address.toLowerCase()}${createdStreamPath}`,
            name: getName()
        })
    })

    describe('createStream', () => {
        it('creates a stream with correct values', async () => {
            const name = getName()
            const newProps = getNewProps()
            const stream = await client.createStream({
                ...newProps,
                name
            })
            expect(stream.id).toBeTruthy()
            return expect(stream.name).toBe(name)
        })

        it('valid id', async () => {
            const newId = `${wallet.address.toLowerCase()}/StreamEndpoints-createStream-newId-${Date.now()}`
            const newStream = await client.createStream({
                id: newId,
            })
            return expect(newStream.id).toEqual(newId)
        })

        it('valid path', async () => {
            const newPath = `/StreamEndpoints-createStream-newPath-${Date.now()}`
            const newStream = await client.createStream({
                id: newPath,
            })
            return expect(newStream.id).toEqual(`${wallet.address.toLowerCase()}${newPath}`)
        })

        it('invalid id', () => {
            return expect(() => client.createStream({ id: 'invalid.eth/foobar' })).rejects.toThrow()
        })
    })

    describe('getStream', () => {
        it('get an existing Stream', async () => {
            const stream = await client.createStream(getNewProps())
            const existingStream = await client.getStream(stream.id)
            return expect(existingStream.id).toEqual(stream.id)
        })

        it('get a non-existing Stream', async () => {
            const id = `${wallet.address.toLowerCase()}/StreamEndpoints-nonexisting-${Date.now()}`
            return expect(() => client.getStream(id)).rejects.toThrow()
        })
    })

    describe('getStreamByName', () => {
        it('get an existing Stream', async () => {
            const props = getNewProps()
            props.name = 'name-' + Date.now()
            const stream = await client.createStream(props)
            // await new Promise((resolve) => setTimeout(resolve, 5000))
            const id = (await client.getAddress()).toLowerCase() + props.id
            await until(async () => {
                try {
                    return (await client.getStream(id)).id === id
                } catch (err) {
                    return false
                }
            }, 100000, 1000)
            const existingStream = await client.getStreamByName(stream.name)
            return expect(existingStream.id).toEqual(stream.id)
        })

        it('get a non-existing Stream', async () => {
            const name = `${wallet.address.toLowerCase()}/StreamEndpoints-nonexisting-${Date.now()}`
            return expect(() => client.getStreamByName(name)).rejects.toThrow()
        })
    })

    describe('liststreams with search and filters', () => {
        it('get streamlist', async () => {
            // create n streams to test offset and max
            const name = 'filter-' + Date.now()
            for (let i = 0; i < 3; i++) {
                const props = getNewProps()
                props.name = name + i
                // eslint-disable-next-line no-await-in-loop
                await client.createStream(props)
            }
            await until(async () => { return (await client.listStreams({ name })).length === 3 }, 10000, 1000)
            let resultList = await client.listStreams({
                name
            })
            expect(resultList.length).toBe(3)
            resultList = await client.listStreams({
                name,
                max: 2,
            })
            expect(resultList.length).toBe(2)
            expect(resultList[0].name.endsWith('0')).toBe(true)
            expect(resultList[1].name.endsWith('1')).toBe(true)
            resultList = await client.listStreams({
                name,
                max: 2,
                offset: 1
            })
            expect(resultList[0].name.endsWith('1')).toBe(true)
            return expect(resultList[1].name.endsWith('2')).toBe(true)
        })

        it('get a non-existing Stream', async () => {
            const name = `${wallet.address.toLowerCase()}/StreamEndpoints-nonexisting-${Date.now()}`
            return expect(() => client.getStreamByName(name)).rejects.toThrow()
        })
    })

    describe('getOrCreate', () => {
        it('existing Stream by name', async () => {
            const existingStream = await client.getOrCreateStream({
                name: createdStream.name,
            })
            expect(existingStream.id).toBe(createdStream.id)
            return expect(existingStream.name).toBe(createdStream.name)
        })

        it('existing Stream by id', async () => {
            const existingStream = await client.getOrCreateStream({
                id: createdStream.id,
            })
            expect(existingStream.id).toBe(createdStream.id)
            return expect(existingStream.name).toBe(createdStream.name)
        })

        it('new Stream by name', async () => {
            const newName = uid('stream')
            const props = getNewProps()
            props.name = newName
            const newStream = await client.getOrCreateStream(props)
            return expect(newStream.name).toEqual(newName)
        })

        it('new Stream by id', async () => {
            const newId = `${wallet.address.toLowerCase()}/StreamEndpoints-getOrCreate-newId-${Date.now()}`
            const newStream = await client.getOrCreateStream({
                id: newId,
            })
            return expect(newStream.id).toEqual(newId)
        })

        it('new Stream by path', async () => {
            const newPath = `/StreamEndpoints-getOrCreate-newPath-${Date.now()}`
            const newStream = await client.getOrCreateStream({
                id: newPath,
            })
            return expect(newStream.id).toEqual(`${wallet.address.toLowerCase()}${newPath}`)
        })

        it('fails if stream prefixed with other users address', async () => {
            // can't create streams for other users
            const otherAddress = `0x${fakeAddress()}`
            const newPath = `/StreamEndpoints-getOrCreate-newPath-${Date.now()}`
            // backend should error
            await expect(async () => {
                await client.getOrCreateStream({
                    id: `${otherAddress}${newPath}`,
                })
            }).rejects.toThrow('Validation')
        })
    })

    describe('listStreams', () => {
        it('filters by given criteria (match)', async () => {
            const result = await client.listStreams({
                name: createdStream.name,
            })
            expect(result.length).toBe(1)
            return expect(result[0].id).toBe(createdStream.id)
        })

        it('filters by given criteria (no  match)', async () => {
            const result = await client.listStreams({
                name: `non-existent-${Date.now()}`,
            })
            return expect(result.length).toBe(0)
        })
    })

    describe('getStreamLast', () => {
        it('does not error', async () => {
            const result = await client.getStreamLast(createdStream.id)
            return expect(result).toEqual([])
        })
    })

    describe('getStreamPublishers', () => {
        it('retrieves a list of publishers', async () => {
            const publishers = await client.getStreamPublishers(createdStream.id)
            const address = await client.getUserId()
            return expect(publishers).toEqual([address])
        })
    })

    describe('isStreamPublisher', () => {
        it('returns true for valid publishers', async () => {
            const address = await client.getUserId()
            const valid = await client.isStreamPublisher(createdStream.id, address)
            return expect(valid).toBeTruthy()
        })
        it('returns false for invalid publishers', async () => {
            const valid = await client.isStreamPublisher(createdStream.id, 'some-wrong-address')
            return expect(!valid).toBeTruthy()
        })
    })

    describe('getStreamSubscribers', () => {
        it('retrieves a list of publishers', async () => {
            const subscribers = await client.getStreamSubscribers(createdStream.id)
            const address = await client.getUserId()
            return expect(subscribers).toEqual([address])
        })
    })

    describe('isStreamSubscriber', () => {
        it('returns true for valid subscribers', async () => {
            const address = await client.getUserId()
            const valid = await client.isStreamSubscriber(createdStream.id, address)
            return expect(valid).toBeTruthy()
        })
        it('returns false for invalid subscribers', async () => {
            const valid = await client.isStreamSubscriber(createdStream.id, 'some-wrong-address')
            return expect(!valid).toBeTruthy()
        })
    })

    describe('Stream.update', () => {
        it('can change stream name', async () => {
            createdStream.name = 'New name'
            await createdStream.update()
            const stream = await client.getStream(createdStream.id)
            return expect(stream.name).toEqual(createdStream.name)
        })
    })

    describe('Stream permissions', () => {
        it('Stream.getPermissions', async () => {
            const permissions = await createdStream.getPermissions()
            return expect(permissions.length).toBe(1)
        })

        it('Stream.hasPermission', async () => {
            return expect(await createdStream.hasPermission(StreamOperation.STREAM_SHARE, wallet.address.toLowerCase())).toEqual(true)
        })

        it('Stream.grantPermission', async () => {
            const recipient: EthereumAddress = fakeAddress()
            await createdStream.grantPermission(StreamOperation.STREAM_SUBSCRIBE, recipient) // public read
            return expect(await createdStream.hasPermission(StreamOperation.STREAM_SUBSCRIBE, recipient)).toEqual(true)
        })

        it('Stream.revokePermission', async () => {
            const recipient: EthereumAddress = fakeAddress()
            await createdStream.revokePermission(StreamOperation.STREAM_SUBSCRIBE, recipient)
            return expect(!(await createdStream.hasPermission(StreamOperation.STREAM_SUBSCRIBE, recipient))).toEqual(true)
        })

        it('Stream.grantPublicPermission', async () => {
            const recipient: EthereumAddress = fakeAddress()
            await createdStream.grantPublicPermission(StreamOperation.STREAM_SUBSCRIBE)
            return expect(await createdStream.hasPermission(StreamOperation.STREAM_SUBSCRIBE, recipient)).toEqual(true)
        })

        it('Stream.revokePublicPermission', async () => {
            const recipient: EthereumAddress = fakeAddress()
            await createdStream.revokePublicPermission(StreamOperation.STREAM_SUBSCRIBE)
            return expect(!(await createdStream.hasPermission(StreamOperation.STREAM_SUBSCRIBE, recipient))).toEqual(true)
        })
    })

    describe('Stream deletion', () => {
        it('Stream.delete', async () => {
            await createdStream.delete()
            return expect(() => client.getStream(createdStream.id)).rejects.toThrow()
        })
    })

    describe('Storage node assignment', () => {
        it('add', async () => {
            const storageNode = StorageNode.STREAMR_DOCKER_DEV
            const stream = await client.createStream()
            await stream.addToStorageNode(storageNode)
            const storageNodes = await stream.getStorageNodes()
            expect(storageNodes.length).toBe(1)
            expect(storageNodes[0].getAddress()).toBe(storageNode.getAddress())
            const storedStreamParts = await client.getStreamPartsByStorageNode(storageNode)
            expect(storedStreamParts.some(
                (sp) => (sp.getStreamId() === stream.id) && (sp.getStreamPartition() === 0)
            )).toBeTruthy()
        })

        it('remove', async () => {
            const storageNode = StorageNode.STREAMR_DOCKER_DEV
            const stream = await client.createStream()
            await stream.addToStorageNode(storageNode)
            await stream.removeFromStorageNode(storageNode)
            const storageNodes = await stream.getStorageNodes()
            expect(storageNodes).toHaveLength(0)
            const storedStreamParts = await client.getStreamPartsByStorageNode(storageNode)
            expect(storedStreamParts.some(
                (sp) => (sp.getStreamId() === stream.id)
            )).toBeFalsy()
        })
    })
}

describe('StreamEndpoints', () => {
    describe('using normal name', () => {
        TestStreamEndpoints(() => uid('test-stream'))
    })

    describe('using name with slashes', () => {
        TestStreamEndpoints(() => uid('test-stream/slashes'))
    })
})
