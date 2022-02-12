const readline = require('readline');

var contract = "TestBearcoin";
if ( process.env.NODE_ENV === "production" ){
  contract = "Bearcoin";
}
else if ( process.env.NODE_ENV === "development" ){
  contract = "DevBearcoin";
}

process.stdout.write("Contract: " + contract);

var Bearcoin = artifacts.require(contract);

module.exports = function (deployer) {
  deployer.deploy(Bearcoin);
};
