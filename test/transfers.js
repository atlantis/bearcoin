const Bearcoin = artifacts.require("TestBearcoin");

contract("TestBearcoin", accounts => {
  let bearcoin;
  let genesisPrice;
  let oneCoin = 100000000;

  beforeEach('should setup the contract instance', async () => {
    bearcoin = await Bearcoin.deployed();
    genesisPrice = await bearcoin.genesisBitcoinPrice();

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
  });

  it("should have working inflation for very small amounts", async () => {
    let account = accounts[3];

    let totalSupply = await bearcoin.totalSupply();

    await bearcoin.testSetBitcoinPrice(genesisPrice * 1050 / 1000);
    await bearcoin.transfer(account, 100);

    var balance = await bearcoin.balanceOf.call(account);
    assert.equal(
      balance.toString(),
      "100",
      "amount not correct"
    );

    let newTotalSupply = await bearcoin.totalSupply();

    assert.equal(
      newTotalSupply.toString(),
      (totalSupply.add(web3.utils.toBN('5'))).toString(),
      "total supply not correct"
    );
  });

  it("should handle zero inflation generated due to tiny amounts", async () => {
    let account = accounts[4];

    let totalSupply = await bearcoin.totalSupply();

    await bearcoin.testSetBitcoinPrice(genesisPrice * 1050 / 1000);
    await bearcoin.transfer(account, 10);
    var balance = await bearcoin.balanceOf.call(account);
    assert.equal(
      balance.toString(),
      "10",
      "amount not correct"
    );

    let newtotalSupply = await bearcoin.totalSupply();

    assert.equal(
      totalSupply.toString(),
      newtotalSupply.toString(),
      "total supply not correct"
    );
  });

  it("should have working deflation for very small amounts", async () => {
    let account = accounts[6];

    await bearcoin.testSetBitcoinPrice(genesisPrice * 985000 / 1000000);
    await bearcoin.transfer(account, 100);

    let totalSupply = await bearcoin.totalSupply();

    var balance = await bearcoin.balanceOf.call(account);
    assert.equal(
      balance.toString(),
      "100",
      "transfer amount not correct"
    );

    let newTotalSupply = await bearcoin.totalSupply();

    assert.equal(
      newTotalSupply.toString(),
      totalSupply.toString(),
      "total suppy changed"
    );
  });
});

contract("TestBearcoin", accounts => {
  let bearcoin;
  let genesisPrice;
  let oneCoin = 100000000;
  beforeEach('should setup the contract instance', async () => {
    bearcoin = await Bearcoin.deployed();
    genesisPrice = await bearcoin.genesisBitcoinPrice();

    //Make sure some folks are in the inflation pool

    await bearcoin.transfer(accounts[7], 100 * oneCoin);
    await bearcoin.enableInflationDeflation({from: accounts[7]});

    await bearcoin.transfer(accounts[8], 100 * oneCoin);
    await bearcoin.enableInflationDeflation({from: accounts[8]});

    await bearcoin.transfer(accounts[9], 100 * oneCoin);
    await bearcoin.enableInflationDeflation({from: accounts[9]});
  });

  it("should be able to transfer 100 tokens during max inflation", async () => {
    await bearcoin.testSetBitcoinPrice(genesisPrice * 1100 / 1000);

    var balanceAccount7 = await bearcoin.balanceOf.call(accounts[7]);
    var balanceAccount8 = await bearcoin.balanceOf.call(accounts[8]);
    var balanceAccount9 = await bearcoin.balanceOf.call(accounts[9]);

    let oldInflationpoolTotal = balanceAccount7.add(balanceAccount8).add(balanceAccount9);

    await bearcoin.transfer(accounts[2], oneCoin * 100);

    let balance = await bearcoin.balanceOf.call(accounts[2]);
    assert.equal(
      balance.toString(),
      (oneCoin * 100).toString(),
      "transfer amount not correct"
    );

    balanceAccount7 = await bearcoin.balanceOf.call(accounts[7]);
    balanceAccount8 = await bearcoin.balanceOf.call(accounts[8]);
    balanceAccount9 = await bearcoin.balanceOf.call(accounts[9]);

    let newInflationpoolTotal = balanceAccount7.add(balanceAccount8).add(balanceAccount9);

    assert.equal(
      newInflationpoolTotal.toString(),
      oldInflationpoolTotal.add( web3.utils.toBN( (oneCoin * 5).toString() ) ).toString(),
      "new inflation pool total not correct"
    );
  });
});

