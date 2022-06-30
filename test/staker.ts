/* eslint-disable prettier/prettier */
import { expect } from "chai";
import { ethers } from "hardhat";

const ONE_B_PARA = BigInt(1_000_000_000 * 10 ** 18);
const ONE_M_PARA = BigInt(1_000_000 * 10 ** 18);
const TWO_M_PARA = BigInt(2_000_000 * 10 ** 18);
const ONE_HUNDRED_PARA = BigInt(100 * 10 ** 18);
const MIN_STAKE_DAYS = 28;
const MAX_STAKE_DAYS = 2888;

let para: any, staker: any;
let alice: any, bob: any, charlie: any, rewardsPool: any;

const deployContract = async (contract: string, params: any[]) => {
	let con: any;
	let c = await ethers.getContractFactory(contract);
	if (params) con = await c.deploy(...params);
	else con = await c.deploy();
	return await con.deployed();
};

const deployContracts = async (rewardsPool: any) => {
	const para = await deployContract("ParadoxTokeneqe", []);
	const staker = await deployContract("StakePool", [
		para.address,
		BigInt((5000 / (24 * 60 * 60)) * 10 ** 18),
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
			await staker.stake(ONE_M_PARA, 20);
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
			await staker.stake(ONE_M_PARA, 3000);
		} catch (error: any) {
			expect(error.message).match(
				/PARA: newStakedDays higher than maximum/
			);
		}
	});
    it("Should have precalculated stakeshare.", async () => {});
  });

  describe("End Stake", async () => {
    it("Should return staked Para and rewards based on the stakeshare.", async () => {});
    it("Should apply penalty before 28 days", async () => {});
  });

  describe("Stake overview", async () => {
    it("Alice, Bob and Charlie each stake 100,000 PARA for 100 days.", async () => {});
    it("Alice, Bob and Charlie each stake 100,000 PARA for 100 days, Bob end stake 50 days after.", async () => {});
    it("Alice, Bob and Charlie each stake 100,000 PARA for 100 days, Charlie add stake 100,000 PARA 50 days after the first stake", async () => {});
  });
});
