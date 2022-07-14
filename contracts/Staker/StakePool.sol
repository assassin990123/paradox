// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./Utilities.sol";
import "hardhat/console.sol";

interface IPARA {
    function mint(address to, uint256 amount) external;
    function burn(uint256 amount) external;
}

contract StakePool is AccessControl, Utilities {
    using SafeERC20 for IERC20;
 
    // para token
    address internal para;
    IPARA internal PARA;

    // rewards pool - 33% of the staked PARA will be sent to this pool
    address rewardsPoolAddress;

    constructor(address _para, uint256 _rewardsPerSecond, address _rewardsPoolAddress) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        // _grantRole(MINTER_ROLE, msg.sender);

        // the governance token
        para = _para;
        PARA = IPARA(_para);
        rewardsPoolAddress = _rewardsPoolAddress;

        addPool(_rewardsPerSecond);
    }

    function stake(uint256 newStakedParas, uint256 newStakedDays) public {
        /* Make sure staked amount is non-zero */
        require(newStakedParas != 0, "PARA: amount must be non-zero");

        /* enforce the minimum stake time */
        require(newStakedDays >= MIN_STAKE_DAYS, "PARA: newStakedDays lower than minimum");

        /* enforce the maximum stake time */
        require(newStakedDays <= MAX_STAKE_DAYS, "PARA: newStakedDays higher than maximum");

        Pool memory vPool = updatePool();

        uint256 newStakeShares = _stakeStartBonusParas(newStakedParas, newStakedDays);
        uint256 rewardDebt = (newStakedParas * vPool.accParaPerShare) / PARA_PRECISION;

        // get user position
        UserPosition storage userPosition = userPositions[msg.sender];
        userPosition.rewardDebt = rewardDebt;
        userPosition.lastStakeId += 1;
        userPosition.stakeSharesTotal += newStakeShares;
        userPosition.totalAmount += newStakedParas;

        /*
            The startStake timestamp will always be part-way through the current
            day, so it needs to be rounded-up to the next day to ensure all
            stakes align with the same fixed calendar days. The current day is
            already rounded-down, so rounded-up is current day + 1.
        */
        uint256 newPooledDay = block.timestamp / 1 days;

        /* Create Stake */
        uint256 newStakeId = userPosition.lastStakeId;
        _addStake(
            userPosition.stakes,
            newStakeId,
            newStakedParas,
            newStakeShares,
            newPooledDay,
            newStakedDays
        );

        emit StartStake(
            uint256(block.timestamp),
            msg.sender,
            newStakeId,
            newStakedParas,
            uint256(newStakedDays)
        );

        // update pool share
        virtualPool.totalPooled += newStakedParas;

        /* Transfer staked Paras to contract */
        IERC20(para).safeTransferFrom(msg.sender, address(this), newStakedParas);
        
        // burn 33% of the amount
        PARA.burn(newStakedParas * 33 / 100);

        // send the other 33% to the rewards pool
        IERC20(para).safeTransfer(rewardsPoolAddress, newStakedParas * 33 / 100);
    }

    /**
     * @dev PUBLIC FACING: Closes a stake. The order of the stake list can change so
     * a stake id is used to reject stale indexes.
     * @param stakeIndex Index of stake within stake list
     * @param stakeIdParam The stake's id
     */
    function endStake(uint256 stakeIndex, uint256 stakeIdParam)
        external
    {
        UserPosition storage userPosition = userPositions[msg.sender];
        Stake[] storage stakeListRef = userPosition.stakes;

        /* require() is more informative than the default assert() */
        require(stakeListRef.length != 0, "PARA: Empty stake list");
        require(stakeIndex < stakeListRef.length, "PARA: stakeIndex invalid");

        Stake storage stk = stakeListRef[stakeIndex];

        uint256 servedDays = 0;
        uint256 currentDay = block.timestamp / 1 days;
        servedDays = currentDay - stk.pooledDay;
        if (servedDays >= stk.stakedDays) {
            servedDays = stk.stakedDays;
        } else {
            revert("PARA: Locked stake");
        }

        // update pool status
        updatePool();
        virtualPool.totalPooled -= stk.stakedParas;

        uint256 stakeReturn;
        uint256 payout = 0;

        (stakeReturn, payout) = calcStakeReturn(userPosition, stk, servedDays);

        _unpoolStake(userPosition, stk);

        emit EndStake(
            uint256(block.timestamp),
            msg.sender,
            stakeIdParam,
            payout,
            uint256(servedDays)
        );

        if (stakeReturn != 0) {
            /* Transfer stake return from contract back to staker */
            IERC20(para).safeTransfer(msg.sender, stakeReturn);
        }

        _removeStakeFromList(stakeListRef, stakeIndex);
    }

    /**
     * @dev Calculate stakeShares for a new stake, including any bonus
     * @param newStakedParas Number of Paras to stake
     * @param newStakedDays Number of days to stake
     */
    
    function _stakeStartBonusParas(uint256 newStakedParas, uint256 newStakedDays)
        private
        pure
        returns (uint256 bonusParas)
    {
        /* Must be more than 1 day for Longer-Pays-Better */
        uint256 cappedExtraDays = newStakedDays - MIN_STAKE_DAYS;

        uint256 cappedStakedParas = newStakedParas <= LPB_A_CAP_PARA
            ? newStakedParas
            : LPB_A_CAP_PARA;

        bonusParas = newStakedParas * cappedExtraDays / LPB_D + newStakedParas * cappedStakedParas / LPB_A_CAP_PARA;
    }

    function calcStakeReturn(UserPosition memory usr, Stake memory st, uint256 servedDays)
        internal
        view
        returns (uint256 stakeReturn, uint256 payout)
    {
        payout = calcPayoutRewards(usr.stakeSharesTotal, st.pooledDay, st.pooledDay + servedDays, st.stakedDays);
        stakeReturn = st.stakedParas + payout;

        // get rewards based on the pool shares
        uint256 accParaPerShare = virtualPool.accParaPerShare;
        uint256 tokenSupply = IERC20(para).balanceOf(address(this));

        if (block.timestamp > virtualPool.lastRewardTime && tokenSupply != 0) {
            uint256 passedTime = block.timestamp - virtualPool.lastRewardTime;
            uint256 paraReward = passedTime * virtualPool.rewardsPerSecond;
            accParaPerShare =
                accParaPerShare +
                (paraReward * PARA_PRECISION) /
                tokenSupply;
        }
        uint256 pendingPoolShare =
            (((usr.totalAmount * accParaPerShare) / PARA_PRECISION)) -
            usr.rewardDebt;

        stakeReturn += pendingPoolShare;
        payout += pendingPoolShare;

        return (stakeReturn, payout);
    }

    /**
     * @dev PUBLIC FACING: Calculates total stake payout including rewards for a multi-day range
     * @param stakeShares param from stake to calculate bonus
     * @param beginDay first day to calculate bonuses for
     * @param endDay last day (non-inclusive) of range to calculate bonuses for
     * @param stakedDays staked days (non-inclusive) of range to calculate bonuses for
     * @return payout Paras
     */
    function calcPayoutRewards(uint256 stakeShares, uint256 beginDay, uint256 endDay, uint stakedDays)
        public
        pure
        returns (uint256 payout)
    {
        payout += (endDay - beginDay) / stakedDays *  stakeShares; // payout based on amount
        return payout;
    }
    
    function addPool(uint256 _rewardsPerSecond) public onlyRole(DEFAULT_ADMIN_ROLE) {
        virtualPool = Pool({
            totalPooled: 0,
            rewardsPerSecond: _rewardsPerSecond,
            accParaPerShare: 0,
            lastRewardTime: block.timestamp
        });
    }
    
    function updatePool() internal returns (Pool memory _vPool) {
        uint256 tokenSupply = IERC20(para).balanceOf(address(this));
        if (block.timestamp > virtualPool.lastRewardTime) {
            if (tokenSupply > 0) {
                uint256 passedTime = block.timestamp - virtualPool.lastRewardTime;
                uint256 paraReward = passedTime * virtualPool.rewardsPerSecond;
                virtualPool.accParaPerShare += 
                    (paraReward * PARA_PRECISION) /
                    tokenSupply;
            }
            uint256 lastRewardTime = block.timestamp;
            virtualPool.lastRewardTime = lastRewardTime;

            return virtualPool;
        }
    }

    function _unpoolStake(UserPosition storage usr, Stake storage st)
        internal
    {
        usr.totalAmount -= st.stakedParas;
        usr.stakeSharesTotal -= st.stakeShares;
    }

    /**
    Getters
     */
    function getUserPosition(address _usr) public view returns (UserPosition memory) {
        return userPositions[_usr];
    }

    function getStakeRewards(address _usr, uint256 _stkIdx) public view returns (uint256 stakeReturn, uint256 payout) {
        // get user
        UserPosition memory usr = getUserPosition(_usr);
        // get stake
        Stake memory stk = usr.stakes[_stkIdx];

        uint256 currentDay = block.timestamp / 1 days;
        uint256 servedDays = 0;

        servedDays = currentDay - stk.pooledDay;
        if (servedDays >= stk.stakedDays) {
            servedDays = stk.stakedDays;
        } else {
            return (0, 0);
        }

        (stakeReturn, payout) = calcStakeReturn(usr, stk, servedDays);
    }
}