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

export const cleanData = () => {
  const allLines = fs
    .readFileSync("../data/tuccData.csv")
    .toString()
    .split("\n");

  const newData = [];

  for (let i = 0; i < allLines.length; i++) {
    try {
      const currentline = allLines[i].split(",");
      const address = currentline[0];
      const total = currentline[1];
      const now = String(currentline[2].replace("\r", ""));

      const data = { [address]: [total, now] };
      newData.push(data);
    } catch (e) {}
  }

  fs.writeFileSync("../data/tuccData.json", JSON.stringify(newData), "utf-8");
};
