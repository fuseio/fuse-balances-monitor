require('dotenv').config()
const Web3 = require('web3')
const Slack = require('node-slackr')

const config = require('./config')
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
  username: `balances-monitor-bot`,
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

async function run() {
  let result = {
    fuse: {
      block_number: await web3.fuse.eth.getBlockNumber(),
      balances: []
    },
    ropsten: {
      block_number: await web3.ropsten.eth.getBlockNumber(),
      balances: []
    },
    mainnet: {
      block_number: await web3.ropsten.eth.getBlockNumber(),
      balances: []
    }
  }
  await asyncForEach(config, async (obj) => {
    let balance = prettyNumber(web3[obj.network].utils.fromWei(await web3[obj.network].eth.getBalance(obj.address)))
    result[obj.network].balances.push({
      role: obj.role,
      address: obj.address,
      balance: balance
    })
  })

  result = JSON.stringify(result, null, 2)

  console.log(new Date())
  console.log(result)

  slack.notify("```" + result + "```", (err, data) => {
    if (err) {
      console.error(`Slack notification`, err)
    }
    console.log(`Slack notification`, data)
  })
}

async function main() {
  try {
    await run()
  } catch (e) {
    console.error(e)
  }

  setTimeout(() => {
    main()
  }, POLLING_INTERVAL || 60000)
}
main()