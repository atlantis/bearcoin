const Bearcoin = artifacts.require("TestBearcoin");

contract("Bearcoin", accounts => {
  let bearcoin;
  beforeEach('should setup the contract instance', async () => {
    bearcoin = await Bearcoin.deployed();
  });

  it("should be able to performUpkeep", async () => {
    //Use a slightly neutered version, since the full version depends on other contracts
    await bearcoin.performUpkeep('0x1b');
  });
});
