/* eslint-disable node/no-unsupported-features/es-syntax */
import { expect } from "chai";
import { ethers, network } from "hardhat";
// eslint-disable-next-line node/no-missing-import
import { genMTree } from "../utils";
import tuccData from "../data/tuccData.json";
import mockTuccData from "../data/mockTuccData.json";

describe("Presale V2 tests", async () => {
  let deployer: any;
  let root: any;
  let mockRoot: any;
  let tree: any;
  let mockTree: any;
  let para: any;
  let presale: any;
  let mockPresale: any;

  beforeEach(async function () {
    [deployer] = await ethers.getSigners();

    [root, tree] = genMTree(tuccData);
    // @ts-ignore
    // console.log(root);

    [mockRoot, mockTree] = genMTree(mockTuccData);

    para = await ethers.getContractFactory("ParadoxToken");
    para = await para.deploy();

    mockPresale = await ethers.getContractFactory("ParadoxPresaleV2");
    presale = await ethers.getContractFactory("ParadoxPresaleV2");

    // @ts-ignore
    presale = await presale.deploy(para.address, root);
    mockPresale = await mockPresale.deploy(para.address, mockRoot);

    para.transfer(presale.address, ethers.utils.parseEther("100000000"));
    para.transfer(mockPresale.address, ethers.utils.parseEther("100000000"));
  });
  it("Each whitelisted user can claim 10% now", async () => {
    // generate tree
    const result = Object.keys(tuccData).map((key) => {
      const d = tuccData[Number(key)];
      const k = Object.keys(d)[0];
      const values = Object.values(d);
      // @ts-ignore
      const total = ethers.utils.parseEther(values[0][0]).toString();
      const now = ethers.utils.parseEther(values[0][1]).toString();
      return [k, total, now];
    });

    for await (const key of result) {
      const proof = tree.getProof([key[0], key[1], key[2]]);
      // @ts-ignore
      expect(await presale.canClaim(key[0], key[1], key[2], proof)).to.equal(
        true
      );

      await presale.claimParadox(key[0], key[1], key[2], proof);

      expect(ethers.utils.formatEther(await para.balanceOf(key[0]))).to.equal(
        ethers.utils.formatEther(key[2])
      );

      const lock = await presale.locks(key[0]);
      const n1 = Number(ethers.utils.formatEther(key[1]));
      const n2 = Number(ethers.utils.formatEther(key[2]));

      expect(Number(ethers.utils.formatEther(lock.total)).toFixed(0)).to.equal(
        (n1 - n2).toFixed(0).toString()
      );
      expect(lock.debt).to.equal(0);
    }
  });
  it("Should be able to claim 5% monthly after 2 months", async () => {
    const address = Object.keys(mockTuccData[0])[0];
    const total = ethers.utils
      .parseEther(Object.values(mockTuccData[0])[0][0])
      .toString();
    const now = ethers.utils
      .parseEther(Object.values(mockTuccData[0])[0][1])
      .toString();

    const proof = mockTree.getProof([address, total, now]);

    expect(await mockPresale.canClaim(address, total, now, proof)).to.equal(
      true
    );

    await mockPresale.claimParadox(address, total, now, proof);

    const deployerBalance = Number(
      ethers.utils.formatEther(await para.balanceOf(deployer.address))
    );

    let lock = await mockPresale.locks(address);
    const t = Number(ethers.utils.formatEther(lock.total));
    const vested = (t * 5) / 100;

    expect(await mockPresale.pendingVestedParadox(address)).to.equal("0");

    // +1 month

    await network.provider.send("evm_increaseTime", [2419200]);
    await network.provider.send("evm_mine");

    expect(await mockPresale.pendingVestedParadox(address)).to.equal("0");

    // +1 month

    await network.provider.send("evm_increaseTime", [2419200]);
    await network.provider.send("evm_mine");

    expect(await mockPresale.pendingVestedParadox(address)).to.equal("0");

    // +1 month

    await network.provider.send("evm_increaseTime", [2419200]);
    await network.provider.send("evm_mine");

    expect(
      Number(
        ethers.utils.formatEther(
          await mockPresale.pendingVestedParadox(address)
        )
      )
    ).to.equal(vested);

    await mockPresale.claimVestedParadox();

    lock = await mockPresale.locks(address);
    expect(ethers.utils.formatEther(lock.debt)).to.equal(vested.toString());
    expect(
      Number(ethers.utils.formatEther(await para.balanceOf(address))).toFixed(0)
    ).to.equal((vested + deployerBalance).toFixed(0));

    // +1 month

    await network.provider.send("evm_increaseTime", [2 * 2419200]);
    await network.provider.send("evm_mine");

    expect(
      ethers.utils.formatEther(await mockPresale.pendingVestedParadox(address))
    ).to.equal((vested * 2).toString());

    await mockPresale.claimVestedParadox();

    lock = await mockPresale.locks(address);
    expect(ethers.utils.formatEther(lock.debt)).to.equal(
      (vested * 3).toString()
    );
    expect(
      Number(ethers.utils.formatEther(await para.balanceOf(address))).toFixed(0)
    ).to.equal((vested * 3 + deployerBalance).toFixed(0));

    // fast forward to many, many months later
    await network.provider.send("evm_increaseTime", [200 * 2419200]);
    await network.provider.send("evm_mine");

    // at this point, we should only be able to claim the total amount
    await mockPresale.claimVestedParadox();
    lock = await mockPresale.locks(address);
    expect(ethers.utils.formatEther(lock.debt)).to.equal(
      ethers.utils.formatEther(lock.total).toString()
    );

    expect(
      Number(ethers.utils.formatEther(await para.balanceOf(address))).toFixed(0)
    ).to.equal((deployerBalance + t).toFixed(0));

    await network.provider.send("evm_increaseTime", [2 * 2419200]);
    await network.provider.send("evm_mine");

    expect(
      ethers.utils.formatEther(await mockPresale.pendingVestedParadox(address))
    ).to.equal("0.0");

    await expect(mockPresale.claimVestedParadox()).to.be.revertedWith(
      "Vesting Complete"
    );
  });
});
