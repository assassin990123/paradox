/* eslint-disable node/no-unsupported-features/es-builtins */
/* eslint-disable prettier/prettier */
import { expect } from "chai";
import { ethers, network } from "hardhat";

const ONE_B_PARA = BigInt(1_000_000_000 * 10 ** 18);
const ONE_M_PARA = BigInt(1_000_000 * 10 ** 18);
const TWO_M_PARA = BigInt(2_000_000 * 10 ** 18);

const ONE_HUNDRED_DAYS = BigInt(100 * 24 * 60 * 60);
const MIN_STAKE_DAYS = BigInt(28 * 24 * 60 * 60);
const MAX_STAKE_DAYS = BigInt(2888 * 24 * 60 * 60);
const ONE_DAY = BigInt(24 * 60 * 60);

const RPS = BigInt((5000 / (24 * 60 * 60)) * 10 ** 18);

let para: any, staker: any;
let alice: any, bob: any, charlie: any, rewardsPool: any;

const deployContract = async (contract: string, params: any[]) => {
	let con: any;
	const c = await ethers.getContractFactory(contract);
	if (params) con = await c.deploy(...params);
	else con = await c.deploy();
	return await con.deployed();
};

const deployContracts = async (rewardsPool: any) => {
	const para = await deployContract("ParadoxTokeneqe", []);
	const staker = await deployContract("StakePool", [
		para.address,
		RPS,
		rewardsPool.address
	]);

	return {
		para,
		staker
	};
};

const _formatEther = (amount: any) => {
	return Number(ethers.utils.formatEther(amount));
};

const poolChecks = (
	pool: any,
	expectedAmount: any,
	expectedRPS: any,
	expectedParaPerShare: any
  ) => {
	console.log(_formatEther(pool.rewardsPerSecond).toFixed(2));
	expect(_formatEther(pool.totalPooled)).to.equal(expectedAmount);
	expect(_formatEther(pool.rewardsPerSecond).toFixed(2)).to.equal(expectedRPS);
	expect(_formatEther(pool.accParaPerShare).toFixed(1)).to.equal(expectedParaPerShare);
};

const userChecks = (
	userPosition: any,
	expectedAmount: any,
	expectedDebt: any,
	stakeLength: any,
	expectedStakeShares: any
  ) => {
	expect(_formatEther(userPosition.totalAmount)).to.equal(expectedAmount);
	expect(_formatEther(userPosition.rewardDebt).toFixed(0)).to.equal(expectedDebt);
	expect(userPosition.stakes.length).to.equal(stakeLength);
	expect(userPosition.lastStakeId).to.equal(stakeLength);
	expect(_formatEther(userPosition.stakeSharesTotal).toFixed(0)).to.equal(expectedStakeShares);
};

