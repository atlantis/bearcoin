const Bearcoin = artifacts.require("TestBearcoin");
const oneCoin = 100000000;

contract("TestBearcoin", accounts => {
  let bearcoin;
  beforeEach('should setup the contract instance', async () => {
    bearcoin = await Bearcoin.deployed();
  });

  it("should start the airdrop automatically if too long goes by", async () => {
    await bearcoin.performUpkeep('0x1b');

    var airdropStartAt = await bearcoin.airdropStartAt.call();
    assert.equal(
      airdropStartAt.toString(),
      "0",
      "airdrop starts out disabled"
    );

    await bearcoin.devSetGenesisTimestamp(Math.round(new Date().getTime() / 1000) - 61*24*60*60);
    await bearcoin.performUpkeep('0x1b');

    airdropStartAt = await bearcoin.airdropStartAt.call();
    assert.notEqual(
      airdropStartAt.toString(),
      "0",
      "airdrop enabled automatically"
    );
  });
});

contract("TestBearcoin", accounts => {
  let bearcoin;
  beforeEach('should setup the contract instance', async () => {
    bearcoin = await Bearcoin.deployed();
  });

  it("should start the airdrop manually", async () => {
    await bearcoin.performUpkeep('0x1b');

    var airdropStartAt = await bearcoin.airdropStartAt.call();
    assert.equal(
      airdropStartAt.toString(),
      "0",
      "airdrop starts out disabled"
    );

    await bearcoin.startAirdrop();

    airdropStartAt = await bearcoin.airdropStartAt.call();
    assert.notEqual(
      airdropStartAt.toString(),
      "0",
      "airdrop enabled manually"
    );
  });

  it("should start with the proper airdrop supply", async () => {
    let airdropSupply = await bearcoin.airdropSupply();
    let contractBalance = await bearcoin.balanceOf(bearcoin.address);
    assert.equal(
      airdropSupply.toString(),
      contractBalance.toString(),
      "airdrop initial supply correct"
    );
  });
});

contract("TestBearcoin", accounts => {
  let bearcoin;
  beforeEach('should setup the contract instance and inflation pool and start the airdrop', async () => {
    bearcoin = await Bearcoin.deployed();

    //Make sure some folks are in the inflation pool
    var isEnabled = await bearcoin.inflationDeflationEnabled.call({from: accounts[7]});

    if ( !isEnabled.valueOf() ) {
      await bearcoin.transfer(accounts[7], 100 * oneCoin);
      await bearcoin.enableInflationDeflation({from: accounts[7]});
    }

    isEnabled = await bearcoin.inflationDeflationEnabled.call({from: accounts[8]});
    if ( ! isEnabled.valueOf() ) {
      await bearcoin.enableInflationDeflation({from: accounts[8]});
      await bearcoin.transfer(accounts[8], 100 * oneCoin);
    }

    isEnabled = await bearcoin.inflationDeflationEnabled.call({from: accounts[9]});
    if ( !isEnabled.valueOf() ) {
      await bearcoin.enableInflationDeflation({from: accounts[9]});
      await bearcoin.transfer(accounts[9], 100 * oneCoin);
    }

    let airdropStartAt = await bearcoin.airdropStartAt.call();
    if ( airdropStartAt.toNumber() == 0 ){
      await bearcoin.startAirdrop();
    }
  });

  it("should not distribute anything the first day", async () => {
    //Make sure the airdrop start at is set to today
    await bearcoin.devSetAirdropStartAt(Math.round(new Date().getTime() / 1000) - 600);
    await bearcoin.devAirdrop();

    let airdropDistributed = await bearcoin.airdropDistributed();
    assert.equal(
      airdropDistributed.toString(),
      "0",
      "airdrop does not distribute anything the first day"
    );
  });

  it("should complete the first day's airdrop", async () => {
    //This should be the entirity of the inflation pool
    var balanceAccount7 = await bearcoin.balanceOf.call(accounts[7]);
    var balanceAccount8 = await bearcoin.balanceOf.call(accounts[8]);
    var balanceAccount9 = await bearcoin.balanceOf.call(accounts[9]);

    let startBalanceTotal = balanceAccount7.toNumber() + balanceAccount8.toNumber() + balanceAccount9.toNumber();

    //move the start back in time 24h 1s and run the drop
    await bearcoin.devSetAirdropStartAt(Math.round(new Date().getTime() / 1000) - (1*24*60*60 + 1));

    let days = await bearcoin.daysIntoAirdrop.call();
    assert.equal(
      days.valueOf().toString(),
      "1",
      "one day into airdrop"
    );

    let dailyAirdropAmount = await bearcoin.dailyAirdropAmount.call();
    await bearcoin.devAirdrop();

    let airdropDistributed = await bearcoin.airdropDistributed();
    assert.equal(
      airdropDistributed.toString(),
      dailyAirdropAmount.toString(),
      "total distributed after first drop matches daily amount"
    );

    balanceAccount7 = await bearcoin.balanceOf.call(accounts[7]);
    balanceAccount8 = await bearcoin.balanceOf.call(accounts[8]);
    balanceAccount9 = await bearcoin.balanceOf.call(accounts[9]);

    let endBalanceTotal = balanceAccount7.toNumber() + balanceAccount8.toNumber() + balanceAccount9.toNumber();
    assert.equal(
      (endBalanceTotal - startBalanceTotal).toString(),
      dailyAirdropAmount.toString(),
      "total airdrop ended up in inflation pool addresses"
    );
  });
});