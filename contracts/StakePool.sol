// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IPARA {
    function mint(address to, uint256 amount) external;
    function burn(uint256 amount) external;
}
contract StakePool is AccessControl {
    using SafeERC20 for IERC20;

    uint256 private constant HEARTS_PER_HEX = 1e18; // 1e18

    // para token
    address internal para;
    IPARA internal PARA;

    // timelock threshold
    uint internal constant MIN_STAKE_DAYS = 28 days;
    uint internal constant MAX_STAKE_DAYS = 2888 days;

    /* Stake shares Longer Pays Better bonus constants used by calcStakeShares() */
    uint256 private constant LPB_D_BONUS_PERCENT = 20;
    uint256 private constant LPB_D_BONUS_CAP_PERCENT = 200;
    uint256 internal constant LPB_D = 364 * 100 / LPB_D_BONUS_PERCENT;
    uint256 internal constant LPB_D_CAP_DAYS = LPB_D * LPB_D_BONUS_CAP_PERCENT / 100;

    /* Stake shares Larger Pays Better bonus constants used by calcStakeShares() */
    uint256 private constant LPB_H_BONUS_PERCENT = 10;
    uint256 private constant LPB_H_CAP_HEX = 25 * 1e6;
    uint256 internal constant LPB_H_CAP_HEARTS = LPB_H_CAP_HEX * HEARTS_PER_HEX;
    uint256 internal constant LPB_H = LPB_H_CAP_HEARTS * 100 / LPB_H_BONUS_PERCENT;

    struct Stake {
        uint48 stakeId;
        uint80 stakedHearts;
        uint80 stakeShares;
        uint16 pooledDay;
        uint16 stakedDays;
        uint16 unpooledDay;
    }

    struct UserPosition {
        uint256 totalAmount; // total value staked by user in given pool
        uint256 rewardDebt; // house fee (?)
        uint48 lastStakeId;
        uint256 currentDay;
        Stake[] stakes; // list of user stakes in pool subject to timelock
    }

    mapping(address => UserPosition) public userPositions; // staker => stake

    // We use virtual pool to determine a users share in the staking pool
    struct Pool {
        uint totalPooled;
        uint rewardsPerSecond;
        uint accParaPerShare; // distribution multiplier
        uint lastRewardTime;
    }
    Pool internal virtualPool;

    constructor(address _para, uint _rewardsPerSecond) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        // _grantRole(MINTER_ROLE, msg.sender);

        para = _para;
        PARA = IPARA(_para);

        addPool(_rewardsPerSecond);
    }

    function stake(uint newStakedHearts, uint newStakedDays) public {
        /* Make sure staked amount is non-zero */
        require(newStakedHearts != 0, "PARA: amount must be non-zero");

        /* enforce the minimum stake time */
        require(newStakedDays >= MIN_STAKE_DAYS, "PARA: newStakedDays lower than minimum");

        /* enforce the maximum stake time */
        require(newStakedDays <= MAX_STAKE_DAYS, "PARA: newStakedDays higher than maximum");

        Pool memory vPool = updatePool();

        uint256 newStakeShares = _stakeStartBonusHearts(newStakedHearts, newStakedDays);
        uint256 rewardDebt = (newStakedHearts * vPool.accParaPerShare) / HEARTS_PER_HEX;

        // get user position
        UserPosition storage userPosition = userPositions[msg.sender];
        userPosition.rewardDebt = rewardDebt;

        /*
            The startStake timestamp will always be part-way through the current
            day, so it needs to be rounded-up to the next day to ensure all
            stakes align with the same fixed calendar days. The current day is
            already rounded-down, so rounded-up is current day + 1.
        */
        uint256 newPooledDay = userPosition.currentDay + 1;

        /* Create Stake */
        uint48 newStakeId = ++userPosition.lastStakeId;
        _addStake(
            userPosition.stakes,
            newStakeId,
            newStakedHearts,
            newStakeShares,
            newPooledDay,
            newStakedDays
        );

        // update pool share
        virtualPool.totalPooled += newStakeShares;

        // burn 33% of the amount
        PARA.burn(newStakedHearts * 33 / 100);

        /* Transfer staked Hearts to contract */
        IERC20(para).safeTransferFrom(msg.sender, address(this), newStakedHearts);
    }

    /**
     * @dev Calculate stakeShares for a new stake, including any bonus
     * @param newStakedHearts Number of Hearts to stake
     * @param newStakedDays Number of days to stake
     */
    
    function _stakeStartBonusHearts(uint256 newStakedHearts, uint256 newStakedDays)
        private
        pure
        returns (uint256 bonusHearts)
    {
        uint256 cappedExtraDays = 0;

        /* Must be more than 1 day for Longer-Pays-Better */
        if (newStakedDays > 1) {
            cappedExtraDays = newStakedDays <= MAX_STAKE_DAYS ? newStakedDays - 1 : MAX_STAKE_DAYS;
        }

        uint256 cappedStakedHearts = newStakedHearts <= LPB_H_CAP_HEARTS
            ? newStakedHearts
            : LPB_H_CAP_HEARTS;

        bonusHearts = cappedExtraDays * LPB_D + cappedStakedHearts * LPB_H;
        bonusHearts = newStakedHearts * bonusHearts / (LPB_D * LPB_H);

        return bonusHearts;
    }

    function addPool(uint _rewardsPerSecond) public onlyRole(DEFAULT_ADMIN_ROLE) {
        virtualPool = Pool({
            totalPooled: 0,
            rewardsPerSecond: _rewardsPerSecond,
            accParaPerShare: 0,
            lastRewardTime: block.timestamp
        });
    }
    
    function updatePool() internal returns (Pool memory _virtualPool) {
        uint256 tokenSupply = IERC20(para).balanceOf(address(this));
        uint256 accParaPerShare;
        if (block.timestamp > virtualPool.lastRewardTime) {
            if (tokenSupply > 0) {
                uint256 passedTime = block.timestamp - virtualPool.lastRewardTime;
                uint256 caplReward = passedTime * virtualPool.rewardsPerSecond;
                accParaPerShare =
                    virtualPool.accParaPerShare +
                    (caplReward * HEARTS_PER_HEX) /
                    tokenSupply;
            }
            uint256 lastRewardTime = block.timestamp;

            virtualPool.lastRewardTime = lastRewardTime;
            virtualPool.accParaPerShare = accParaPerShare;

            return virtualPool;
        }
    }

    function _addStake(
        Stake[] storage stakeListRef,
        uint48 newStakeId,
        uint256 newStakedHearts,
        uint256 newStakeShares,
        uint256 newPooledDay,
        uint256 newStakedDays
    )
        internal
    {
        stakeListRef.push(
            Stake(
                newStakeId,
                uint80(newStakedHearts),
                uint80(newStakeShares),
                uint16(newPooledDay),
                uint16(newStakedDays),
                uint16(0) // unpooledDay
            )
        );
    }

}