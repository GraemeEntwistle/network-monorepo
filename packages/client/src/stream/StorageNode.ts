import { EthereumAddress } from '../types'

export class StorageNode {
    static STREAMR_GERMANY = new StorageNode('0x31546eEA76F2B2b3C5cC06B1c93601dc35c9D916', 'https://streamr.network')
    static STREAMR_DOCKER_DEV = new StorageNode('0xde1112f631486CfC759A50196853011528bC5FA0', 'https://10.200.10.1')

    readonly address: EthereumAddress
    readonly url: string

    constructor(_address: EthereumAddress, _url: string) {
        this.address = _address
        this.url = _url
    }
}
