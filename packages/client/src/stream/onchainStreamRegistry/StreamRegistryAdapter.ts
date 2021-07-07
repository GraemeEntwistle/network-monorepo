import StreamrClient from '../..'
import { StreamPermission, Stream, StreamProperties, StreamOperation } from '../index'

import { Contract } from '@ethersproject/contracts'
// import { Wallet } from '@ethersproject/wallet'
import { Signer } from '@ethersproject/abstract-signer'
import StreamrEthereum from '../../Ethereum'
import debug from 'debug'
import type { StreamRegistry } from './StreamRegistry'
import StreamRegistryArtifact from './StreamRegistryArtifact.json'
// import { Provider } from '@ethersproject/abstract-provider'
import fetch, { Response } from 'node-fetch'
import { EthereumAddress } from '../../types'
import { BigNumber } from 'ethers'
import { Errors } from 'streamr-client-protocol'
import { StreamListQuery } from '../../rest/StreamEndpoints'
import { NotFoundError } from '../../rest/authFetch'

const { ValidationError } = Errors

// const fetch = require('node-fetch');
const log = debug('StreamrClient::StreamRegistryOnchain')

// export interface StreamRegistryOnchain {}
export class StreamRegistryOnchain {
    client: StreamrClient
    ethereum: StreamrEthereum
    // streamRegistryAddress: EthereumAddress
    streamRegistry?: StreamRegistry
    // ensCacheSidechainAddress: EthereumAddress
    sideChainPrivider?: Signer

    constructor(client: StreamrClient) {
        log('creating StreamRegistryOnchain')
        this.client = client
        this.ethereum = client.ethereum
        // this.streamRegistryAddress = client.options.streamRegistrySidechainAddress
        // this.ensCacheSidechainAddress = client.options.ensCacheSidechainAddress
        // this.sideChainPrivider = this.ethereum.getSidechainSigner() as Signer
        // console.log('######### regaddr' + client.options.streamRegistrySidechainAddress)

        // this.streamRegistry = new Contract(client.options.streamRegistrySidechainAddress,
        //     StreamRegistryArtifact.abi, this.sideChainPrivider) as StreamRegistry
        // console.log('######### contractaddr ' + this.streamRegistry.address)
    }

    async connectToEthereum() {
        if (!this.sideChainPrivider || !this.streamRegistry) {
            this.sideChainPrivider = await this.ethereum.getSidechainSigner() as Signer
            this.streamRegistry = new Contract(this.client.options.streamRegistrySidechainAddress,
                StreamRegistryArtifact.abi, this.sideChainPrivider) as StreamRegistry
        }
    }

    async getStreamById(id: string): Promise<Stream> {
        await this.connectToEthereum()
        log('getting stream(properties) by id from chain')
        // const a = this.ethereum.getAddress()
        // console.log(id)
        try {
            const propertiesString = await this.streamRegistry?.getStreamMetadata(id) || '{}'
            return new Stream(this.client, StreamRegistryOnchain.parseStreamProps(id, propertiesString))
        } catch (error) {
            log(error)
        }
        throw new NotFoundError('Stream: id=' + id)
    }
    async getAllStreams(): Promise<Array<Stream>> {
        // await this.connectToEthereum()
        log('getting all streams from thegraph')
        // const a = this.ethereum.getAddress()
        // console.log(id);
        const query: string = StreamRegistryOnchain.buildGetStreamGQLQuery()
        // console.log('######' + query)
        const res = await this.queryTheGraph(query)
        const resJson = await res.json()
        if (resJson.errors && resJson.errors.length > 0) {
            throw new Error('failed to get streams from theGraph ' + JSON.stringify(resJson.errors))
        }
        // console.log(JSON.stringify(resJson))
        return resJson.data.streams.map((streamobj: any) => {
            return new Stream(this.client, StreamRegistryOnchain.parseStreamProps(streamobj.id, streamobj.metadata))
        })

    }
    async getAllPermissionsForStream(streamid: string): Promise<Array<StreamPermission>> {
        // await this.connectToEthereum()
        // const a = this.ethereum.getAddress()
        // console.log(id);
        const query: string = StreamRegistryOnchain.buildGetSingleStreamQuery(streamid)
        // console.log('######' + query)
        const res = await this.queryTheGraph(query)
        const resJson = await res.json()
        // console.log(JSON.stringify(resJson))
        return resJson.data.stream.permissions.map((permissionobj: any) => {
            // return new Stream(this.client, StreamRegistryOnchain.parseStreamProps(streamobj.id, streamobj.metadata))
            const permission = {
                ...permissionobj,
                streamId: permissionobj.id
            }
            delete permission.id
            return permission
        })
    }

