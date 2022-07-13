// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract Utilities is AccessControl {
    uint256 internal constant PARA_PRECISION = 1e18; // 1e18

    /* Treaury address */
    address internal constant TREASURY_ADDR = address(0);

    // timelock threshold
    uint256 internal constant MIN_STAKE_DAYS = 28;
    uint256 internal constant MAX_STAKE_DAYS = 2888;

    /* Stake shares Longer Pays Better bonus constants used by calcStakeShares() */
    uint256 internal constant LPB_D = 103;

    /* Stake shares Larger Pays Better bonus constants used by calcStakeShares() */
    uint256 internal constant LPB_A_CAP = 25 * 1e6;
    uint256 internal constant LPB_A_CAP_PARA = LPB_A_CAP * PARA_PRECISION;

    struct Stake {
        uint256 stakeId;
        uint256 stakedParas;
        uint256 stakeShares;
        uint256 pooledDay;
        uint256 stakedDays;
    }

    struct UserPosition {
        uint256 totalAmount; // total value staked by user in given pool
        uint256 rewardDebt; // house fee (?)
        uint256 lastStakeId;
        uint256 stakeSharesTotal;
        Stake[] stakes; // list of user stakes in pool subject to timelock
    }

    mapping(address => UserPosition) public userPositions; // staker => stake

    // We use virtual pool to determine a users share in the staking pool
    struct Pool {
        uint256 totalPooled;
        uint256 rewardsPerSecond;
        uint256 accParaPerShare; // distribution multiplier
        uint256 lastRewardTime;
    }

    Pool public virtualPool;

    /* Period data */
    struct DailyDataStore {
        uint80 dayPayoutTotal;
        uint80 dayStakeSharesTotal;
    }

    mapping(uint256 => DailyDataStore) public dailyData;

    event StartStake(
        uint256 timestamp,
        address indexed stakerAddr,
        uint256 indexed stakeId,
        uint256 stakedParas,
        uint256 stakedDays
    );

    event EndStake(
        uint256 timestamp,
        address indexed stakerAddr,
        uint256 indexed stakeId,
        uint256 payout,
        uint256 servedDays
    );

    function _addStake(
        Stake[] storage stakeListRef,
        uint256 newStakeId,
        uint256 newStakedParas,
        uint256 newStakeShares,
        uint256 newPooledDay,
        uint256 newStakedDays
    )
        internal
    {
        stakeListRef.push(
            Stake(
                newStakeId,
                uint256(newStakedParas),
                uint256(newStakeShares),
                uint256(newPooledDay),
                uint256(newStakedDays)
            )
        );
    }

    /**
     * @dev Efficiently delete from an unordered array by moving the last element
     * to the "hole" and reducing the array length. Can change the order of the list
     * and invalidate previously held indexes.
     * @notice stakeListRef length and stakeIndex are already ensured valid in endStake()
     * @param stakeListRef reference to staked[stakerAddr] array in storage
     * @param stakeIndex index of the element to delete
     */
    function _removeStakeFromList(Stake[] storage stakeListRef, uint256 stakeIndex)
        internal
    {
        uint256 lastIndex = stakeListRef.length - 1;

        /* Skip the copy if element to be removed is already the last element */
        if (stakeIndex != lastIndex) {
            /* Copy last element to the requested element's "hole" */
            stakeListRef[stakeIndex] = stakeListRef[lastIndex];
        }

        /*
            Reduce the array length now that the array is contiguous.
            Surprisingly, 'pop()' uses less gas than 'stakeListRef.length = lastIndex'
        */
        stakeListRef.pop();
    }
}