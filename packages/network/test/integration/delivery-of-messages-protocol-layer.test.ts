import { MessageLayer, ControlLayer, TrackerLayer } from 'streamr-client-protocol'
import { waitForEvent } from 'streamr-test-utils'

import { StreamIdAndPartition } from '../../src/identifiers'
import { NodeToNode, Event as NodeToNodeEvent } from '../../src/protocol/NodeToNode'
import { TrackerNode, Event as TrackerNodeEvent } from '../../src/protocol/TrackerNode'
import { TrackerServer, Event as TrackerServerEvent } from '../../src/protocol/TrackerServer'
import { PeerInfo } from '../../src/connection/PeerInfo'
import { RtcSignaller } from "../../src/logic/RtcSignaller"
import { NegotiatedProtocolVersions } from "../../src/connection/NegotiatedProtocolVersions"
import { MetricsContext } from "../../src/helpers/MetricsContext"
import { startTracker, Tracker } from "../../src/composition"
import { WebRtcEndpoint } from '../../src/connection/WebRtcEndpoint'
import NodeWebRtcConnectionFactory from "../../src/connection/NodeWebRtcConnection"
import NodeClientWsEndpoint from '../../src/connection/ws/NodeClientWsEndpoint'
import { startServerWsEndpoint } from '../utils'

const { StreamMessage, MessageID, MessageRef } = MessageLayer

const UUID_REGEX = /[0-9a-f]{8}\b-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-\b[0-9a-f]{12}/

