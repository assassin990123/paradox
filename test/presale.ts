/* eslint-disable node/no-unsupported-features/es-builtins */
/* eslint-disable prettier/prettier */
import { expect } from "chai";
import { MerkleTree } from "merkletreejs";
import { ethers, network } from "hardhat";

let para: any, nft: any, usdt: any, presale: any;
let deployer: any, alice: any;
let merkleTree: any, root: any;

// create proof
const usdtAmount = BigInt(500 * 10 ** 6);

const deployContract = async (contract: string, params: any[]) => {
	let con: any;
	const c = await ethers.getContractFactory(contract);
	if (params) con = await c.deploy(...params);
	else con = await c.deploy();
	return await con.deployed();
};

const deployContracts = async (_root: any) => {
	const para = await deployContract("ParadoxTokeneqe", []);
    const nft = await deployContract("Paradox", []);
    const usdt = await deployContract("USDT", []);
	const presale = await deployContract("Presale", [
		usdt.address,
		nft.address,
		para.address,
        _root
	]);

	return {
		para,
        nft,
		usdt,
        presale
	};
};

const _formatEther = (amount: any) => {
	return Number(ethers.utils.formatEther(amount));
};

const _formatUSDT = (amount: any) => {
    return Number(ethers.utils.formatUnits(amount, 6));
};

describe("Presale", async () => {
    beforeEach(async () => {
        // get trx signers
		[deployer, alice] = await ethers.getSigners();

        // lead node
        const leafNode = [[alice.address, usdtAmount].join("")].map(leaf => ethers.utils.keccak256(leaf));

        // get merkle poof
        merkleTree = new MerkleTree(leafNode, ethers.utils.keccak256, { sortPairs: true });

        // get merkle root
        root = merkleTree.getRoot();

        // deloy contracts
		({ para, nft, usdt, presale } = await deployContracts(root));

        // approve usdt
        await usdt.transfer(alice.address, usdtAmount);
        await usdt.connect(alice).approve(presale.address, usdtAmount);
	});

    it ("Alice vest 500 usdt, claim paradox, claim vested paradox after a month", async () => {
        // check canClaim
        expect(await presale.canClaim(alice.address, usdtAmount, merkleTree)).to.equal(true);

        // claim paradox based on the usdt
        await presale.claimParadox(alice.address, usdtAmount, merkleTree);

        // check usdt & paradox amount
        expect(_formatEther(await para.balanceOf(alice.address)).toFixed(0)).to.equal("200000");
        expect(_formatUSDT(await usdt.balanceOf(presale.address)).toFixed(0)).to.equal("500");

        // get pending vesteClaim
        expect(_formatEther(await para.pendingVestedClaim(alice.address)).toFixed(0)).to.equal("0");

        // fast forward a month
        await network.provider.send("evm_increaseTime", [3600 * 24 * 30]);
        await network.provider.send("evm_mine");

        // check pending vestClaim
        expect(_formatEther(await para.pendingVestedClaim(alice.address)).toFixed(0)).to.equal("200000");

        // claim vested Para
        await presale.claimVested(alice.address);

        // check claimed Para
        expect(_formatEther(await para.balanceOf(alice.address)).toFixed(0)).to.equal("400000");
    });
});