    async getFilteredStreamList(filter: StreamListQuery): Promise<Stream[]> {

        const gqlquery: string = StreamRegistryOnchain.buildGetFilteredStreamListQuery(filter.name)
        // console.log('######' + query)
        const res = await this.queryTheGraph(gqlquery)
        const resJson = await res.json()
        // console.log(JSON.stringify(resJson))
        const streams: Stream[] = []
        resJson.data.streams.forEach((streamobj: any) => {
            streamobj.permissions.map((permissionobj: any) => {
                // return new Stream(this.client, StreamRegistryOnchain.parseStreamProps(streamobj.id, streamobj.metadata))
                const permission = {
                    ...permissionobj,
                    streamId: permissionobj.id
                }
                delete permission.id
                return permission
            })
            streams.push(new Stream(this.client, StreamRegistryOnchain.parseStreamProps(streamobj.id, streamobj.metadata)))
        })
        return streams
    }

    async queryTheGraph(query: string): Promise<Response> {
        return fetch(this.client.options.theGraphUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                accept: '*/*',
                // 'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: query
        })
    }
    // .. use querybuilder? i.e. https://www.npmjs.com/package/gql-query-builder
    // .. how to get permissions filtered on "they belong to the same stream"?
    // alternative: get stream with all its permission:

    // {
    //     streams (  where: {
    //    id: "0x4178babe9e5148c6d5fd431cd72884b07ad855a0/auxigkli"}) {
    //      id,
    //      metadata,
    //      permissions {
    //        id,
    //            user,
    //            edit,
    //        canDelete,
    //        publish,
    //        subscribed,
    //        share,
    //      }
    //    }
    //  }

    static buildGetPermissionGQLQuery(streamid: string): string {
        //    id: "0x4178babe9e5148c6d5fd431cd72884b07ad855a0/"}) {
        // const queryWithVars = gql.query({
        //     operation: 'stream',
        //     fields: ['id', 'metadata', {
        //         permissions: ['id',
        //             'userAddress',
        //             'edit',
        //             'canDelete',
        //             'publishExpiration',
        //             'subscribeExpiration',
        //             'share'
        //         ]
        //     }],
        //     variables: { id: streamid },
        // })

        const query = `{
            stream (  where: {
              id: "${streamid}"}) {
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

    static buildGetFilteredStreamListQuery(name?: string): string {
        const nameparam = name ? `metadata_contains: "name\\\\\\":\\\\\\"${name}"` : ''
        const query = `{
            streams (where: {${nameparam}}) 
              { id, metadata, permissions 
                { id, userAddress, edit, canDelete, publishExpiration, 
                  subscribeExpiration, share 
                } 
              } 
          }`
        // return JSON.stringify({ query })
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
        // return JSON.stringify({ query })
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
        // return JSON.stringify({ query })
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
        // return JSON.stringify({ query })
        return JSON.stringify({ query })
    }

    // search contains query
    // {
    //     streams (where: {metadata_contains: "name\\\":\\\"p55648-test-stream"})
    //       { id, metadata, permissions
    //         { id, userAddress, edit, canDelete, publishExpiration,
    //           subscribeExpiration, share
    //         }
    //       }
    //   }

    static buildGetStreamGQLQuery(): string {
        //    id: "0x4178babe9e5148c6d5fd431cd72884b07ad855a0/"}) {
        const query = `{
            streams {
                 id,
                 metadata
               }
          }`
        return JSON.stringify({ query })
    }

    static parseStreamProps(id: string, propsString: string): StreamProperties {
        let parsedProps : StreamProperties
        try {
            parsedProps = JSON.parse(propsString)
            parsedProps = {
                ...parsedProps,
                id
                // path: id.substring(id.indexOf('/'))
            }
        } catch (error) {
            // throw new Error(`could not parse prperties from onachein metadata: ${propsString}`)
            return { id, description: 'ERROR IN PROPS' }
        }
        return parsedProps
    }

    async createStream(props?: StreamProperties): Promise<Stream> {
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
        // const path = properties.path || '/'
        // const properties = this.streamRegistry.getStreamMetadata(id) as StreamProperties

        // console.log('#### ' + path + ' ' + propsJsonStr)
        // console.log('####### creating stream with path ' + path)
        const tx = await this.streamRegistry?.createStream(path, propsJsonStr)
        await tx?.wait()
        const id = userAddress + path
        properties = {
            ...properties,
            id
        }
        // console.log('txreceipt' + JSON.stringify(txreceipt))
        // // TODO check for success
        // console.log('#### id ' + id)
        // const metaDateFromChain = await this.streamRegistry.getStreamMetadata(id)
        // console.log('#### ' + JSON.stringify(metaDateFromChain))
        return new Stream(this.client, properties)
    }
    // Promise<StreamPermision[]

    async getPermissionsForUser(streamId: string): Promise<StreamPermission> {
        await this.connectToEthereum()
        const userAddress: EthereumAddress = await this.ethereum.getAddress()
        log('getting permission for stream for user')
        const permissions = await this.streamRegistry?.getPermissionsForUser(streamId, userAddress)
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

    async getStreamPublishers(streamId: string): Promise<EthereumAddress[]> {
        const query: string = StreamRegistryOnchain.buildGetStreamPublishersQuery(streamId)
        // console.log('######' + query)
        const res = await this.queryTheGraph(query)
        const resJson = await res.json()
        // console.log(JSON.stringify(resJson))
        const result : EthereumAddress[] = []
        resJson.data.stream.permissions.forEach((permission: any) => {
            result.push(permission.userAddress)
        })
        return result
    }

    async isStreamPublisher(streamId: string, userAddress: EthereumAddress): Promise<boolean> {
        const query: string = StreamRegistryOnchain.buildIsPublisherQuery(streamId, userAddress)
        const res = await this.queryTheGraph(query)
        const resJson = await res.json()
        try {
            return resJson.data.stream.permissions.length > 0
        } catch (error) {
            return false
        }
    }
    async getStreamSubscribers(streamId: string): Promise<EthereumAddress[]> {
        const query: string = StreamRegistryOnchain.buildGetStreamSubscribersQuery(streamId)
        // console.log('######' + query)
        const res = await this.queryTheGraph(query)
        const resJson = await res.json()
        // console.log(JSON.stringify(resJson))
        const result : EthereumAddress[] = []
        resJson.data.stream.permissions.forEach((permission: any) => {
            result.push(permission.userAddress)
        })
        return result
    }

    async isStreamSubscriber(streamId: string, userAddress: EthereumAddress): Promise<boolean> {
        const query: string = StreamRegistryOnchain.buildIsSubscriberQuery(streamId, userAddress)
        const res = await this.queryTheGraph(query)
        const resJson = await res.json()
        try {
            return resJson.data.stream.permissions.length > 0
        } catch (error) {
            return false
        }
    }

    async grantPermission(streamId: string, operation: StreamOperation, recievingUser: string) {
        // let properties = props || {}
        await this.connectToEthereum()
        // const userAddress: string = (await this.ethereum.getAddress()).toLowerCase()
        // log('creating/registering stream onchain')
        // const a = this.ethereum.getAddress()
        // const propsJsonStr : string = JSON.stringify(properties)
        // let path = '/'
        // if (properties.id && properties.id.includes('/')) {
        //     path = properties.id.slice(properties.id.indexOf('/'), properties.id.length)
        // }

        // if (properties.id && !properties.id.startsWith('/') && !properties.id.startsWith(userAddress)) {
        //     throw new ValidationError('Validation')
        //     // TODO add check for ENS??
        // }
        // const path = properties.path || '/'
        // const properties = this.streamRegistry.getStreamMetadata(id) as StreamProperties

        // console.log('#### ' + path + ' ' + propsJsonStr)
        // console.log('####### creating stream with path ' + path)
        const tx = await this.streamRegistry?.grantPermission(streamId, recievingUser,
            StreamRegistryOnchain.streamOperationToSolidityType(operation))
        const tx2 = await tx?.wait()
        console.log(tx2)

        // const id = userAddress + path
        // properties = {
        //     ...properties,
        //     id
        // }
        // console.log('txreceipt' + JSON.stringify(txreceipt))
        // // TODO check for success
        // console.log('#### id ' + id)
        // const metaDateFromChain = await this.streamRegistry.getStreamMetadata(id)
        // console.log('#### ' + JSON.stringify(metaDateFromChain))
        // return new Stream(this.client, properties)
    }

    static streamOperationToSolidityType(operation: StreamOperation): BigNumber {
        switch (operation) {
            case StreamOperation.STREAM_EDIT:
                return BigNumber.from(0)
            case StreamOperation.STREAM_DELETE:
                return BigNumber.from(1)
            case StreamOperation.STREAM_SUBSCRIBE:
                return BigNumber.from(2)
            case StreamOperation.STREAM_PUBLISH:
                return BigNumber.from(3)
            case StreamOperation.STREAM_SHARE:
                return BigNumber.from(4)
            default:
                break
        }
        return BigNumber.from(0)
    }
    // const publicPermissions = await this.streamRegistry?.getPermissionsForUser(id, '0x0000000000000000000000000000000000000000')
    // const res2 = res?.slice(5, 10)
    // let perms: StreamPermission[] = []
    // if (directPermissions?.edit) perms.push({id:0, user: address, operation: StreamOperation.STREAM_EDIT})
    // if (directPermissions?.canDelete) perms.push({id:0, user: address, operation: StreamOperation.STREAM_DELETE})
    // if (directPermissions?.subscribed) perms.push({id:0, user: address, operation: StreamOperation.STREAM_SUBSCRIBE})
    // if (directPermissions?.publish) perms.push({id:0, user: address, operation: StreamOperation.STREAM_PUBLISH})
    // if (directPermissions?.share) perms.push({id:0, user: address, operation: StreamOperation.STREAM_SHARE})
    // if (publicPermissions?.edit) perms.push({id:0, anonymous: true, operation: StreamOperation.STREAM_EDIT})
    // if (publicPermissions?.canDelete) perms.push({id:0, anonymous: true, operation: StreamOperation.STREAM_DELETE})
    // if (publicPermissions?.subscribed) perms.push({id:0, anonymous: true, operation: StreamOperation.STREAM_SUBSCRIBE})
    // if (publicPermissions?.publish) perms.push({id:0, anonymous: true, operation: StreamOperation.STREAM_PUBLISH})
    // if (publicPermissions?.share) perms.push({id:0, anonymous: true, operation: StreamOperation.STREAM_SHARE})
    // perms.push(directPermissions)
    // perms.push(publicPermissions)
    // return perms
    // res2?.map((el): StreamPermision => {
    //     if (el.values()[0]) return {
    //         id: 0,
    //         operation: StreamOperation.STREAM_EDIT,
    //         user: address
    //     }
    // })
    // }

}

// graphql over fetch:
// https://stackoverflow.com/questions/44610310/node-fetch-post-request-using-graphql-query

// example query with sting contains clause
// need to write query function in grapgql
// {
//     streams (  where: { metadata_contains: "test",
//    id: "0x4178babe9e5148c6d5fd431cd72884b07ad855a0/"}) {
//      id,
//      metadata,
//      permissions {
//        id,
//            user,
//            edit,
//        canDelete,
//        publish,
//        subscribed,
//        share,
//      }
//    }
//  }
