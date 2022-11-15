/* eslint-disable node/no-unsupported-features/es-syntax */
import { expect } from "chai";
import { ethers, network } from "hardhat";
import mockLaunchpadData from "../data/mockLaunchpadData.json";
import { genMTreeLaunchPad } from "../utils";

describe("Presale V2 tests", async () => {
  let deployer: any;
  let para: any;
  let launchPad: any;
  let mockLaunchPad: any;

  let root;
  let mockRoot;
  let tree: any;
  let mockTree;

  beforeEach(async function () {
    [deployer] = await ethers.getSigners();

    para = await ethers.getContractFactory("ParadoxToken");
    para = await para.deploy();

    [root, tree] = genMTreeLaunchPad(mockLaunchpadData);
    [mockRoot, mockTree] = genMTreeLaunchPad(mockLaunchpadData);

    launchPad = await ethers.getContractFactory("Launchpad");
    launchPad = await launchPad.deploy(para.address, root);

    mockLaunchPad = await ethers.getContractFactory("Launchpad");
    mockLaunchPad = await mockLaunchPad.deploy(para.address, root);

    para.transfer(launchPad.address, ethers.utils.parseEther("100000000"));
    para.transfer(mockLaunchPad.address, ethers.utils.parseEther("100000000"));
  });
  it("Buys Paradox at the correct exchange rate", async () => {
    const result = Object.keys(mockLaunchpadData).map((key) => {
      const data = mockLaunchpadData[Number(key)];
      const address = Object.keys(data)[0];
      const amount = ethers.utils.parseEther(
        Number(Object.values(data)[0]).toFixed(6)
      );
      return [address, amount];
    });
    for await (const key of result) {
      const proof = tree.getProof(key);
      // @ts-ignore
      expect(
        // @ts-ignore
        await launchPad.canClaim(key[0], key[1], proof)
      ).to.equal(true);

      await launchPad.claimParadox(
        key[0],
        // @ts-ignore
        key[1],
        proof
      );

      expect(
        Number(ethers.utils.formatEther(await para.balanceOf(key[0]))).toFixed(
          0
        )
      ).to.equal(
        Number(Number(ethers.utils.formatEther(key[1])) * 0.2).toFixed(0)
      );

      const lock = await launchPad.locks(key[0]);

      expect(Number(ethers.utils.formatEther(lock.total)).toFixed(0)).to.equal(
        (Number(Number(ethers.utils.formatEther(key[1]))) * 0.8).toFixed(0)
      );
      expect(lock.debt).to.equal(0);
    }
  });
  it("Should be able to claim 5% monthly after 2 months", async () => {
    const address = Object.keys(mockLaunchpadData[0])[0];
    const amount = ethers.utils.parseEther(
      // @ts-ignore
      Object.values(mockLaunchpadData)[0][address]
    );

    const proof = tree.getProof([address, amount]);

    expect(await mockLaunchPad.canClaim(address, amount, proof)).to.equal(true);

    await mockLaunchPad.claimParadox(address, amount, proof);

    const deployerBalance = Number(
      ethers.utils.formatEther(await para.balanceOf(deployer.address))
    );

    const lock = await mockLaunchPad.locks(address);
    const t = Number(ethers.utils.formatEther(lock.total));
    const vested = (t * 5) / 100;

    expect(await mockLaunchPad.pendingVestedParadox(address)).to.equal("0");

    // +1 month

    await network.provider.send("evm_increaseTime", [2419200]);
    await network.provider.send("evm_mine");

    expect(await mockLaunchPad.pendingVestedParadox(address)).to.equal("0");

    // +1 month

    await network.provider.send("evm_increaseTime", [2419200]);
    await network.provider.send("evm_mine");

    expect(await mockLaunchPad.pendingVestedParadox(address)).to.equal("0");

    // +1 month

    await network.provider.send("evm_increaseTime", [2419200]);
    await network.provider.send("evm_mine");

    expect(
      Number(
        ethers.utils.formatEther(
          await mockLaunchPad.pendingVestedParadox(address)
        )
      )
    ).to.equal(vested);
  });
});
