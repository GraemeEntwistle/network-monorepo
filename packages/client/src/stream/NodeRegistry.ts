import StreamrClient from '..'
import { StreamPermission, Stream, StreamProperties, StreamOperation } from './index'

import { Contract } from '@ethersproject/contracts'
// import { Wallet } from '@ethersproject/wallet'
import { Signer } from '@ethersproject/abstract-signer'
import StreamrEthereum from '../Ethereum'
import debug from 'debug'
import type { StreamRegistry as StreamRegistryContract } from './ethereumArtifacts/StreamRegistry.d'
import StreamRegistryArtifact from './ethereumArtifacts/StreamRegistryAbi.json'
import fetch, { Response } from 'node-fetch'
import { EthereumAddress } from '../types'
import { Errors } from 'streamr-client-protocol'
import { StreamListQuery } from '../rest/StreamEndpoints'
import { NotFoundError } from '../rest/authFetch'
import { AddressZero } from '@ethersproject/constants'
import { BigNumber } from '@ethersproject/bignumber'

const { ValidationError } = Errors

// const fetch = require('node-fetch');
const log = debug('StreamrClient::StreamRegistry')

export type PermissionQueryResult = {
    id: string
    userAddress: string
    edit: boolean
    canDelete: boolean
    publishExpiration: BigNumber
    subscribeExpiration: BigNumber
    share: boolean
}

export type StreamQueryResult = {
    id: string
    metadata: string
    permissions: Array<PermissionQueryResult>
}

export type AllStreamsQueryResult = {
    streams: Array<{
        id: string,
        metadata: string
    }>
}

export type FilteredStreamListQueryResult = {
    streams: Array<StreamQueryResult>
}

export type SingleStreamQueryResult = {
    stream: StreamQueryResult | null
}

// export interface StreamRegistryOnchain {}
export class NodeRegistry {
    readonly client: StreamrClient
    ethereum: StreamrEthereum
    streamRegistryContract?: StreamRegistryContract
    sideChainProvider?: Signer

    constructor(client: StreamrClient) {
        log('creating StreamRegistryOnchain')
        this.client = client
        this.ethereum = client.ethereum
    }

    // --------------------------------------------------------------------------------------------
    // Read from the NodeRegistry contract
    // --------------------------------------------------------------------------------------------

    async connectToEthereum() {
        if (!this.sideChainProvider || !this.streamRegistryContract) {
            this.sideChainProvider = await this.ethereum.getSidechainSigner()
            this.streamRegistryContract = new Contract(this.client.options.streamRegistrySidechainAddress,
                StreamRegistryArtifact, this.sideChainProvider) as StreamRegistryContract
        }
    }

    async getNodeFromContract(id: string): Promise<Stream> {
        this.client.debug('getStream %s', id)
        await this.connectToEthereum()
        try {
            const propertiesString = await this.streamRegistryContract?.getStreamMetadata(id) || '{}'
            return this.parseStream(id, propertiesString)
        } catch (error) {
            log(error)
        }
        throw new NotFoundError('Stream: id=' + id)
    }

    async getPermissionsForUser(streamId: string, userAddress: EthereumAddress): Promise<StreamPermission> {
        await this.connectToEthereum()
        // const userAddress: EthereumAddress = await this.ethereum.getAddress()
        log('getting permission for stream for user')
        let permissions
        if (userAddress) {
            permissions = await this.streamRegistryContract?.getPermissionsForUser(streamId, userAddress)
        } else {
            permissions = await this.streamRegistryContract?.getPermissionsForUser(streamId, AddressZero)
        }
        return {
            streamId,
            // operation: StreamOperation
            userAddress,
            edit: permissions?.edit || false,
            canDelete: permissions?.canDelete || false,
            publishExpiration: permissions?.publishExpiration || new BigNumber(null, '0x0'),
            subscribeExpiration: permissions?.subscribeExpiration || new BigNumber(null, '0x0'),
            share: permissions?.share || false
        }
    }

