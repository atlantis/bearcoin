const Bearcoin = artifacts.require("TestBearcoin");

contract("TestBearcoin", accounts => {
  let bearcoin;
  let genesisPrice;
  let oneCoin = 100000000;

  beforeEach('should setup the contract instance', async () => {
    bearcoin = await Bearcoin.deployed();
    genesisPrice = await bearcoin.genesisBitcoinPrice();
  });

  it("should send genesis Bearcoin supply to the owner account", async () => {
    let genesisSupply = await bearcoin.genesisBearcoinSupply();
    let airdropSupply = await bearcoin.airdropSupply();
    let contractBalance = await bearcoin.balanceOf(bearcoin.address);

    let owner = await bearcoin.owner();
    var balance = await bearcoin.balanceOf(owner);

    assert.equal(
      balance.toString(),
      (genesisSupply.toNumber() - airdropSupply.toNumber()).toString(),
      "initial owner supply is incorrect"
    );

    assert.equal(
      contractBalance.toString(),
      airdropSupply.toNumber().toString(),
      "contract balance (airdrop supply) is incorrect"
    );
  });

  it("should have the correct genesis supply", async () => {
    let totalSupply = await bearcoin.totalSupply();

    assert.equal(
      totalSupply.toString(),
      "2100000000000000",
      "total supply not correct"
    );
  });

  it("should have an initial inflation coef of 1000000", async () => {
    let inflationCoef = await bearcoin.inflationCoef();
    assert.equal(
      inflationCoef.valueOf().toString(),
      "1000000",
      "initial inflation coef != 1000000"
    );
  });

  it("should max inflation out at 5%", async () => {
    await bearcoin.testSetBitcoinPrice(genesisPrice * 1100000 / 1000000);
    let inflationCoef = await bearcoin.inflationCoef();
    assert.equal(
      inflationCoef.valueOf().toNumber(),
      1050000,
      "max inflation not 5%"
    );
  });

  it("should max deflation out at 5%", async () => {
    await bearcoin.testSetBitcoinPrice(genesisPrice * 900 / 1000);
    let inflationCoef = await bearcoin.inflationCoef();
    assert.equal(
      inflationCoef.valueOf().toNumber(),
      950000,
      "max deflation not 5%"
    );
  });

  it("should calculate the 1% inflation coef correctly", async () => {
    await bearcoin.testSetBitcoinPrice(genesisPrice * 1010 / 1000);
    let inflationCoef = await bearcoin.inflationCoef();
    assert.equal(
      inflationCoef.valueOf().toNumber(),
      1010000,
      "1% inflation coef incorrect"
    );
  });

  it("should calculate the 1.5% inflation coef correctly", async () => {
    await bearcoin.testSetBitcoinPrice(genesisPrice * 1015 / 1000);
    let inflationCoef = await bearcoin.inflationCoef();
    assert.equal(
      inflationCoef.valueOf().toNumber(),
      1015000,
      "1.5% inflation coef incorrect"
    );
  });

  it("should calculate the 1% deflation coef correctly", async () => {
    await bearcoin.testSetBitcoinPrice(genesisPrice * 990 / 1000);
    let inflationCoef = await bearcoin.inflationCoef();

    assert.equal(
      inflationCoef.valueOf().toNumber(),
      990000,
      "1% deflation coef incorrect"
    );
  });

  it("should calculate the 1.5% deflation coef correctly", async () => {
    await bearcoin.testSetBitcoinPrice(genesisPrice * 985 / 1000);
    let inflationCoef = await bearcoin.inflationCoef();

    assert.equal(
      inflationCoef.valueOf().toNumber(),
      985000,
      "1% deflation coef incorrect"
    );
  });

  it("should know which transaction amounts are inflation poolable", async () => {
    await bearcoin.testSetBitcoinPrice(genesisPrice * 990 / 1000);
    let inflationCoef = await bearcoin.inflationCoef();

    assert.equal(
      inflationCoef.valueOf().toNumber(),
      990000,
      "1% deflation coef incorrect"
    );
  });

  it("should calculate correct inflate/deflate amounts", async () => {
    await bearcoin.testSetBitcoinPrice(genesisPrice * 1010 / 1000);
    var inflateOrDeflateAmount = await bearcoin.testInflateOrDeflateAmount.call(100);

    assert.equal(
      inflateOrDeflateAmount,
      101,
      "1% inflation on 0.00000100 not correct"
    );

    await bearcoin.testSetBitcoinPrice(genesisPrice * 990 / 1000);
    inflateOrDeflateAmount = await bearcoin.testInflateOrDeflateAmount.call(100);

      assert.equal(
        inflateOrDeflateAmount,
        99,
        "1% deflation on 0.00000100 not correct"
      );

      await bearcoin.testSetBitcoinPrice(genesisPrice * 1100 / 1000);
      inflateOrDeflateAmount = await bearcoin.testInflateOrDeflateAmount.call(100);

      assert.equal(
        inflateOrDeflateAmount,
        105,
        "max deflation on 0.00000100 not correct"
      );

      await bearcoin.testSetBitcoinPrice(genesisPrice * 900 / 1000);
      inflateOrDeflateAmount = await bearcoin.testInflateOrDeflateAmount.call(100);

      assert.equal(
        inflateOrDeflateAmount,
        95,
        "max deflation on 0.00000100 not correct"
      );

      await bearcoin.testSetBitcoinPrice(genesisPrice * 985 / 1000);

      inflateOrDeflateAmount = await bearcoin.testInflateOrDeflateAmount.call(100000000000);
      assert.equal(
        inflateOrDeflateAmount,
        98500000000,
        "1.5% inflation on 1 coin not correct"
      );

      await bearcoin.testSetBitcoinPrice(genesisPrice * 1025 / 1000);
      inflateOrDeflateAmount = await bearcoin.testInflateOrDeflateAmount.call(100000000);

      assert.equal(
        inflateOrDeflateAmount,
        102500000,
        "2.5% inflation on 1 coin not correct"
      );

      await bearcoin.testSetBitcoinPrice(genesisPrice * 975 / 1000);

      inflateOrDeflateAmount = await bearcoin.testInflateOrDeflateAmount.call(100000000);
      assert.equal(
        inflateOrDeflateAmount,
        97500000,
        "2.5% inflation on 1 coin not correct"
      );
  });
});