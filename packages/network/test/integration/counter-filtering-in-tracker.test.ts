import { Status } from '../../src/identifiers'
import { runAndWaitForEvents, wait } from 'streamr-test-utils'

import { PeerInfo } from '../../src/connection/PeerInfo'
import { startTracker, Tracker } from '../../src/composition'
import { TrackerNode, Event as TrackerNodeEvent } from '../../src/protocol/TrackerNode'
import { Event as TrackerServerEvent } from '../../src/protocol/TrackerServer'
import { getTopology } from '../../src/logic/trackerSummaryUtils'
import NodeClientWsEndpoint from '../../src/connection/ws/NodeClientWsEndpoint'

const WAIT_TIME = 200

const formStatus = (counter1: number, counter2: number, nodes1: string[], nodes2: string[], singleStream: boolean): Partial<Status> => ({
    streams: {
        'stream-1::0': {
            inboundNodes: nodes1,
            outboundNodes: nodes1,
            counter: counter1,
        },
        'stream-2::0': {
            inboundNodes: nodes2,
            outboundNodes: nodes2,
            counter: counter2
        }
    },
    singleStream
})

describe('tracker: counter filtering', () => {
    let tracker: Tracker
    let trackerNode1: TrackerNode
    let trackerNode2: TrackerNode

    beforeEach(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: 30420,
            id: 'tracker'
        })
        const peerInfo1 = PeerInfo.newNode('trackerNode1')
        const peerInfo2 = PeerInfo.newNode('trackerNode2')
        const trackerPeerInfo = PeerInfo.newTracker('tracker')
        const wsClient1 = new NodeClientWsEndpoint(peerInfo1)
        const wsClient2 = new NodeClientWsEndpoint(peerInfo2)
        trackerNode1 = new TrackerNode(wsClient1)
        trackerNode2 = new TrackerNode(wsClient2)

        await runAndWaitForEvents([
            () => { trackerNode1.connectToTracker(tracker.getUrl(), trackerPeerInfo) },
            () => { trackerNode2.connectToTracker(tracker.getUrl(), trackerPeerInfo) }], [
            [trackerNode1, TrackerNodeEvent.CONNECTED_TO_TRACKER],
            [trackerNode2, TrackerNodeEvent.CONNECTED_TO_TRACKER]
        ])

        await runAndWaitForEvents([
            () => {  trackerNode1.sendStatus('tracker', formStatus(0, 0, [], [], false) as Status) },
            () => { trackerNode2.sendStatus('tracker', formStatus(0, 0, [], [], false) as Status) }], [
            [trackerNode1, TrackerNodeEvent.TRACKER_INSTRUCTION_RECEIVED],
            [trackerNode2, TrackerNodeEvent.TRACKER_INSTRUCTION_RECEIVED]
        ])
    })

    afterEach(async () => {
        await trackerNode1.stop()
        await trackerNode2.stop()
        await tracker.stop()
    })

    test('handles status messages with counters equal or more to current counter(s)', async () => {
        let numOfInstructions = 0
        trackerNode1.on(TrackerNodeEvent.TRACKER_INSTRUCTION_RECEIVED, () => {
            numOfInstructions += 1
        })

        trackerNode1.sendStatus('tracker', formStatus(1, 666, [], [], false) as Status)
            .catch(() => {})

        await wait(WAIT_TIME)
        expect(numOfInstructions).toEqual(2)
    })

    test('ignores status messages with counters less than current counter(s)', async () => {
        let numOfInstructions = 0
        trackerNode1.on(TrackerNodeEvent.TRACKER_INSTRUCTION_RECEIVED, () => {
            numOfInstructions += 1
        })

        trackerNode1.sendStatus('tracker', formStatus(0, 0, [], [], false) as Status)
            .catch(() => {})

        await wait(WAIT_TIME)
        expect(numOfInstructions).toEqual(0)
    })

    test('partly handles status messages with mixed counters compared to current counters', async () => {
        let numOfInstructions = 0
        trackerNode1.on(TrackerNodeEvent.TRACKER_INSTRUCTION_RECEIVED, () => {
            numOfInstructions += 1
        })

        trackerNode1.sendStatus('tracker', formStatus(1, 0, [], [], false) as Status)
            .catch(() => {})

        await wait(WAIT_TIME)
        expect(numOfInstructions).toEqual(1)
    })

    test('NET-36: tracker receiving status with old counter should not affect topology', async () => {
        const topologyBefore = getTopology(tracker.getOverlayPerStream(), tracker.getOverlayConnectionRtts())

        await runAndWaitForEvents(
            () => { trackerNode1.sendStatus('tracker', formStatus(0, 0, [], [], false) as Status) },
            // @ts-expect-error trackerServer is private
            [tracker.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED]
        )

        expect(getTopology(tracker.getOverlayPerStream(), tracker.getOverlayConnectionRtts())).toEqual(topologyBefore)
    })

    test('NET-36: tracker receiving status with partial old counter should not affect topology', async () => {
        const topologyBefore = getTopology(tracker.getOverlayPerStream(), tracker.getOverlayConnectionRtts())

        await runAndWaitForEvents(
            () => {
                trackerNode1.sendStatus('tracker', formStatus(1, 0, [], [], false) as Status)
            },
            // @ts-expect-error trackerServer is private
            [tracker.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED]
        )
        expect(getTopology(tracker.getOverlayPerStream(), tracker.getOverlayConnectionRtts())).toEqual(topologyBefore)
    })
})