    // --------------------------------------------------------------------------------------------
    // Send transactions to the StreamRegistry contract
    // --------------------------------------------------------------------------------------------

    async createStream(props?: StreamProperties): Promise<Stream> {
        this.client.debug('createStream %o', {
            props,
        })

        let properties = props || {}
        await this.connectToEthereum()
        const userAddress: string = (await this.ethereum.getAddress()).toLowerCase()
        // const a = this.ethereum.getAddress()
        const propsJsonStr : string = JSON.stringify(properties)
        let path = '/'
        if (properties.id && properties.id.includes('/')) {
            path = properties.id.slice(properties.id.indexOf('/'), properties.id.length)
        }

        if (properties.id && !properties.id.startsWith('/') && !properties.id.startsWith(userAddress)) {
            throw new ValidationError('Validation')
            // TODO add check for ENS??
        }
        const tx = await this.streamRegistryContract?.createStream(path, propsJsonStr)
        await tx?.wait()
        const id = userAddress + path
        properties = {
            ...properties,
            id
        }
        return new Stream(this.client, properties)
    }

    async updateStream(props?: StreamProperties): Promise<Stream> {
        let properties = props || {}
        await this.connectToEthereum()
        const userAddress: string = (await this.ethereum.getAddress()).toLowerCase()
        log('creating/registering stream onchain')
        // const a = this.ethereum.getAddress()
        const propsJsonStr : string = JSON.stringify(properties)
        let path = '/'
        if (properties.id && properties.id.includes('/')) {
            path = properties.id.slice(properties.id.indexOf('/'), properties.id.length)
        }

        if (properties.id && !properties.id.startsWith('/') && !properties.id.startsWith(userAddress)) {
            throw new ValidationError('Validation')
            // TODO add check for ENS??
        }
        const id = userAddress + path
        const tx = await this.streamRegistryContract?.updateStreamMetadata(id, propsJsonStr)
        await tx?.wait()
        properties = {
            ...properties,
            id
        }
        return new Stream(this.client, properties)
    }

    async grantPermission(streamId: string, operation: StreamOperation, recievingUser: string) {
        await this.connectToEthereum()
        const tx = await this.streamRegistryContract?.grantPermission(streamId, recievingUser,
            StreamRegistry.streamOperationToSolidityType(operation))
        await tx?.wait()
    }

    async grantPublicPermission(streamId: string, operation: StreamOperation) {
        await this.connectToEthereum()
        const tx = await this.streamRegistryContract?.grantPublicPermission(streamId,
            StreamRegistry.streamOperationToSolidityType(operation))
        await tx?.wait()
    }

    async revokePermission(streamId: string, operation: StreamOperation, recievingUser: string) {
        await this.connectToEthereum()
        const tx = await this.streamRegistryContract?.revokePermission(streamId, recievingUser,
            StreamRegistry.streamOperationToSolidityType(operation))
        await tx?.wait()
    }

    async revokePublicPermission(streamId: string, operation: StreamOperation) {
        await this.connectToEthereum()
        const tx = await this.streamRegistryContract?.revokePublicPermission(streamId,
            StreamRegistry.streamOperationToSolidityType(operation))
        await tx?.wait()
    }

    async deleteStream(streamId: string) {
        await this.connectToEthereum()
        const tx = await this.streamRegistryContract?.deleteStream(streamId)
        await tx?.wait()
    }

    static streamOperationToSolidityType(operation: StreamOperation): BigNumber {
        switch (operation) {
            case StreamOperation.STREAM_EDIT:
                return BigNumber.from(0)
            case StreamOperation.STREAM_DELETE:
                return BigNumber.from(1)
            case StreamOperation.STREAM_PUBLISH:
                return BigNumber.from(2)
            case StreamOperation.STREAM_SUBSCRIBE:
                return BigNumber.from(3)
            case StreamOperation.STREAM_SHARE:
                return BigNumber.from(4)
            default:
                break
        }
        return BigNumber.from(0)
    }

