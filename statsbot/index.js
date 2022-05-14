const Web3 = require('web3')
const path = require('path')
const cjson = require('cjson')
const AWS = require('aws-sdk');

const testnet = (process.env.TESTNET == "1") || (process.env.TESTNET == "true");

const BUCKET_NAME = 'bearcoin.io';

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_KEY,
  secretAccessKey: process.env.AWS_SECRET
});

const blockchainProvider = testnet ? process.env.ALCHEMY_TEST_URL : process.env.ALCHEMY_URL
const contractAddress = testnet ? '0xc76920A8e8393afc64D9eb6cBf3a210F64dC68E8' : '0x071bFF87c6BAff13e62AE71495a76C4388c29f42';

const web3 = new Web3(blockchainProvider)
var contract = null;

// Initiate the Contract
function getContract() {
  if (contract === null) {
    var bearcoin = cjson.load(path.resolve(__dirname, testnet ? './DevBearcoin.json' : './Bearcoin.json'));
    var c = new web3.eth.Contract(bearcoin, contractAddress)
    contract = c.clone();
  }
  return contract;
}

async function getStats() {
  var totalSupply = await getContract().methods.totalSupply().call();
  var desiredSupply = await getContract().methods.desiredSupply().call();
  var inflationCoef = await getContract().methods.inflationCoef().call();

  var airdropDistributed = await getContract().methods.airdropDistributed().call();
  var airdropRemaining = await getContract().methods.airdropRemaining().call();

  return {
    totalSupply: Math.round(totalSupply / 100000000),
    desiredSupply: Math.round(desiredSupply / 100000000),
    inflationCoef: inflationCoef,
    timestamp: Math.floor(new Date().getTime()/1000),
    airdropDistributed: Math.round(airdropDistributed / 100000000),
    airdropRemaining: Math.round(airdropRemaining / 100000000)
  };
}

async function run(){
  let stats = await getStats();
  let statsJson = JSON.stringify(stats);

  const params = {
    Bucket: BUCKET_NAME,
    Key: testnet ? 'stats-testnet.json' : 'stats.json',
    Body: statsJson
  };

  s3.upload(params, function(err, data) {
    if (err) {
      throw err;
    }
    console.log('Stats uploaded successfully: ' + statsJson);
  });
}

exports.handler = function(event, context, callback) {
  run();
}

run();