import { createTrackerRegistry, getTrackerRegistryFromContract } from '../../src/utils/TrackerRegistry'

const contractAddress = '0xBFCF120a8fD17670536f1B27D9737B775b2FD4CF'
const jsonRpcProvider = `http://${process.env.STREAMR_DOCKER_DEV_HOST || 'localhost'}:8545`

describe('TrackerRegistry', () => {
    test('throw exception if address is wrong (ENS)', async (done) => {
        try {
            await getTrackerRegistryFromContract({
                contractAddress: 'address', jsonRpcProvider
            })
        } catch (e) {
            expect(e.toString()).toContain('ENS')
            done()
        }
    })

    test('throw exception if address is wrong', async (done) => {
        try {
            await getTrackerRegistryFromContract({
                contractAddress: '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', jsonRpcProvider
            })
        } catch (e) {
            expect(e.toString()).toContain('Error: call revert exception')
            done()
        }
    })

    test('throw exception if jsonRpcProvider is wrong', async (done) => {
        try {
            await getTrackerRegistryFromContract({
                contractAddress, jsonRpcProvider: 'jsonRpcProvider'
            })
        } catch (e) {
            expect(e.toString()).toContain('Error: could not detect network')
            done()
        }
    })

    describe('getAllTrackers', () => {
        test('get array of trackers', async () => {
            const trackerRegistry = await getTrackerRegistryFromContract({
                contractAddress, jsonRpcProvider
            })

            expect(trackerRegistry.getAllTrackers()).toStrictEqual([
                {
                    id: '0xDE11165537ef6C01260ee89A850a281525A5b63F',
                    http: 'http://10.200.10.1:30301',
                    ws: 'ws://10.200.10.1:30301'
                },
                {
                    id: '0xDE22222da3F861c2Ec63b03e16a1dce153Cf069c',
                    http: 'http://10.200.10.1:30302',
                    ws: 'ws://10.200.10.1:30302'
                },
                {
                    id: '0xDE33390cC85aBf61d9c27715Fa61d8E5efC61e75',
                    http: 'http://10.200.10.1:30303',
                    ws: 'ws://10.200.10.1:30303'
                }
            ])
        })
    })

    describe('getTracker', () => {
        test('throws if stream id is invalid', async () => {
            const trackerRegistry = await getTrackerRegistryFromContract({
                contractAddress, jsonRpcProvider
            })

            // old format
            expect(() => {
                trackerRegistry.getTracker('stream-1::0')
            }).toThrow()

            // stream id is not a string
            expect(() => {
                trackerRegistry.getTracker(1234 as any)
            }).toThrow()

            // partition is not valid
            expect(() => {
                trackerRegistry.getTracker('stream-1', '0' as any)
            }).toThrow()

            expect(() => {
                trackerRegistry.getTracker('stream-1', -23)
            }).toThrow()

            // valid id
            expect(() => {
                trackerRegistry.getTracker('stream-1')
            }).not.toThrow()

            expect(() => {
                trackerRegistry.getTracker('stream-1', 5)
            }).not.toThrow()
        })

        test('get tracker by stream key', async () => {
            const trackerRegistry = await getTrackerRegistryFromContract({
                contractAddress, jsonRpcProvider
            })

            // 1->1, 2->2, 3->3 coincidence
            expect(trackerRegistry.getTracker('stream-1')).toEqual({
                id: '0xDE11165537ef6C01260ee89A850a281525A5b63F',
                http: 'http://10.200.10.1:30301',
                ws: 'ws://10.200.10.1:30301'
            })
            expect(trackerRegistry.getTracker('stream-2')).toEqual({
                id: '0xDE22222da3F861c2Ec63b03e16a1dce153Cf069c',
                http: 'http://10.200.10.1:30302',
                ws: 'ws://10.200.10.1:30302'
            })
            expect(trackerRegistry.getTracker('stream-3')).toEqual({
                id: '0xDE33390cC85aBf61d9c27715Fa61d8E5efC61e75',
                http: 'http://10.200.10.1:30303',
                ws: 'ws://10.200.10.1:30303'
            })
        })
    })

    describe('createTrackerRegistry', () => {
        test('creates tracker registry', () => {
            const trackerRegistry = createTrackerRegistry([{
                id: '',
                http: 'http://10.200.10.1:30301',
                ws: 'ws://10.200.10.1:30301'
            }, {
                id: '',
                http: 'http://10.200.10.1:30302',
                ws: 'ws://10.200.10.1:30302'
            }])

            expect(trackerRegistry.getAllTrackers()).toStrictEqual([
                {
                    id: '',
                    http: 'http://10.200.10.1:30301',
                    ws: 'ws://10.200.10.1:30301'
                },
                {
                    id: '',
                    http: 'http://10.200.10.1:30302',
                    ws: 'ws://10.200.10.1:30302'
                }
            ])
        })
    })
})
