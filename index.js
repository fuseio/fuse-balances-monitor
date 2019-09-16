require('dotenv').config()
const Web3 = require('web3')
const Slack = require('node-slackr')

const config = require('./config')
const thresholds = require('./thresholds')
const {
  POLLING_INTERVAL,
  INFURA_API,
  SLACK_INCOMING_WEBHOOK_URL,
  SLACK_CHANNEL
} = process.env

const fuseProvider = new Web3.providers.HttpProvider('https://rpc.fusenet.io')
const ropstenProvider = new Web3.providers.HttpProvider(`https://ropsten.infura.io${INFURA_API || ''}`)
const mainnetProvider = new Web3.providers.HttpProvider(`https://mainnet.infura.io${INFURA_API || ''}`)

slack = new Slack(SLACK_INCOMING_WEBHOOK_URL, {
  channel: `#${SLACK_CHANNEL}`,
  username: `${SLACK_CHANNEL}-bot`,
  icon_emoji: `:money_with_wings:`
})

const web3 = {
  fuse: new Web3(fuseProvider),
  ropsten: new Web3(ropstenProvider),
  mainnet: new Web3(mainnetProvider)
}

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

async function blocks() {
  console.log(`=== blocks ===`)
  // TODO
  // check latest block wasn't too long ago
  // get validators list from consensus account
  // check x latest blocks to see that all validators are mining blocks
}

async function events() {
  console.log(`=== events ===`)
  // TODO
  // check InitiateChange was emitted not too long ago
  // check RewardedOnCycle was emitted not too long ago
}

async function bridge() {
  console.log(`=== bridge ===`)
  // TODO
  // check that FUSE tokens were minted on mainnet
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
      if (balance <= thresholds[net][role]) {
        console.log(`${address} (${description}) is running low on ${net} [${prettyNumber(balance)}]`)
        result[net].accounts.push({ description, address, net, role, balance })
      } else {
        console.log(`${address} (${description}) is fine on ${net} [${prettyNumber(balance)}]`)
      }
    })
  })

  let codeBlock = '```'
  Object.keys(result).forEach(k => {
    if (result[k].accounts.length > 0) {
      slack.notify(`*${k.toUpperCase()}*:\n${codeBlock}${JSON.stringify(result[k], null, 2)}${codeBlock}`, (err, data) => {
        if (err) {
          console.error(`Slack notification`, err)
        }
        console.log(`Slack notification`, data)
      })
    }
  })
}

async function main() {
  try {
    await blocks()
    await events()
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