//Have to reset the total supply for this to work due to rounding
contract("TestBearcoin", accounts => {
  let bearcoin;
  let genesisPrice;
  let oneCoin = 100000000;
  beforeEach('should setup the contract instance', async () => {
    bearcoin = await Bearcoin.deployed();
    genesisPrice = await bearcoin.genesisBitcoinPrice();
  });

  it("should be able to transfer 100 tokens during max deflation", async () => {
    let account = accounts[3];
    let amount = oneCoin * 100;
    let totalSupply = await bearcoin.totalSupply();

    await bearcoin.enableInflationDeflation({from: account});
    await bearcoin.testSetBitcoinPrice(genesisPrice * 900 / 1000);

    let inflateOrDeflateAmount = await bearcoin.testInflateOrDeflateAmount(amount);
    assert.equal(
      inflateOrDeflateAmount.toString(),
      (amount * 950 / 1000).toString(),
      "max deflation on 100 coins not correct"
    );

    await bearcoin.transfer(account, amount);

    var balance = await bearcoin.balanceOf.call(account);
    assert.equal(
      balance.toString(),
      amount.toString(),
      "original balance not correct"
    );

    //small transaction to burn deflation
    await bearcoin.transfer(accounts[1], 1);

    balance = await bearcoin.balanceOf.call(account);

    assert.equal(
      balance.toString(),
      inflateOrDeflateAmount.toString(),
      "deflated balance not correct"
    );

    let newTotalSupply = await bearcoin.totalSupply();

    assert.equal(
      newTotalSupply.toString(),
      (totalSupply - (amount - inflateOrDeflateAmount)).toString(),
      "deflated total supply not correct"
    );
  });
});


//Have to reset the total supply for this to work due to rounding
contract("TestBearcoin", accounts => {
  let bearcoin;
  let genesisPrice;
  let oneCoin = 100000000;
  beforeEach('should setup the contract instance', async () => {
    bearcoin = await Bearcoin.deployed();
    genesisPrice = await bearcoin.genesisBitcoinPrice();
  });

  it("should be able to transfer 100 tokens during 1.5% deflation", async () => {
    let account = accounts[5];
    let amount = oneCoin * 100;
    let totalSupply = await bearcoin.totalSupply();

    await bearcoin.testSetBitcoinPrice(genesisPrice * 985 / 1000);
    await bearcoin.enableInflationDeflation({from: account});

    let inflateOrDeflateAmount = await bearcoin.testInflateOrDeflateAmount.call(amount);
    assert.equal(
      inflateOrDeflateAmount.toString(),
      "9850000000",
      "1.5% deflation on 100 coins not correct"
    );

    await bearcoin.transfer(account, amount);

    var balance = await bearcoin.balanceOf.call(account);
    assert.equal(
      balance.toString(),
      amount.toString(),
      "original balance not correct"
    );

    //small transaction to burn deflation
    await bearcoin.transfer(accounts[1], 1);

    balance = await bearcoin.balanceOf.call(account);

    assert.equal(
      balance.toString(),
      inflateOrDeflateAmount.toString(),
      "deflated balance not correct"
    );

    let newTotalSupply = await bearcoin.totalSupply();

    assert.equal(
      newTotalSupply.toString(),
      (totalSupply - (amount - inflateOrDeflateAmount)).toString(),
      "deflated total supply not correct"
    );
  });
});

contract("TestBearcoin", accounts => {
  let bearcoin;
  let genesisPrice;
  let oneCoin = 100000000;
  beforeEach('should setup the contract instance', async () => {
    bearcoin = await Bearcoin.deployed();
    genesisPrice = await bearcoin.genesisBitcoinPrice();
  });

  it("should not change the total supply when inflation/deflation are paused", async () => {
    let account = accounts[8];

    let totalSupply = await bearcoin.totalSupply();

    await bearcoin.transfer(account, oneCoin * 1000000);

    let newtotalSupply = await bearcoin.totalSupply();

    assert.equal(
      totalSupply.toString(),
      newtotalSupply.toString(),
      "total supply not correct"
    );
  });

  it("should not change the total supply when no inflation/deflation", async () => {
    let account = accounts[8];
    await bearcoin.testSetBitcoinPrice(genesisPrice);

    let totalSupply = await bearcoin.totalSupply();

    await bearcoin.transfer(account, oneCoin * 1000000);

    let newtotalSupply = await bearcoin.totalSupply();

    assert.equal(
      totalSupply.toString(),
      newtotalSupply.toString(),
      "total supply not correct"
    );
  });
});