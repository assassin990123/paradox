// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/AccessControl.sol";

interface IPARA {
    function mint(address to, uint256 amount) external;
    function burn(uint256 amount) external;
}
contract StakePool is AccessControl {
    // bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

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
    uint256 private constant HEARTS_PER_HEX = 10 ** 16; // 1e16
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

    Pool  virtualPool;

    mapping(address => Pool) public Pools; // token => pool

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

        uint256 newStakeShares = calcStakeShares(newStakedHearts, newStakedDays);

        // get user position
        UserPosition memory stake = userPositions[msg.sender];
        Stake[] storage 

        /*
            The startStake timestamp will always be part-way through the current
            day, so it needs to be rounded-up to the next day to ensure all
            stakes align with the same fixed calendar days. The current day is
            already rounded-down, so rounded-up is current day + 1.
        */
        uint256 newPooledDay = stake.currentDay + 1;

        /* Create Stake */
        uint48 newStakeId = ++stake.lastStakeId;
        _addStake(
            stake.stakes,
            newStakeId,
            newStakedHearts,
            newStakeShares,
            newPooledDay,
            newStakedDays
        );

        // burn 33% of the amount
        PARA.burn(newStakedHearts * 33 / 100);
    }

    /**
     * @dev Calculate stakeShares for a new stake, including any bonus
     * @param newStakedHearts Number of Hearts to stake
     * @param newStakedDays Number of days to stake
     */
    function calcStakeShares(uint256 newStakedHearts, uint256 newStakedDays)
        private
        pure
        returns (uint256)
    {
        /*
            LONGER PAYS BETTER:
            If longer than 28 day stake is committed to, each extra day
            gives bonus shares of approximately 0.0548%, which is approximately 20%
            extra per year of increased stakelength committed to, but capped to a
            maximum of 200% extra.
            extraDays       =  stakedDays - 28
            longerBonus%    = (extraDays / 364) * 20%
                            = (extraDays / 364) / 5
                            =  extraDays / 1820
                            =  extraDays / LPB_D
            extraDays       =  longerBonus% * 1820
            extraDaysCap    =  longerBonusCap% * 1820
                            =  200% * 1820
                            =  3640
                            =  LPB_D_CAP_DAYS
            longerAmount    =  hearts * longerBonus%
            LARGER PAYS BETTER:
            Bonus percentage scaled 0% to 10% for the first 150M HEX of stake.
            largerBonus%    = (hearts / 150e14) * 10%
                            = (hearts / 150e14) / 10
                            =  hearts / 150e15
            largerAmount    =  hearts * largerBonus%
            combinedBonus%  =         longerBonus%  +  largerBonus%
                                        extraWeeks     hearts
                            =           ----------  +  ------
                                            260        150e15
                                extraDays * 150e15     hearts * 1820
                            =   ------------------  +  -------------
                                   1820 * 150e15       1820 * 150e15
                                extraDays * 150e15     hearts * 1820
                            =   ------------------  +  -------------
                                  1820 * 150e15        1820 * 150e15
                                extraDays * 150e15  +  hearts * 1820
                            =   ------------------------------------
                                            1820 * 150e15
            combinedAmount  = hearts * combinedBonus%
                            = hearts * (extraDays * 150e15  +  hearts * 1820)  / (1820 * 150e15)
                            = hearts * (extraDays * LPB_H   +  hearts * LPB_D) / (LPB_D * LPB_H)
            stakeShares     = hearts + combinedAmount
        */
        uint256 cappedExtraDays = 0;

        /* Must be more than 28 day for Longer-Pays-Better */
        if (newStakedDays > 28) {
            cappedExtraDays = newStakedDays <= LPB_D_CAP_DAYS ? newStakedDays - 1 : LPB_D_CAP_DAYS;
        }

        uint256 cappedStakedHearts = newStakedHearts <= LPB_H_CAP_HEARTS
            ? newStakedHearts
            : LPB_H_CAP_HEARTS;

        uint256 combinedAmount = cappedExtraDays * LPB_H + cappedStakedHearts * LPB_D;
        combinedAmount = newStakedHearts * combinedAmount / (LPB_D * LPB_H);

        return newStakedHearts + combinedAmount;
    }

    function addPool(uint _rewardsPerSecond) public onlyRole(DEFAULT_ADMIN_ROLE) {
        virtualPool = Pool({
            totalPooled: 0,
            rewardsPerSecond: _rewardsPerSecond,
            accParaPerShare: 0,
            lastRewardTime: block.timestamp
        });
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