describe("Staker", function () {
	beforeEach(async () => {
		[alice, bob, charlie, rewardsPool] = await ethers.getSigners();
		({ para, staker } = await deployContracts(rewardsPool));
	});

  describe("Start Stake", async () => {
    it("Should have lenght more than 28 days.", async () => {
		// transfer 1M para to Bob and Charlie
		await para.transfer(bob.address, ONE_M_PARA);
		await para.transfer(charlie.address, ONE_M_PARA);

		// check user balances
		expect(_formatEther(await para.balanceOf(alice.address))).to.equal(_formatEther(ONE_B_PARA - TWO_M_PARA));
		expect(_formatEther(await para.balanceOf(bob.address))).to.equal(_formatEther(ONE_M_PARA));
		expect(_formatEther(await para.balanceOf(charlie.address))).to.equal(_formatEther(ONE_M_PARA));

		// approve 1M para to staker contract
		await para.connect(alice).approve(staker.address, ONE_M_PARA);
		await para.connect(bob).approve(staker.address, ONE_M_PARA);
		await para.connect(charlie).approve(staker.address, ONE_M_PARA);

		// start stake
		try {
			await staker.stake(ONE_M_PARA, MIN_STAKE_DAYS - ONE_DAY);
		} catch (error: any) {
			expect(error.message).match(
				/PARA: newStakedDays lower than minimum/
			);
		}
	});
    it("Should have lenght less than 2888 days.", async () => {
		// transfer 1M para to Bob and Charlie
		await para.transfer(bob.address, ONE_M_PARA);
		await para.transfer(charlie.address, ONE_M_PARA);

		// check user balances
		expect(_formatEther(await para.balanceOf(alice.address))).to.equal(_formatEther(ONE_B_PARA - TWO_M_PARA));
		expect(_formatEther(await para.balanceOf(bob.address))).to.equal(_formatEther(ONE_M_PARA));
		expect(_formatEther(await para.balanceOf(charlie.address))).to.equal(_formatEther(ONE_M_PARA));

		// approve 1M para to staker contract
		await para.connect(alice).approve(staker.address, ONE_M_PARA);
		await para.connect(bob).approve(staker.address, ONE_M_PARA);
		await para.connect(charlie).approve(staker.address, ONE_M_PARA);

		// start stake
		try {
			await staker.stake(ONE_M_PARA, MAX_STAKE_DAYS + ONE_DAY);
		} catch (error: any) {
			expect(error.message).match(
				/PARA: newStakedDays higher than maximum/
			);
		}
	});
    it("Should have precalculated stakeshare.", async () => {
		// transfer 1M para to Bob and Charlie
		await para.transfer(bob.address, ONE_M_PARA);
		await para.transfer(charlie.address, ONE_M_PARA);

		// check user balances
		expect(_formatEther(await para.balanceOf(alice.address))).to.equal(_formatEther(ONE_B_PARA - TWO_M_PARA));
		expect(_formatEther(await para.balanceOf(bob.address))).to.equal(_formatEther(ONE_M_PARA));
		expect(_formatEther(await para.balanceOf(charlie.address))).to.equal(_formatEther(ONE_M_PARA));

		// approve 1M para to staker contract
		await para.connect(alice).approve(staker.address, ONE_M_PARA);
		await para.connect(bob).approve(staker.address, ONE_M_PARA);
		await para.connect(charlie).approve(staker.address, ONE_M_PARA);

		// stake 1M para
		await staker.stake(ONE_M_PARA, ONE_HUNDRED_DAYS); // stake 100 days

		// check pool
		const pool = await staker.virtualPool();
		poolChecks(pool, 1_000_000, "0.06", "0.0");

		// check the userposition - amount bonus: 40,000, length bonus: 699,029, staked amount: 1,000,000
		const userPosition = await staker.getUserPosition(alice.address);
		userChecks(userPosition, 1_000_000, "0", 1, "1739029"); // t_amount, rewardDebt, stakeLength, totalStakeShares
	});
  });

  describe("End Stake", async () => {
    it("Should return staked Para and rewards based on the stakeshare.", async () => {
		// transfer 1M para to Bob and Charlie
		await para.transfer(bob.address, ONE_M_PARA);
		await para.transfer(charlie.address, ONE_M_PARA);

		// check user balances
		expect(_formatEther(await para.balanceOf(alice.address))).to.equal(_formatEther(ONE_B_PARA - TWO_M_PARA));
		expect(_formatEther(await para.balanceOf(bob.address))).to.equal(_formatEther(ONE_M_PARA));
		expect(_formatEther(await para.balanceOf(charlie.address))).to.equal(_formatEther(ONE_M_PARA));

		// approve 1M para to staker contract
		await para.connect(alice).approve(staker.address, ONE_M_PARA);
		await para.connect(bob).approve(staker.address, ONE_M_PARA);
		await para.connect(charlie).approve(staker.address, ONE_M_PARA);

		// stake 1M para
		await staker.stake(ONE_M_PARA, ONE_HUNDRED_DAYS);

		// fast forward staked days
		await network.provider.send("evm_increaseTime", [ONE_HUNDRED_DAYS]);
		await network.provider.send("evm_mine");
		
		// check pool
		const pool = await staker.virtualPool();
		// poolChecks(pool, 1_000_000, "0.06", "0.0");

		// // check the stake return - amount bonus: 40000, length bonus: 699029
		// let stakeReturn, payout, penalty, cappedPenalty;
		// // eslint-disable-next-line prefer-const
		// [stakeReturn, payout, penalty, cappedPenalty] = await staker.getStakeRewards(alice.address, 0);

		// console.log(stakeReturn, payout, penalty, cappedPenalty);
		// // end stake
		// await staker.endStake(0, 1);

		// // check user balance
		// expect(await para.balanceOf(alice.address)).to.equal(0);
	});
    it("Should apply penalty before 28 days", async () => {
		// transfer 1M para to Bob and Charlie
		await para.transfer(bob.address, ONE_M_PARA);
		await para.transfer(charlie.address, ONE_M_PARA);

		// check user balances
		expect(_formatEther(await para.balanceOf(alice.address))).to.equal(_formatEther(ONE_B_PARA - TWO_M_PARA));
		expect(_formatEther(await para.balanceOf(bob.address))).to.equal(_formatEther(ONE_M_PARA));
		expect(_formatEther(await para.balanceOf(charlie.address))).to.equal(_formatEther(ONE_M_PARA));

		// approve 1M para to staker contract
		await para.connect(alice).approve(staker.address, ONE_M_PARA);
		await para.connect(bob).approve(staker.address, ONE_M_PARA);
		await para.connect(charlie).approve(staker.address, ONE_M_PARA);

		// stake 1M para
		await staker.stake(ONE_M_PARA, ONE_HUNDRED_DAYS);

		// fast forward staked days
		await network.provider.send("evm_increaseTime", [MIN_STAKE_DAYS - ONE_DAY]);
		await network.provider.send("evm_mine");
		
		// check pool
		const pool = await staker.virtualPool();
		poolChecks(pool, 1_000_000, "0.06", "0.0");

		// check the stake return - amount bonus: 40000, length bonus: 699029
		let stakeReturn, payout, penalty, cappedPenalty;
		// eslint-disable-next-line prefer-const
		[stakeReturn, payout, penalty, cappedPenalty] = await staker.getStakeRewards(alice.address, 0);

		console.log(stakeReturn, payout, penalty, cappedPenalty);
		// end stake
		await staker.endStake(0, 1);

		// check user balance
		expect(await para.balanceOf(alice.address)).to.equal(0);
	});
  });

  describe("Stake overview", async () => {
    it("Alice, Bob and Charlie each stake 1,000,000 PARA for 100 days.", async () => {
		// transfer 1M para to Bob and Charlie
		await para.transfer(bob.address, ONE_M_PARA);
		await para.transfer(charlie.address, ONE_M_PARA);

		// check user balances
		expect(_formatEther(await para.balanceOf(alice.address))).to.equal(_formatEther(ONE_B_PARA - TWO_M_PARA));
		expect(_formatEther(await para.balanceOf(bob.address))).to.equal(_formatEther(ONE_M_PARA));
		expect(_formatEther(await para.balanceOf(charlie.address))).to.equal(_formatEther(ONE_M_PARA));

		// approve 1M para to staker contract
		await para.connect(alice).approve(staker.address, ONE_M_PARA);
		await para.connect(bob).approve(staker.address, ONE_M_PARA);
		await para.connect(charlie).approve(staker.address, ONE_M_PARA);

		// stake 1M para
		await staker.stake(ONE_M_PARA, ONE_HUNDRED_DAYS);
		await staker.connect(bob).stake(ONE_M_PARA, ONE_HUNDRED_DAYS);
		await staker.connect(charlie).stake(ONE_M_PARA, ONE_HUNDRED_DAYS);

		// fast forward staked days
		await network.provider.send("evm_increaseTime", [ONE_HUNDRED_DAYS]);
		await network.provider.send("evm_mine");

		// check pool
		const pool = await staker.virtualPool();
		poolChecks(pool, 1_000_000, "0.06", "0.0");

		// check the stake return - amount bonus: 40000, length bonus: 699029
		let stakeReturn, payout, penalty, cappedPenalty;
		// eslint-disable-next-line prefer-const
		[stakeReturn, payout, penalty, cappedPenalty] = await staker.getStakeRewards(alice.address, 0);

		console.log(stakeReturn, payout, penalty, cappedPenalty);

		// end stake
		await staker.endStake(0, 1);

		// check user balance
		expect(await para.balanceOf(alice.address)).to.equal(0);
		expect(await para.balanceOf(bob.address)).to.equal(0);
		expect(await para.balanceOf(charlie.address)).to.equal(0);
	});
    it("Alice, Bob and Charlie each stake 1,000,000 PARA for 100 days, Bob end stake 50 days after.", async () => {
		// transfer 1M para to Bob and Charlie
		await para.transfer(bob.address, ONE_M_PARA);
		await para.transfer(charlie.address, ONE_M_PARA);

		// check user balances
		expect(_formatEther(await para.balanceOf(alice.address))).to.equal(_formatEther(ONE_B_PARA - TWO_M_PARA));
		expect(_formatEther(await para.balanceOf(bob.address))).to.equal(_formatEther(ONE_M_PARA));
		expect(_formatEther(await para.balanceOf(charlie.address))).to.equal(_formatEther(ONE_M_PARA));

		// approve 1M para to staker contract
		await para.connect(alice).approve(staker.address, ONE_M_PARA);
		await para.connect(bob).approve(staker.address, ONE_M_PARA);
		await para.connect(charlie).approve(staker.address, ONE_M_PARA);

		// stake 1M para
		await staker.stake(ONE_M_PARA, ONE_HUNDRED_DAYS);
		await staker.connect(bob).stake(ONE_M_PARA, ONE_HUNDRED_DAYS);
		await staker.connect(charlie).stake(ONE_M_PARA, ONE_HUNDRED_DAYS);

		// fast forward 50 days
		await network.provider.send("evm_increaseTime", [ONE_HUNDRED_DAYS / BigInt(2)]);
		await network.provider.send("evm_mine");

		// check pool
		const pool = await staker.virtualPool();
		poolChecks(pool, 1_000_000, "0.06", "0.0");

		// check the stake return - amount bonus: 40000, length bonus: 699029
		let stakeReturn, payout, penalty, cappedPenalty;
		// eslint-disable-next-line prefer-const
		[stakeReturn, payout, penalty, cappedPenalty] = await staker.getStakeRewards(alice.address, 0);

		console.log(stakeReturn, payout, penalty, cappedPenalty);

		// end stake
		await staker.endStake(0, 1);

		// check user balance
		expect(await para.balanceOf(alice.address)).to.equal(0);
		expect(await para.balanceOf(bob.address)).to.equal(0);
		expect(await para.balanceOf(charlie.address)).to.equal(0);
	});
    it("Alice, Bob and Charlie each stake 1,000,000 PARA for 100 days, Charlie add stake 1,000,000 PARA 50 days after the first stake", async () => {

	});
  });
});