describe('delivery of messages in protocol layer', () => {
    let nodeToNode1: NodeToNode
    let nodeToNode2: NodeToNode
    let trackerNode: TrackerNode
    let trackerNode2: TrackerNode
    let trackerServer: TrackerServer
    let tracker: Tracker
    beforeAll(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: 28515,
            id: 'tracker'
        })
        const peerInfo1 = PeerInfo.newNode('node1')
        const peerInfo2 = PeerInfo.newNode('node2')
        const trackerPeerInfo = PeerInfo.newTracker('tracker')
        const trackerServerPeerInfo = PeerInfo.newTracker('trackerServer')
        const wsEndpoint1 = new NodeClientWsEndpoint(peerInfo1)
        const wsEndpoint2 = new NodeClientWsEndpoint(peerInfo2)
        const wsEndpoint3 = await startServerWsEndpoint('127.0.0.1', 28516, PeerInfo.newTracker('trackerServer'))
        trackerNode = new TrackerNode(wsEndpoint1)
        trackerNode2 = new TrackerNode(wsEndpoint2)

        const wrtcEndpoint1 = new WebRtcEndpoint(
            peerInfo1,
            [],
            new RtcSignaller(peerInfo1, trackerNode),
            new MetricsContext('node1'),
            new NegotiatedProtocolVersions(peerInfo1),
            NodeWebRtcConnectionFactory
        )
        const wrtcEndpoint2 =  new WebRtcEndpoint(
            peerInfo2,
            [],
            new RtcSignaller(peerInfo2, trackerNode2),
            new MetricsContext('node2'),
            new NegotiatedProtocolVersions(peerInfo2),
            NodeWebRtcConnectionFactory
        )

        // @ts-expect-error: private field
        wrtcEndpoint1.rtcSignaller.setConnectListener(() => null)
        // @ts-expect-error: private field
        wrtcEndpoint2.rtcSignaller.setConnectListener(() => null)

        nodeToNode1 = new NodeToNode(wrtcEndpoint1)
        nodeToNode2 = new NodeToNode(wrtcEndpoint2)

        trackerServer = new TrackerServer(wsEndpoint3)

        // Connect trackerNode <-> trackerServer
        await trackerNode.connectToTracker(trackerServer.getUrl(), trackerServerPeerInfo)
        await trackerNode2.connectToTracker(trackerServer.getUrl(), trackerServerPeerInfo)

        // Connect trackerNode <-> Tracker
        await trackerNode.connectToTracker(tracker.getUrl(), trackerPeerInfo)
        await trackerNode2.connectToTracker(tracker.getUrl(), trackerPeerInfo)

        // Connect nodeToNode1 <-> nodeToNode2
        await Promise.all([
            nodeToNode1.connectToNode('node2', 'tracker'),
            waitForEvent(nodeToNode2, NodeToNodeEvent.NODE_CONNECTED),
            waitForEvent(nodeToNode1, NodeToNodeEvent.NODE_CONNECTED)
        ])
    }, 60000)

    afterAll(() => {
        return Promise.all([
            nodeToNode2.stop(),
            nodeToNode1.stop(),
            trackerNode.stop(),
            trackerNode2.stop(),
            trackerServer.stop(),
            tracker.stop()
        ])
    })

    it('sendData is delivered', async () => {
        const streamMessage = new StreamMessage({
            messageId: new MessageID('stream', 10, 666, 0, 'publisherId', 'msgChainId'),
            prevMsgRef: new MessageRef(665, 0),
            content: {
                hello: 'world'
            },
            messageType: StreamMessage.MESSAGE_TYPES.MESSAGE,
            signatureType: StreamMessage.SIGNATURE_TYPES.ETH,
            signature: 'signature',
        })
        nodeToNode2.sendData('node1', streamMessage)
        const [msg, source]: any = await waitForEvent(nodeToNode1, NodeToNodeEvent.DATA_RECEIVED)

        expect(msg).toBeInstanceOf(ControlLayer.BroadcastMessage)
        expect(source).toEqual('node2')
        expect(msg.requestId).toEqual('')
        expect(msg.streamMessage.messageId).toEqual(new MessageID('stream', 10, 666, 0, 'publisherId', 'msgChainId'))
        expect(msg.streamMessage.prevMsgRef).toEqual(new MessageRef(665, 0))
        expect(msg.streamMessage.getParsedContent()).toEqual({
            hello: 'world'
        })
        expect(msg.streamMessage.signatureType).toEqual(MessageLayer.StreamMessage.SIGNATURE_TYPES.ETH)
        expect(msg.streamMessage.signature).toEqual('signature')
    })

    it('sendUnicast is delivered', async () => {
        const streamMessage = new StreamMessage({
            messageId: new MessageID('stream', 10, 666, 0, 'publisherId', 'msgChainId'),
            prevMsgRef: new MessageRef(665, 0),
            content: {
                hello: 'world'
            },
            messageType: StreamMessage.MESSAGE_TYPES.MESSAGE,
            signatureType: StreamMessage.SIGNATURE_TYPES.ETH,
            signature: 'signature',
        })
        const unicastMessage = new ControlLayer.UnicastMessage({
            requestId: 'requestId',
            streamMessage,
        })
        nodeToNode2.send('node1', unicastMessage)
        const [msg, source]: any = await waitForEvent(nodeToNode1, NodeToNodeEvent.UNICAST_RECEIVED)

        expect(msg).toBeInstanceOf(ControlLayer.UnicastMessage)
        expect(source).toEqual('node2')
        expect(msg.requestId).toEqual('requestId')
        expect(msg.streamMessage.messageId).toEqual(new MessageID('stream', 10, 666, 0, 'publisherId', 'msgChainId'))
        expect(msg.streamMessage.prevMsgRef).toEqual(new MessageRef(665, 0))
        expect(msg.streamMessage.getParsedContent()).toEqual({
            hello: 'world'
        })
        expect(msg.streamMessage.signature).toEqual('signature')
        expect(msg.streamMessage.signatureType).toEqual(MessageLayer.StreamMessage.SIGNATURE_TYPES.ETH)
        expect(msg.requestId).toEqual('requestId')
    })

    it('sendInstruction is delivered', async () => {
        trackerServer.sendInstruction('node1', new StreamIdAndPartition('stream', 10), ['node1'], 15)
        const [msg, trackerId]: any = await waitForEvent(trackerNode, TrackerNodeEvent.TRACKER_INSTRUCTION_RECEIVED)

        expect(trackerId).toEqual('trackerServer')
        expect(msg).toBeInstanceOf(TrackerLayer.InstructionMessage)
        expect(msg.requestId).toMatch(UUID_REGEX)
        expect(msg.streamId).toEqual('stream')
        expect(msg.streamPartition).toEqual(10)
        expect(msg.nodeIds).toEqual(['node1'])
        expect(msg.counter).toEqual(15)
    })

    it('sendStatus is delivered', async () => {
        trackerNode.sendStatus('trackerServer', {
            // @ts-expect-error missing fields
            status: 'status',
        })
        const [msg, source]: any = await waitForEvent(trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED)

        expect(msg).toBeInstanceOf(TrackerLayer.StatusMessage)
        expect(source).toEqual('node1')
        expect(msg.requestId).toMatch(UUID_REGEX)
        expect(msg.status).toEqual({
            status: 'status'
        })
    })

    it('sendUnknownPeerRtcError is delivered', async () => {
        trackerServer.sendUnknownPeerRtcError('node1', 'requestId', 'unknownTargetNode')
        const [msg, source]: any = await waitForEvent(trackerNode, TrackerNodeEvent.RTC_ERROR_RECEIVED)

        expect(msg).toBeInstanceOf(TrackerLayer.ErrorMessage)
        expect(source).toEqual('trackerServer')
        expect(msg.errorCode).toEqual(TrackerLayer.ErrorMessage.ERROR_CODES.RTC_UNKNOWN_PEER)
        expect(msg.targetNode).toEqual('unknownTargetNode')
    })

    it('sendRtcOffer is delivered (trackerServer->trackerNode)', async () => {
        const promise = waitForEvent(trackerNode, TrackerNodeEvent.RELAY_MESSAGE_RECEIVED)
        trackerServer.sendRtcOffer('node1', 'requestId', PeerInfo.newNode('originatorNode'), 'connectionid','description')
        
        const [msg, source]: any = await (promise)

        expect(msg).toBeInstanceOf(TrackerLayer.RelayMessage)
        expect(source).toEqual('trackerServer')
        expect(msg.requestId).toEqual('requestId')
        expect(msg.originator).toEqual(PeerInfo.newNode('originatorNode'))
        expect(msg.targetNode).toEqual('node1')
        expect(msg.subType).toEqual('rtcOffer')
        expect(msg.data).toEqual({
            connectionId: 'connectionid',
            description: 'description'
        })
    })

    it('sendRtcAnswer is delivered (trackerServer->trackerNode)', async () => {
        trackerServer.sendRtcAnswer('node1', 'requestId', PeerInfo.newNode('originatorNode'), 'connectionid' , 'description')
        const [msg, source]: any = await waitForEvent(trackerNode, TrackerNodeEvent.RELAY_MESSAGE_RECEIVED)

        expect(msg).toBeInstanceOf(TrackerLayer.RelayMessage)
        expect(source).toEqual('trackerServer')
        expect(msg.requestId).toEqual('requestId')
        expect(msg.originator).toEqual(PeerInfo.newNode('originatorNode'))
        expect(msg.targetNode).toEqual('node1')
        expect(msg.subType).toEqual('rtcAnswer')
        expect(msg.data).toEqual({
            connectionId: 'connectionid',
            description: 'description'
        })
    })

    it('sendRtcConnect is delivered (trackerServer->trackerNode)', async () => {
        trackerServer.sendRtcConnect('node1', 'requestId', PeerInfo.newNode('originatorNode'))
        const [msg, source]: any = await waitForEvent(trackerNode, TrackerNodeEvent.RELAY_MESSAGE_RECEIVED)

        expect(msg).toBeInstanceOf(TrackerLayer.RelayMessage)
        expect(source).toEqual('trackerServer')
        expect(msg.requestId).toEqual('requestId')
        expect(msg.originator).toEqual(PeerInfo.newNode('originatorNode'))
        expect(msg.targetNode).toEqual('node1')
        expect(msg.subType).toEqual('rtcConnect')
        expect(msg.data).toEqual({})
    })

    it('sendRtcIceCandidate is delivered (trackerServer->trackerNode)', async () => {
        trackerServer.sendRtcIceCandidate('node1', 'requestId', PeerInfo.newNode('originatorNode'), 'connectionid', 'candidate', 'mid')
        const [msg, source]: any = await waitForEvent(trackerNode, TrackerNodeEvent.RELAY_MESSAGE_RECEIVED)

        expect(msg).toBeInstanceOf(TrackerLayer.RelayMessage)
        expect(source).toEqual('trackerServer')
        expect(msg.requestId).toEqual('requestId')
        expect(msg.originator).toEqual(PeerInfo.newNode('originatorNode'))
        expect(msg.targetNode).toEqual('node1')
        expect(msg.subType).toEqual('iceCandidate')
        expect(msg.data).toEqual({
            connectionId: 'connectionid',
            candidate: 'candidate',
            mid: 'mid'
        })
    })

    it('sendRtcOffer is delivered (trackerNode->trackerServer)', async () => {
        trackerNode.sendRtcOffer(
            'trackerServer',
            'targetNode',
            'connectionid',
            PeerInfo.newNode('originatorNode'),
            'description'
        )
        const [msg, source]: any = await waitForEvent(trackerServer, TrackerServerEvent.RELAY_MESSAGE_RECEIVED)

        expect(msg).toBeInstanceOf(TrackerLayer.RelayMessage)
        expect(source).toEqual('node1')
        expect(msg.requestId).toMatch(UUID_REGEX)
        expect(msg.originator).toEqual(PeerInfo.newNode('originatorNode'))
        expect(msg.targetNode).toEqual('targetNode')
        expect(msg.subType).toEqual('rtcOffer')
        expect(msg.data).toEqual({
            connectionId: 'connectionid',
            description: 'description'
        })
    })

    it('sendRtcConnect is delivered (trackerNode->trackerServer)', async () => {
        trackerNode.sendRtcConnect('trackerServer', 'targetNode', PeerInfo.newNode('originatorNode'))
        const [msg, source]: any = await waitForEvent(trackerServer, TrackerServerEvent.RELAY_MESSAGE_RECEIVED)

        expect(msg).toBeInstanceOf(TrackerLayer.RelayMessage)
        expect(source).toEqual('node1')
        expect(msg.requestId).toMatch(UUID_REGEX)
        expect(msg.originator).toEqual(PeerInfo.newNode('originatorNode'))
        expect(msg.targetNode).toEqual('targetNode')
        expect(msg.subType).toEqual('rtcConnect')
        expect(msg.data).toEqual({})
    })
    
})
