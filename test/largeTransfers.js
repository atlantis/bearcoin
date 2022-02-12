const Bearcoin = artifacts.require("TestBearcoin");

contract("TestBearcoin", accounts => {
  let bearcoin;
  let genesisPrice;
  let oneCoin = 100000000;
  beforeEach('should setup the contract instance', async () => {
    bearcoin = await Bearcoin.deployed();
    genesisPrice = await bearcoin.genesisBitcoinPrice();
  });

  it("should have working deflation for very large amounts", async () => {
    let account = accounts[3];
    let largeAmount = oneCoin * 10000000;

    await bearcoin.testSetBitcoinPrice(genesisPrice * 985 / 1000);
    await bearcoin.enableInflationDeflation({from: account});

    let totalSupply = await bearcoin.totalSupply();

    await bearcoin.transfer(account, largeAmount);

    var balance = await bearcoin.balanceOf.call(account);
    assert.equal(
      balance.toString(),
      largeAmount.toString(),
      "initial transfer amount not correct"
    );

    //small transaction to burn deflation
    await bearcoin.transfer(accounts[1], 1);

    balance = await bearcoin.balanceOf.call(account);

    //old total supply - deflation we just generated
    let correctTotalSupply = totalSupply.toNumber() - (largeAmount - (largeAmount * 985 / 1000));
    let newTotalSupply = await bearcoin.totalSupply();

    assert.equal(
      newTotalSupply.toString(),
      correctTotalSupply.toString(),
      "total supply not correct"
    );

    assert.equal(
      balance.toString(),
      (largeAmount * 985 / 1000).toString(),
      "deflated transfer amount not correct"
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
  });

  it("should have working inflation for very large amounts", async () => {
    let account = accounts[4];
    let oneMillionCoins = oneCoin * 1000000;

    let totalSupply = await bearcoin.totalSupply();

    await bearcoin.testSetBitcoinPrice(genesisPrice * 1100 / 1000);
    await bearcoin.transfer(account, oneMillionCoins);

    var balance = await bearcoin.balanceOf.call(account);
    assert.equal(
      balance.toString(),
      oneMillionCoins.toString(),
      "account balance not correct"
    );

    //old total supply + inflation we just generated
    let correctTotalSupply = totalSupply.toNumber() + Math.round(oneMillionCoins * 1050 / 1000) - oneMillionCoins;
    let newTotalSupply = await bearcoin.totalSupply();

    assert.equal(
      newTotalSupply.toString(),
      correctTotalSupply.toString(),
      "total supply not correct"
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

  });

  it("should never swing past the desired amount during inflation", async () => {
    let account2 = accounts[2];
    let account3 = accounts[3];
    let tenMillionCoins = oneCoin * 10000000;

    await bearcoin.testSetBitcoinPrice(genesisPrice * 1050 / 1000); //Set to max inflation

    var desiredSupply = await bearcoin.desiredSupply();
    assert.equal(
      desiredSupply.toString(),
      "2205000000000000", //21M * 1.05
      "desired supply incorrect"
    );

    await bearcoin.transfer(account2, tenMillionCoins);
    await bearcoin.transfer(account3, tenMillionCoins, {from: account2});
    await bearcoin.transfer(account2, tenMillionCoins, {from: account3});
    await bearcoin.transfer(account3, tenMillionCoins, {from: account2});
    //by this point we should have inflated 10M * 4 * 0.05 = 2M coins

    var balance = await bearcoin.balanceOf.call(account3);
    assert.equal(
      balance.toString(),
      tenMillionCoins.toString(),
      "account3 balance not correct"
    );

    var newTotalSupply = await bearcoin.totalSupply();
    assert.equal(
      newTotalSupply.toString(),
      "2205000000000000", //should NOT be 23M, but instead capped at desiredSupply
      "total supply after large transfers incorrect"
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

  it("should never swing past the desired amount during deflation", async () => {
    let account2 = accounts[2];
    let account3 = accounts[3];
    let oneMillionCoins = oneCoin * 1000000;
    let tenMillionCoins = oneMillionCoins * 10;

    await bearcoin.testSetBitcoinPrice(genesisPrice * 950 / 1000); //Set to max deflation

    await bearcoin.enableInflationDeflation({from: account2});
    await bearcoin.enableInflationDeflation({from: account3});

    var desiredSupply = await bearcoin.desiredSupply();
    assert.equal(
      desiredSupply.toString(),
      "1995000000000000", //21M * .95
      "desired supply incorrect"
    );

    await bearcoin.transfer(account2, tenMillionCoins);
    await bearcoin.transfer(account3, tenMillionCoins - oneMillionCoins, {from: account2});
    await bearcoin.transfer(account2, tenMillionCoins - (oneMillionCoins * 2), {from: account3});
    await bearcoin.transfer(account3, tenMillionCoins - (oneMillionCoins * 3), {from: account2});
    await bearcoin.transfer(account2, tenMillionCoins - (oneMillionCoins * 4), {from: account3});
    //by this point we should have deflated 40M * 0.05 = 2M coins

    var newTotalSupply = await bearcoin.totalSupply();
    assert.equal(
      newTotalSupply.toString(),
      "1995000000000000", //should NOT be 19M, but instead capped at desiredSupply
      "total supply after 5 large transfers incorrect"
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

  it("should adjust the inflationCoef as the desiredSupply changes", async () => {
    let account2 = accounts[2];
    let account3 = accounts[3];
    let tenMillionCoins = oneCoin * 10000000;
    let nineMillionCoins = oneCoin * 9000000;
    let eightMillionCoins = oneCoin * 8000000;

    await bearcoin.enableInflationDeflation({from: account2});
    await bearcoin.enableInflationDeflation({from: account3});

    await bearcoin.testSetBitcoinPrice(genesisPrice * 950 / 1000); //Set to max deflation

    var desiredSupply = await bearcoin.desiredSupply();
    assert.equal(
      desiredSupply.toString(),
      "1995000000000000", //21M * .95
      "desired supply incorrect"
    );

    await bearcoin.transfer(account2, tenMillionCoins); //9.5M coins available in account2
    await bearcoin.transfer(account3, nineMillionCoins, {from: account2});  //8.55M coins available in account3
    await bearcoin.transfer(account2, eightMillionCoins, {from: account3});
    //await bearcoin.transfer(account2, tenMillionCoins, {from: account3});
    //by this point we should have deflated 28M * 0.05 = 1.35M coins

    var newTotalSupply = await bearcoin.totalSupplyLessPendingDeflation();
    assert.equal(
      newTotalSupply.toString(),
      "1995000000000000", //should NOT be 19.65M, but instead capped at desiredSupply
      "total supply after 5 large transfers incorrect"
    );

    await bearcoin.updateInflationDeflationRate();

    let inflationCoef = await bearcoin.inflationCoef();

    assert.equal(
      inflationCoef.toString(),
      "1000000",  //since now desiredSupply has caught up to actual supply
      "inflation coef not correct"
    );
  });
});