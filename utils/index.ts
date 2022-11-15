// eslint-disable-next-line node/no-unpublished-import
import { ethers } from "hardhat";
import keccak256 from "keccak256";
import MerkleTree from "merkletreejs";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";

const fs = require("fs");

export const genMTree = (data: any) => {
  const result = Object.keys(data).map((key) => {
    const d = data[key];
    const k = Object.keys(d)[0];
    const values = Object.values(d);
    // @ts-ignore
    const total = ethers.utils.parseEther(values[0][0]).toString();
    // @ts-ignore
    const now = ethers.utils.parseEther(values[0][1]).toString();

    // @ts-ignore
    // const now = ethers.utils.parseEther(values[0][1]);

    // if (Number(key) === 0) console.log(`leaf-i: ${[leaf, k, total, now]}`);
    return [k, total, now];
  });

  const tree = StandardMerkleTree.of(result, ["address", "uint256", "uint256"]);

  const root = tree.root;
  return [root, tree];
};

export const genMTreeLaunchPad = (data: any) => {
  const result = Object.keys(data).map((key) => {
    const d = data[Number(key)];
    const address = Object.keys(d)[0];
    // @ts-ignore
    const amount = Number(Object.values(d)[0]).toFixed(6);

    return [address, ethers.utils.parseEther(amount)];
  });

  const tree = StandardMerkleTree.of(result, ["address", "uint256"]);

  const root = tree.root;
  return [root, tree];
};
