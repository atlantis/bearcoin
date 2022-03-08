// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "@chainlink/contracts/src/v0.8/interfaces/KeeperCompatibleInterface.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBase.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

struct Deflation {
    uint blocknumber;
    address account;
    uint256 amount;
}

contract Bearcoin is ERC20, Ownable, KeeperCompatibleInterface, VRFConsumerBase {
  bool private _inflationDeflationPaused = false;  //Used temporarily in case of price data failure...
  bool private _rateLimitUpdateInflationRate = true;
  uint32 private _inflationCoef = 1000000;  //1000000 = 1 = no change; valid range 950000 - 1050000 (since max 5% swing)
  uint256 private constant _oneToken = 100000000;
  uint256 private constant _secondsPerDay = 86400;

  uint256 private _genesisTimestamp = 0;
  uint256 private constant _genesisBitcoinPrice = 3630970000000;
  uint256 private constant _genesisBearcoinSupply = 21000000 * _oneToken;

  uint256 private _airdropStartAt = 0;
  uint256 private constant _airdropSupply = _genesisBearcoinSupply * 38 / 100;
  uint256 private _lastAirdropAt = 0;
  uint256 private _airdropsPerUpkeep = 20;  //Max airdrop distributions a single upkeep run will attempt (must be <= than maxPendingDeflationCount, since we could need to deflate once for each airdrop)
  uint8 private _forceStartAirdropDays = 60; //If the owner hasn't started the airdrop after this many days, force it to start
  uint256 private constant _minPreferredAirdrop = 100 * _oneToken;  //Minimum amount of each airdrop (though on the last distribution we'll probably do less)

  uint8 private constant _maxPendingDeflationCount = 50;  //Only allow this many pending deflations to accumulate
  Deflation[_maxPendingDeflationCount] private _pendingDeflation; //Tracks deflation for the current transaction and the previous ones

  AggregatorV3Interface private _priceFeed;

  uint256 private _bitcoinPrice = _genesisBitcoinPrice;
  uint256 private _desiredSupply = _genesisBearcoinSupply;

  uint256 private _lastUpkeepAt = 0;
  uint256 private _lastRateUpdateAt = 0;
  uint256 private _lastRandomSeedUpdateAt = 0;

  //Every address which has enabled inflation/deflation
  address[] private _inflatees_deflatees;
  mapping(address => uint256) private _inflatees_deflatees_map;
  uint8 private constant _minInflationPoolBalance = 100;

  //Randomness
  uint32 private constant _randomSeedUpdateSeconds = 3600;
  bytes32 private s_keyHash;
  uint256 private s_fee;
  uint256 private _randomSeed = 1111111; //Will be updated periodically with truly random data

  //How often will the upkeep function run
  uint32 private constant _upkeepSeconds = 200;

  //Don't let the bitcoin price be updated more than every few seconds
  uint32 private constant _bitcoinPriceUpdateRateLimitSeconds = 10;

  event RateUpdateFailure(uint256 unixtime, uint8 diffPercent);
  event RateUpdateSuccess(uint256 unixtime, uint32 inflationCoef);
  event RandomSeedUpdateSuccess(uint256 unixtime);
  event FetchedBitcoinPrice(uint256 unixtime, int256 price);
  event ReceivedInflation(address recipient, uint256 amount);
  event BurnedDeflation(address account, uint256 amount);
  event InflationDeflationEnabled(address account);
  event Airdrop(address account, uint256 amount);
  event InsufficientLINK();
  event DailyAirdropComplete();

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

  function decimals() public view virtual override returns (uint8) {
    return 8;
  }

  //If we have deflation pending from a previous transaction, burn it
  function burnPreviousDeflation() public {
    for ( uint8 i = 0; i < _pendingDeflation.length; i++ ) {
      if ( _pendingDeflation[i].account != address(0) && _pendingDeflation[i].blocknumber != block.number ) {
        address account = _pendingDeflation[i].account;
        uint256 amount = _pendingDeflation[i].amount;

        //Clear out the record before we actually burn
        _pendingDeflation[i].account = address(0);
        _pendingDeflation[i].amount = 0;
        _pendingDeflation[i].blocknumber = 0;

        _burn(account, amount);
        emit BurnedDeflation(account, amount);
      }
    }
  }

  //Returns the balanceOf an account, less pending deflation
  function balanceLessDeflationOf(address account) public view returns (uint256) {
    uint256 balance = balanceOf(account);
    uint256 pending = pendingDeflationOf(account);

    return balance - pending;
  }

  function pendingDeflationOf(address account) public view returns (uint256) {
    uint256 totalPendingDeflation = 0;
    for ( uint8 i=0; i < _pendingDeflation.length; i++ ) {
      if ( _pendingDeflation[i].account == account ) {
        totalPendingDeflation += _pendingDeflation[i].amount;
      }
    }

    return totalPendingDeflation;
  }

  //If only one account is deflatable, it gets deflated. If both are deflatable, the receiver gets deflated
  function _allocateDeflation(address sender, address recipient, uint256 amount) private {
    bool sender_enabled = inflationDeflationEnabled(sender);
    bool recipient_enabled = inflationDeflationEnabled(recipient);

    if ( (sender_enabled && recipient_enabled) || recipient_enabled ) {
      //Recipient pays if both are enabled or just the recipient is enabled
      _pushPendingDeflation(recipient, amount);
    }
    else if ( sender_enabled ) {
      //Sender pays if only sender is enabled
      _pushPendingDeflation(sender, amount);
    }
  }

  //Record pending deflation so it can be burned by the next transaction
  function _pushPendingDeflation(address account, uint256 amount) private {
    bool added = false;

    //Attempt to find an unused slot
    for( uint8 i = 0; i < _pendingDeflation.length; i++) {
      if ( _pendingDeflation[i].account == address(0) ) {
        _pendingDeflation[i].blocknumber = block.number;
        _pendingDeflation[i].account = account;
        _pendingDeflation[i].amount = amount;
        added = true;
        break;
      }
    }

    require(added, "too much deflation in one transaction");
  }

  //Returns whether a particular account is subject to inflation/deflation
  function inflationDeflationEnabled( address account ) public view returns (bool) {
    return _inflatees_deflatees_map[account] > 0; //The special value 1 counts as true
  }

  //Returns whether the _msgSender account account is subject to inflation/deflation
  function inflationDeflationEnabled() public virtual returns (bool) {
    return inflationDeflationEnabled( _msgSender() );
  }

  //Enables inflation/deflation on a particular account
  function enableInflationDeflation() public virtual {
    require(_msgSender() != owner(), "the owner account is not allowed to enable inflation/deflation");
    require(!inflationDeflationEnabled(_msgSender()), "inflation/deflation was already enabled on this account");
    _addInflateeDeflatee( _msgSender() );
  }

  //Implement inflation and deflation
  function _beforeTokenTransfer(address sender, address recipient, uint256 amount) internal override {
    super._beforeTokenTransfer(sender, recipient, amount);

    //Ignore if we're minting or burning
    if ( sender != address(0) && recipient != address(0) && sender != recipient && amount > 0 ) {
      //Burn any deflation from the previous transaction
      burnPreviousDeflation();

      require(recipient != address(this), "transfer not allowed to the contract address (you're welcome)");

      if ( !_inflationDeflationPaused ) {
        uint256 correctAmount = inflateOrDeflateAmount(amount);

        if ( correctAmount > amount ) {
          _inflate(correctAmount - amount); //Randomly allocate the inflation
        }
        else if ( amount > correctAmount ) {
          _allocateDeflation(sender, recipient, amount - correctAmount); //Earmark deflation
        }
      }

      //Make sure they can't bypass pending deflation (even if inflation/deflation are paused)
      if ( inflationDeflationEnabled(sender) ) {
        uint256 senderBalance = balanceLessDeflationOf(sender);
        require(senderBalance >= amount, "transfer amount (including pending deflation) exceeds balance");

        //Now remove the sender from the inflation pool if they have too small a balance
        if ( senderBalance - amount < _minInflationPoolBalance ) {
          _removeFromInflationDeflationPool(sender);
        }
      }
      //Can't transfer negative balances, so don't have to worry about the recipient's pending deflation
    }
  }

  //See if we might need to add them to the pool (if inflation/deflation is enabled but they're not in the pool yet)
  function _afterTokenTransfer(address /*from*/, address to, uint256 /*amount*/) internal override {
    if ( inflationDeflationEnabled(to) && _inflatees_deflatees_map[to] == 1 ) {
      _addInflateeDeflatee(to);
    }
  }

  //This address is removed from the pool but remains in the mapping with the special value 1 (meaning "enabled but not a pool-worthy balance")
  function _removeFromInflationDeflationPool(address account) private {
    uint256 currentIndex = _inflatees_deflatees_map[account];
    //Since 1 is a special case meaning "not in the pool"
    if ( currentIndex > 1 ) {
      _inflatees_deflatees[currentIndex] = address(0);  //Remove address from the pool
    }

    //Mark address as "not currently the pool"
    //1 is a special case meaning "inflation/deflation is enabled on this account but below minimum balance so not in the pool"
    _inflatees_deflatees_map[account] = 1;
  }

  //Adds an account to the inflatee/deflatee mapping and (balance permitting) to the inflation pool
  function _addInflateeDeflatee(address account) private {
    uint256 currentIndex = _inflatees_deflatees_map[account];
    bool poolEligible = balanceLessDeflationOf(account) >= _minInflationPoolBalance;

    //Only add them if they're not there already (or there but not in the pool and now they have a pool-worthy balance)
    if ( currentIndex == 0 || (currentIndex == 1 && poolEligible) ) {
      if ( currentIndex == 0) {
        emit InflationDeflationEnabled( account );
      }

      //Default is special value 1 meaning "enabled but insufficient balance"
      uint256 addedIndex = 1;

      //If they deserve a spot in the pool, add them to _inflatees_deflatees as well
      if ( poolEligible ) {
        //Try to find an empty slot to pop them in (to keep the array dense)
        bool added = false;
        uint256 poolSize = _inflatees_deflatees.length;
        for ( uint8 i = 0; i < 50; i++ ) {
          uint256 randomIndex = random(i) % poolSize;

          //Ignore 0 and 1 since those are special
          if ( randomIndex > 1 && randomIndex < poolSize ) {
            if ( _inflatees_deflatees[randomIndex] == address(0) ) {
              _inflatees_deflatees[randomIndex] = account;
              added = true;
              addedIndex = randomIndex;
              break;
            }
          }
        }

        //Append only if we didn't find a blank one
        if ( !added ) {
          _inflatees_deflatees.push( account );
          addedIndex = poolSize;  //since we just added one
        }
      }

      //Now add the proper index to the mapping
      _inflatees_deflatees_map[account] = addedIndex;
    }
  }

  //Uses a truly random seed plus some block information plus a one-time use seed
  function random(uint256 callSeed) private view returns (uint256) {
    return uint(keccak256(abi.encodePacked(_randomSeed, block.difficulty, block.timestamp, callSeed)));
  }

  //Uses the _inflationCoef to calculate a new inflated/deflated amount
  function inflateOrDeflateAmount(uint256 amount) private view returns (uint256)  {
    uint256 newAmount = (amount * inflationCoef()) / 1000000;
    uint256 currentTotalSupply = totalSupplyLessPendingDeflation();

    //If we're inflating
    if ( newAmount > amount ) {
      if ( _desiredSupply > currentTotalSupply ) {
        uint256 maxDiff = _desiredSupply - currentTotalSupply;
        uint256 amountDiff = newAmount - amount;

        //Make sure we never swing passed the desired supply
        if ( amountDiff > maxDiff ) {
          return amount + maxDiff;
        }
        else {
          return newAmount;
        }
      }
    }
    else if ( amount > newAmount ) {  //We're deflating
      if ( currentTotalSupply > _desiredSupply ) {
        uint256 maxDiff = currentTotalSupply - _desiredSupply;
        uint256 amountDiff = amount - newAmount;

        //Make sure we never swing passed the desired supply
        if ( amountDiff > maxDiff ) {
          return amount - maxDiff;
        }
        else {
          return newAmount;
        }
      }
    }

    return amount;
  }

  //Returns total supply less pending deflation
  function totalSupplyLessPendingDeflation() public view returns (uint256) {
    uint256 totalPendingDeflation = 0;
    for ( uint8 i=0; i < _pendingDeflation.length; i++ ) {
      if ( _pendingDeflation[i].account != address(0) ) {
        totalPendingDeflation += _pendingDeflation[i].amount;
      }
    }

    return totalSupply() - totalPendingDeflation;
  }

  //Can be called by anyone to update the inflation rate (subject to rate limiting)
  function updateInflationDeflationRate() public returns (bool)  {
    if ( _rateLimitUpdateInflationRate ) {
      require(block.timestamp >= _lastRateUpdateAt + _bitcoinPriceUpdateRateLimitSeconds, "updateInflationDeflationRate: can only be called once per minute");
    }

    uint256 previousBitcoinPrice = _bitcoinPrice;
    int256 rawBitcoinPrice = _fetchBitcoinPrice();

    uint256 latestBitcoinPrice = 0;

    //Never, ever allow a bitcoin price of zero or negative
    if ( rawBitcoinPrice > 0 ) {
      latestBitcoinPrice = uint256(rawBitcoinPrice);
    }

    //Require reasonable changes (otherwise wait until forced reset)
    uint256 priceDiff = 0;
    if ( latestBitcoinPrice > previousBitcoinPrice ) {
      priceDiff = latestBitcoinPrice - previousBitcoinPrice;
    }
    else {
      priceDiff = previousBitcoinPrice - latestBitcoinPrice;
    }

    if ( priceDiff > 0 ) {
      //If more than a 20% price change since the last check (which should happen every few minutes),
      //pause inflation/deflation temporarily since it's probably bad data
      uint8 diffPercent = previousBitcoinPrice > 0 ? uint8((priceDiff * 100) / previousBitcoinPrice) : 100;
      if ( diffPercent > 20 ) {
        if ( !_inflationDeflationPaused ) {
          _inflationDeflationPaused = true;
        }

        //If legit-looking data is unavailable for 7 days, just go with whatever we have now
        if ( _lastRateUpdateAt < block.timestamp - 604800 ) {
          _bitcoinPrice = latestBitcoinPrice;
          _inflationDeflationPaused = false;
          _lastRateUpdateAt = block.timestamp;
        }
        else {
          emit RateUpdateFailure(block.timestamp, diffPercent);
        }
      }
      else {
        _bitcoinPrice = latestBitcoinPrice;
        _lastRateUpdateAt = block.timestamp;
        if ( _inflationDeflationPaused ) {
          _inflationDeflationPaused = false;
        }
      }
    }
    else {  //No change
      if ( _inflationDeflationPaused ) {
        _inflationDeflationPaused = false;
        //Even if there's no change in the price, we still update the inflation rate to take into account totalSupply changes
      }
    }

    if ( _inflationDeflationPaused ) {
      return false;
    }
    else {
      //(bearcoin_desired_supply / bearcoin_genesis_supply) = (bitcoin_current_price / bitcoin_genesis_price)
      _desiredSupply = ((_bitcoinPrice * 1000000 / _genesisBitcoinPrice) * _genesisBearcoinSupply) / 1000000;

      //Limit to 5% inflation/deflation, normalized to 1,000,000:
      //(desiredBearcoin / currentBearcoin) = (x / 1000000), then capped at +-5%
      _inflationCoef = uint32( Math.max( Math.min( (((_desiredSupply * 1000000 / totalSupplyLessPendingDeflation()) * 1000000) / 1000000), 1050000 ), 950000) );

      emit RateUpdateSuccess(block.timestamp, inflationCoef());
      return true;
    }
  }

  //Randomly distribute tokens to an address in the inflation pool, weighted by balance -
  //we ignore pending deflation for performance/gas cost reasons
  function _inflate(uint256 amount) private {
    if ( amount > 0 && _inflatees_deflatees.length > 0 ){
      address recipient = address(0);
      uint256 eachBalance = 0;
      address randomAccount;
      uint256 randomIndex;

      //One tenth of one percent of inflation goes to maintenance costs
      if ( random(_inflatees_deflatees.length) % 1000 == 500 ) {
        recipient = owner();
      }
      else {
        //Try hard to find the top holder in a bunch of random addresses, weighted by balance (though without burning too much gas)
        //ten cycles pulling 10 addresses each cycle
        for ( uint8 cycle = 0; cycle < 10; cycle++ ) {
          uint256 maxBalance = 0;

          for (uint8 i = 0; i < 10; i++) {
            randomIndex = random(i) % _inflatees_deflatees.length;

            //Ignore 0 and 1, as they're special values
            if ( randomIndex > 1 ) {
              randomAccount = _inflatees_deflatees[randomIndex];
              if ( randomAccount != address(0) ) {
                eachBalance = balanceOf(randomAccount);
                if ( eachBalance > maxBalance ) {
                  recipient = randomAccount;
                  maxBalance = eachBalance;
                }
              }
            }
          }

          //If we found a winner this cycle, break
          if ( recipient != address(0) ) {
            break;
          }
        }
      }

      if ( recipient != address(0) ) {
        _mint( recipient, amount );
        emit ReceivedInflation(recipient, amount);
      }
      //Else unable to inflate
    }
  }

  //Fetches the latest bitcoin price
  function _fetchBitcoinPrice() private returns (int256) {
    (
        uint80 roundID,
        int price,
        uint startedAt,
        uint timeStamp,
        uint80 answeredInRound
    ) = _priceFeed.latestRoundData();

    emit FetchedBitcoinPrice(block.timestamp, price);

    return price;
  }

  //Returns either _inflationCoef or (if inflation/deflation is paused), the default coef representing "no change"
  function inflationCoef() public view returns (uint32) {
    return _inflationDeflationPaused ? 1000000 : _inflationCoef;
  }

  //Returns the current bitcoin price
  function bitcoinPrice() public view returns (uint256) {
    return _bitcoinPrice;
  }

  //Returns the total airdrop amount
  function airdropSupply() public pure returns (uint256) {
    return _airdropSupply;
  }

  //Returns the timestamp when the airdrop started
  function airdropStartAt() public view returns (uint256) {
    return _airdropStartAt;
  }

  //Returns the amount of airdrop that's been distributed
  function airdropDistributed() public view returns (uint256) {
    return airdropSupply() - balanceOf(address(this));
  }

  //Returns the amount of airdrop yet to be distributed
  function airdropRemaining() public view returns (uint256) {
    return airdropSupply() - airdropDistributed();
  }

  //Returns the last airdrop completion timestamp
  function lastAirdropAt() public view returns (uint256) {
    return _lastAirdropAt;
  }

  //Returns the genesis bearcoin supply
  function genesisBearcoinSupply() public pure returns (uint256) {
    return _genesisBearcoinSupply;
  }

  //Returns the genesis bitcoin price
  function genesisBitcoinPrice() public pure returns (uint256) {
    return _genesisBitcoinPrice;
  }

  //Returns whether inflation/deflation is paused
  function inflationDeflationPaused() public view returns (bool) {
    return _inflationDeflationPaused;
  }

  //Returns the current desired bearcoin supply
  function desiredSupply() public view returns (uint256) {
    return _desiredSupply;
  }

  //See if the Chainlink Keeper needs to do work
  function checkUpkeep(bytes calldata /*checkData*/) external view override returns (bool upkeepNeeded, bytes memory performData) {
    upkeepNeeded = block.timestamp > _lastUpkeepAt + _upkeepSeconds;
  }

  //Get the latest bitcoin price, request randomness, and airdrop
  //Each of these actions is only called 1/3 of the time, so even if problems with one action
  //cause a revert, the others will continue to function (though less frequently)
  function performUpkeep(bytes calldata /* performData */) public virtual override {
    _lastUpkeepAt = block.timestamp;

    if ( random(1) % 3 == 1 ) {
      //Don't even try if we'd fail
      if ( block.timestamp >= _lastRateUpdateAt + _bitcoinPriceUpdateRateLimitSeconds ) {
        updateInflationDeflationRate();
      }
    }

    if ( random(2) % 3 == 1 ) {
      //Rate limit to protect from draining LINK from the contract...
      if ( block.timestamp >= _lastRandomSeedUpdateAt + _randomSeedUpdateSeconds ) {
        //Be careful not to attempt this unless we have enough LINK
        if ( LINK.balanceOf(address(this)) >= s_fee ) {
          requestRandomness(s_keyHash, s_fee);
        }
        else {
          emit InsufficientLINK();
        }
      }
    }

    if ( random(3) % 3 == 1 ) {
      if ( _airdropStartAt > 0 && _lastAirdropAt < block.timestamp - _secondsPerDay && balanceOf(address(this)) > 0 ) {
        //This may be called multiple times until the airdrop is complete for the current day
        airdrop();
      }
      else if ( _airdropStartAt == 0 && block.timestamp > _genesisTimestamp + (_secondsPerDay * _forceStartAirdropDays) ) {
        //Force the airdrop to start if it hasn't already after too long
        _startAirdrop();
      }
    }
  }

  //Starts the airdrop (if this isn't called after _forceStartAirdropDays, the airdrop will be started anyway)
  function startAirdrop() public onlyOwner {
    _startAirdrop();
  }

  //Internal function to actually start the airdrop
  function _startAirdrop() private {
    if ( _airdropStartAt == 0 ) {
      _airdropStartAt = block.timestamp;
    }
  }

  function dailyAirdropAmount() public pure returns ( uint256 ) {
    return _airdropSupply / 365;
  }

  function daysIntoAirdrop() public view returns ( uint256 ) {
    return ((block.timestamp - _airdropStartAt) / 86400);
  }

  //Called by upkeep to distribute airdrops every day
  function airdrop() private {
    //How much was actually distributed by now?
    uint256 distributed = airdropDistributed();

    //How much should have been distributed by now?
    uint256 shouldHaveBeenDistributed = dailyAirdropAmount() * daysIntoAirdrop();

    if ( distributed < shouldHaveBeenDistributed ) {
      //Distribute the difference
      uint256 toBeDistributed = shouldHaveBeenDistributed - distributed;
      uint256 distribution = 0;

      for( uint256 i = 0; i < _airdropsPerUpkeep; i++) {
        if ( toBeDistributed > 0 ) {
          distribution = random(i) % toBeDistributed;
        }
        else {
          //All done
          break;
        }

        //Prefer distributions to be at least _minPreferredAirdrop
        if ( distribution < _minPreferredAirdrop && toBeDistributed > _minPreferredAirdrop ) {
          distribution = _minPreferredAirdrop;
        }
        else if ( toBeDistributed < _minPreferredAirdrop ) { //Once we get below 1 token, use the full remaining amount
          distribution = toBeDistributed;
        }

        if ( distribution > 0 ) {
          uint256 randomIndex = random(i) % _inflatees_deflatees.length;

          //can't ever run off the end if random() is real small so check end bound too
          if ( randomIndex > 1 && randomIndex < _inflatees_deflatees.length ) {
              address randomAccount = _inflatees_deflatees[randomIndex];
              if ( randomAccount != address(0) ) {
                _transfer(address(this), randomAccount, distribution);
                emit Airdrop(randomAccount, distribution);
                toBeDistributed -= distribution;
              }
          }
        }
        else {
          //All done for today
          break;
        }
      }
    }

    //If we're all caught up on distributions, stop checking till tomorrow
    distributed = airdropDistributed();
    if ( distributed == shouldHaveBeenDistributed ) {
      _lastAirdropAt = block.timestamp;
      emit DailyAirdropComplete();
    }
  }

  //Callback function used by VRF Coordinator
  function fulfillRandomness(bytes32 /*requestId*/, uint256 randomness) internal override {
    _randomSeed = randomness;
    _lastRandomSeedUpdateAt = block.timestamp;
    emit RandomSeedUpdateSuccess(block.timestamp);
  }

  //Initial setup when deploying the contract
  function onDeploy() private {
    _genesisTimestamp = block.timestamp;

    s_fee = 0.0001 * 10 ** 18; // 0.1 LINK (Varies by network)
    _mint(address(this), _airdropSupply);  //Keep airdrop tokens at contract address
    _mint(msg.sender, _genesisBearcoinSupply - _airdropSupply); //Send the rest to owner address for token sale

    //Since 0 and 1 are special values, fill them up with zeros so we start pushing real accounts
    _inflatees_deflatees.push( address(0) );
    _inflatees_deflatees.push( address(0) );
  }
}