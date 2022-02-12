const Bearcoin = artifacts.require("TestBearcoin");

contract("TestBearcoin", accounts => {
  let bearcoin;
  beforeEach('should setup the contract instance', async () => {
    bearcoin = await Bearcoin.deployed();
  });

  it("should start out paused", async () => {
    var paused = await bearcoin.inflationDeflationPaused.call();
    assert.equal(
      paused,
      true,
      "inflation rate did not start paused"
    );
  });
});

contract("TestBearcoin", accounts => {
  let bearcoin;
  beforeEach('should setup the contract instance', async () => {
    bearcoin = await Bearcoin.deployed();
  });

  it("should pause price updates if zero value is encountered", async () => {
    let genesisPrice = await bearcoin.genesisBitcoinPrice();
    await bearcoin.testSetBitcoinPrice(genesisPrice.toNumber() + 1000);

    var paused = await bearcoin.inflationDeflationPaused.call();
    assert.equal(
      paused,
      false,
      "inflation rate updates paused"
    );

    await bearcoin.testSetBitcoinPrice(0);
    paused = await bearcoin.inflationDeflationPaused.call();

    assert.equal(
      paused,
      true,
      "inflation rate updates not paused"
    );

    let inflationCoef = await bearcoin.inflationCoef();
    assert.equal(
      inflationCoef,
      1000000,
      "inflation coef not 1000000"
    );
  });

  it("should pause price updates if >20% change value is encountered", async () => {
    await bearcoin.testSetBitcoinPrice(100);

    var paused = await bearcoin.inflationDeflationPaused.call();
    assert.equal(
      paused,
      true,
      "inflation rate updates not paused"
    );

    var inflationCoef = await bearcoin.inflationCoef();
    assert.equal(
      inflationCoef,
      1000000,
      "inflation coef not 1000000"
    );
  });

  it("should resume price updates after 7 days, even with a bad value", async () => {
    await bearcoin.testSetBitcoinPrice(100);

    var paused = await bearcoin.inflationDeflationPaused.call();
    assert.equal(
      paused,
      true,
      "inflation rate updates not paused"
    );

    var inflationCoef = await bearcoin.inflationCoef();
    assert.equal(
      inflationCoef,
      1000000,
      "inflation coef not 1000000"
    );

    await bearcoin.testSetLastRateUpdateAt( Math.round((new Date().getTime()) / 1000 ) - 604800 - 60 );

    await bearcoin.testSetBitcoinPrice(100);

    paused = await bearcoin.inflationDeflationPaused.call();
    assert.equal(
      paused,
      false,
      "inflation rate updates paused"
    );

    inflationCoef = await bearcoin.inflationCoef();
    assert.equal(
      inflationCoef.toNumber(),
      950000,
      "inflation coef not 950000"
    );

    var currentBitcoinPrice = await bearcoin.bitcoinPrice.call();
    assert.equal(
      currentBitcoinPrice.toNumber(),
      100,
      "bitcoin price is not 100"
    );
  });
});