    // --------------------------------------------------------------------------------------------
    // GraphQL queries
    // --------------------------------------------------------------------------------------------

    async queryTheGraph(gqlQuery: string): Promise<Object> {
        log('GraphQL query: %s', gqlQuery)
        const res = await fetch(this.client.options.theGraphUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                accept: '*/*',
            },
            body: gqlQuery
        })
        const resJson = await res.json()
        log('GraphQL response: %o', resJson)
        if (!resJson.data) {
            if (resJson.errors && resJson.errors.length > 0) {
                throw new Error('GraphQL query failed: ' + JSON.stringify(resJson.errors.map((e: any) => e.message)))
            } else {
                throw new Error('GraphQL query failed')
            }
        }
        return resJson.data
    }

    async getStream(streamId: string): Promise<Stream> {
        log('Getting stream %s', streamId)
        const response = await this.queryTheGraph(StreamRegistry.buildGetSingleStreamQuery(streamId)) as { stream: StreamQueryResult }
        if (!response.stream) { throw new NotFoundError('Stream not found: id=' + streamId) }
        const { id, metadata } = response.stream
        return this.parseStream(id, metadata)
    }

    async getAllStreams(): Promise<Stream[]> {
        log('Getting all streams from thegraph')
        const response = await this.queryTheGraph(StreamRegistry.buildGetAllStreamsQuery()) as AllStreamsQueryResult
        return response.streams.map(({ id, metadata }) => this.parseStream(id, metadata))
    }

    async getAllPermissionsForStream(streamid: string): Promise<StreamPermission[]> {
        log('Getting all permissions for stream %s', streamid)
        const response = await this.queryTheGraph(StreamRegistry.buildGetSingleStreamQuery(streamid)) as SingleStreamQueryResult
        if (!response.stream) {
            throw new NotFoundError('stream not found: id: ' + streamid)
        }
        return response.stream.permissions.map(({ id, ...permissionobj }) => ({ ...permissionobj, streamId: id }))
    }

    async listStreams(filter: StreamListQuery): Promise<Stream[]> {
        log('Getting all streams from thegraph that match filter %o', filter)
        const response = await this.queryTheGraph(StreamRegistry.buildGetFilteredStreamListQuery(filter)) as FilteredStreamListQueryResult
        return response.streams.map((streamobj) => new Stream(
            this.client,
            this.parseStream(streamobj.id, streamobj.metadata)
        ))
    }

    async getStreamPublishers(streamId: string): Promise<EthereumAddress[]> {
        log('Getting stream publishers for stream id %s', streamId)
        const response = await this.queryTheGraph(StreamRegistry.buildGetStreamPublishersQuery(streamId)) as StreamQueryResult
        return response.permissions.map((permission: PermissionQueryResult) => {
            return permission.userAddress
        })
    }

    async isStreamPublisher(streamId: string, userAddress: EthereumAddress): Promise<boolean> {
        log('Checking isStreamPublisher for stream %s for address %s', streamId, userAddress)
        const response = await this.queryTheGraph(StreamRegistry.buildIsPublisherQuery(streamId, userAddress)) as StreamQueryResult
        try {
            return response.permissions.length > 0
        } catch (error) {
            return false
        }
    }

    async getStreamSubscribers(streamId: string): Promise<EthereumAddress[]> {
        log('Getting stream subscribers for stream id %s', streamId)
        const result = await this.queryTheGraph(StreamRegistry.buildGetStreamSubscribersQuery(streamId)) as StreamQueryResult
        return result.permissions.map((permission: PermissionQueryResult) => {
            return permission.userAddress
        })
    }

    async isStreamSubscriber(streamId: string, userAddress: EthereumAddress): Promise<boolean> {
        this.client.debug('isStreamSubscriber %o', {
            streamId,
            userAddress,
        })
        const query: string = StreamRegistry.buildIsSubscriberQuery(streamId, userAddress)
        const res = await this.queryTheGraph(query)
        const resJson = await res.json()
        try {
            return resJson.data.stream.permissions.length > 0
        } catch (error) {
            return false
        }
        log('Checking is for stream %s for address %s', streamId, userAddress)
        this.client.debug('Checking isStreamPublisher for stream %s for address %s', streamId, userAddress)
        const response = await this.queryTheGraph(StreamRegistry.buildIsPublisherQuery(streamId, userAddress)) as StreamQueryResult
        try {
            return response.permissions.length > 0
        } catch (error) {
            return false
        }
    }    

    // --------------------------------------------------------------------------------------------
    // GraphQL query builders
    // --------------------------------------------------------------------------------------------

    // graphql over fetch:
    // https://stackoverflow.com/questions/44610310/node-fetch-post-request-using-graphql-query

    static buildGetAllStreamsQuery(): string {
        //    id: "0x4178babe9e5148c6d5fd431cd72884b07ad855a0/"}) {
        const query = `{
            streams {
                 id,
                 metadata
            }
        }`
        return JSON.stringify({ query })
    }

    static buildGetSingleStreamQuery(streamid: string): string {
        const query = `{
            stream (id: "${streamid}") {
             id,
             metadata,
             permissions {
               id,
               userAddress,
               edit,
               canDelete,
               publishExpiration,
               subscribeExpiration,
               share,
             }
           }
         }`
        return JSON.stringify({ query })
    }

    static buildGetFilteredStreamListQuery(filter: StreamListQuery): string {
        const nameparam = filter.name ? `metadata_contains: "name\\\\\\":\\\\\\"${filter.name}"` : ''
        const maxparam = filter.max ? `, first: ${filter.max}` : ''
        const offsetparam = filter.offset ? `, skip: ${filter.offset}` : ''
        const orderByParam = filter.sortBy ? `, orderBy: ${filter.sortBy}` : ''
        const ascDescParama = filter.order ? `, orderDirection: ${filter.order}` : ''
        const query = `{
            streams (where: {${nameparam}}${maxparam}${offsetparam}${orderByParam}${ascDescParama}) 
              { id, metadata, permissions 
                { id, userAddress, edit, canDelete, publishExpiration, 
                  subscribeExpiration, share 
                } 
              } 
          }`
        return JSON.stringify({ query })
    }

    static buildGetStreamPublishersQuery(streamId: string): string {
        const query = `{
            stream (id: "${streamId}") 
              { id, metadata, permissions (where: {publishExpiration_gt: "${Date.now()}"})
                { id, userAddress, edit, canDelete, publishExpiration, 
                  subscribeExpiration, share 
                } 
              } 
          }`
        // return JSON.stringify({ query })
        return JSON.stringify({ query })
    }
    static buildIsPublisherQuery(streamId: string, userAddess: EthereumAddress): string {
        const query = `{
            stream (id: "${streamId}")
              { id, metadata, permissions (where: {userAddress: "${userAddess}", publishExpiration_gt: "${Date.now()}"})
                { id, userAddress, edit, canDelete, publishExpiration, 
                  subscribeExpiration, share 
                } 
              } 
          }`
        return JSON.stringify({ query })
    }
    static buildGetStreamSubscribersQuery(streamId: string): string {
        const query = `{
            stream (id: "${streamId}") 
              { id, metadata, permissions (where: {subscribeExpiration_gt: "${Date.now()}"})
                { id, userAddress, edit, canDelete, publishExpiration, 
                  subscribeExpiration, share 
                } 
              } 
          }`
        return JSON.stringify({ query })
    }
    static buildIsSubscriberQuery(streamId: string, userAddess: EthereumAddress): string {
        const query = `{
            stream (id: "${streamId}") 
              { id, metadata, permissions (where: {userAddress: "${userAddess}", subscribeExpiration_gt: "${Date.now()}"})
                { id, userAddress, edit, canDelete, publishExpiration, 
                  subscribeExpiration, share 
                } 
              } 
          }`
        return JSON.stringify({ query })
    }
}

