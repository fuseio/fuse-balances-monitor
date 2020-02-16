require('dotenv').config()
const path = require('path')
const cwd = process.cwd()
const Web3 = require('web3')
const Slack = require('node-slackr')
const moment = require('moment')
const axios = require('axios')

const config = require('./config')
const thresholds = require('./thresholds')
const {
  POLLING_INTERVAL,
  FUSE_RPC_URL,
  MAINNET_RPC_URL,
  ROPSTEN_RPC_URL,
  ETHERSCAN_API,
  CONSENSUS_ADDRESS,
  FOREIGN_BRIDGE_ADDRESS,
  SLACK_INCOMING_WEBHOOK_URL,
  SLACK_CHANNEL,
  BLOCKS_ON_MAINNET
} = process.env

const web3 = {
  fuse: new Web3(new Web3.providers.HttpProvider(FUSE_RPC_URL)),
  mainnet: new Web3(new Web3.providers.HttpProvider(MAINNET_RPC_URL)),
  ropsten: new Web3(new Web3.providers.HttpProvider(ROPSTEN_RPC_URL))
}

const codeBlock = '```'
slack = new Slack(SLACK_INCOMING_WEBHOOK_URL, {
  channel: `#${SLACK_CHANNEL}`,
  username: `${SLACK_CHANNEL}-bot`,
  icon_emoji: `:money_with_wings:`
})

let consensus

async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array)
  }
}

function prettyNumber(n) {
  let parts = n.toString().split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return parts.join('.')
}

function notify(network, msg) {
  slack.notify(`*${network.toUpperCase()}*\n${msg}`, (err, data) => {
    if (err) {
      console.error(`Slack notification`, err)
    }
    console.log(`Slack notification`, data)
  })
}

async function init() {
  consensus = new web3.fuse.eth.Contract(require(path.join(cwd, 'abi/consensus')), CONSENSUS_ADDRESS)
}

async function blocks() {
  console.log(`=== blocks ===`)

  let blockNumber = await web3.fuse.eth.getBlockNumber()
  let block = await web3.fuse.eth.getBlock(blockNumber)
  let now = moment()
  let blockTime = moment.unix(block.timestamp)
  let diff = now.diff(blockTime, 'seconds')
  console.log(`diff between now and last block time: ${diff}`)
  if (diff > 5) {
    notify(`fuse`, `Latest block was over 5 seconds ago: ${blockNumber}`)
  }

  let validators = await consensus.methods.getValidators.call()
  validators = validators.map(v => v.toLowerCase())
  let n = validators.length*2
  console.log(`validators: ${validators}`)
  let authors = []
  for (let i = 0; i < n; i++) {
    let { author } = await web3.fuse.eth.getBlock(blockNumber - i)
    if (authors.indexOf(author) < 0) {
      authors.push(author.toLowerCase())
    }
  }
  console.log(`authors: ${authors}`)
  authors.forEach(author => {
    validators.splice(validators.indexOf(author), 1)
  })
  if (validators.length > 0) {
    notify(`fuse`, `The following validators have not mined for ${n} blocks:\n${codeBlock}${JSON.stringify(validators, null, 2)}${codeBlock}`)
  }
}

async function bridge() {
  console.log(`=== bridge ===`)
  let endBlock = await web3.mainnet.eth.getBlockNumber()
  let startBlock = endBlock - BLOCKS_ON_MAINNET
  let endpoint = `module=account&action=tokentx&address=${FOREIGN_BRIDGE_ADDRESS}&startblock=${startBlock}&endblock=${endBlock}&sort=asc`
  console.log(`endpoint: ${endpoint}`)
  let { data } = await axios.get(`${ETHERSCAN_API}&${endpoint}`)
  if (data.message === 'OK') {
    let isMinted
    console.log(data)
    data.result.forEach(obj => {
      if (obj.from == '0x0000000000000000000000000000000000000000') {
        isMinted = true
      }
    })
    if (!isMinted) {
      notify(`mainnet`, `No Fuse Tokens minted on last ${BLOCKS_ON_MAINNET} blocks (${startBlock} - ${endBlock})`)
    }
  } else {
    console.error(`Etherscan request error`, data)
    notify(`mainnet`, `Etherscan request error: ${JSON.stringify(data)}\nProbably no Fuse Tokens minted on last ${BLOCKS_ON_MAINNET} blocks (${startBlock} - ${endBlock})`)
  }
}

async function balances() {
  console.log(`=== balances ===`)

  let result = {
    fuse: { block_number: await web3.fuse.eth.getBlockNumber(), accounts: [] },
    ropsten: { block_number: await web3.ropsten.eth.getBlockNumber(), accounts: [] },
    mainnet: { block_number: await web3.mainnet.eth.getBlockNumber(), accounts: [] }
  }
  await asyncForEach(config, async (obj) => {
    let { description, address, networks, role } = obj
    await asyncForEach(networks, async (net) => {
      let balance = web3[net].utils.fromWei(await web3[net].eth.getBalance(address))
      if (balance < thresholds[net][role]) {
        console.log(`${address} (${description}) is running low on ${net} [${prettyNumber(balance)}]`)
        result[net].accounts.push({ description, address, net, role, balance })
      } else {
        console.log(`${address} (${description}) is fine on ${net} [${prettyNumber(balance)}]`)
      }
    })
  })

  Object.keys(result).forEach(k => {
    if (result[k].accounts.length > 0) {
      notify(k.toUpperCase(), `${codeBlock}${JSON.stringify(result[k], null, 2)}${codeBlock}`)
    }
  })
}

async function main() {
  try {
    await init()
    await blocks()
    await bridge()
    await balances()
  } catch (e) {
    console.error(e)
  }

  setTimeout(() => {
    main()
  }, POLLING_INTERVAL || 60000)
}
main()