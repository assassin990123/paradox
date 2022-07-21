/* eslint-disable node/no-unpublished-import */
import { MerkleTree } from "merkletreejs";
import keccak256 from "keccak256";
import { ethers } from "hardhat";

export const genMTree = (data: any) => {
  console.log(data);
  const result = Object.keys(data).map(
    (key) =>
      ethers.utils
        .solidityKeccak256(["address", "uint256"], [key, data[key].toString()])
        .substr(2),
    "hex"
  );

  const tree = new MerkleTree(result, keccak256, { sortPairs: true });

  const root = tree.getHexRoot();
  // verify
  result.forEach((leaf, index) => {
    const proof = tree.getHexProof(leaf);
    if (!tree.verify(proof, leaf, root)) console.log(leaf);
  });

  return [root, tree];
};

export const format = (amount: number, dec: number) => {
  return Number(Number(ethers.utils.formatUnits(amount, dec)).toFixed(6));
};

export const parse = (amount: string, dec: number) => {
  return ethers.utils.parseUnits(amount, dec);
};

// get a random key from our address: amount pairs
export const randomAddress = (obj: any) => {
  const keys = Object.keys(obj);
  const r = (keys.length * Math.random()) << 0;
  const key = keys[(keys.length * Math.random()) << 0];
  const amount = obj[key].toString();
  const leaf = Buffer.from(
    ethers.utils
      .solidityKeccak256(["address", "uint256"], [key, amount])
      .substr(2),
    "hex"
  );
  return { leaf, address: String(key), amount };
};
