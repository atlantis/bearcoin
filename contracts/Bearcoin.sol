pragma solidity ^0.8.10;

import "./BearcoinBase.sol";

contract Bearcoin is BearcoinBase {
  // Initializes smart contract with supply of tokens going to the address that deployed the contract.
  constructor() ERC20("BTC Bearcoin", "BTCBEAR")
      VRFConsumerBase(
        0x3d2341ADb2D31f1c5530cDC622016af293177AE0, // VRF Coordinator
        0xb0897686c545045aFc77CF20eC7A532E3120E0F1  // LINK Token
    )
  {
    _priceFeed = AggregatorV3Interface(0xc907E116054Ad103354f2D350FD2514433D57F6f);  //Polygon BTC / USD

    //Randomness
    s_keyHash = 0xf86195cf7690c55907b2b611ebb7343a6f649bff128701cc542f0569e2c549da;

    onDeploy();
  }
}