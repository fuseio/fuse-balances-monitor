require('dotenv').config()
const Web3 = require('web3')
const AWS = require('aws-sdk')

const config = require('./config')
const {
  POLLING_INTERVAL,
  INFURA_API,
  AWS_REGION,
  AWS_TOPIC_ARN
} = process.env

AWS.config.update({region: AWS_REGION || 'eu-central-1'})

const fuseProvider = new Web3.providers.HttpProvider('https://rpc.fusenet.io')
const ropstenProvider = new Web3.providers.HttpProvider(`https://ropsten.infura.io${INFURA_API || ''}`)
const mainnetProvider = new Web3.providers.HttpProvider(`https://mainnet.infura.io${INFURA_API || ''}`)

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

  // let params = { Subject: 'Balances Monitor', Message: result, TopicArn: AWS_TOPIC_ARN}
  // let publishTextPromise = new AWS.SNS({apiVersion: '2010-03-31'}).publish(params).promise()
  // publishTextPromise.then(data => {
  //   // console.log(`Message ${params.Message} sent to the topic ${params.TopicArn}`)
  //   // console.log(`MessageID is ${data.MessageId}`)
  // }).catch(err => {
  //   throw err
  // })
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