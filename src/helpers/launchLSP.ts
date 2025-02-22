import {
  getBinaryOptionLongShortPairFinancialProductLibraryAbi,
  getBinaryOptionLongShortPairFinancialProductLibraryAddress,
  getCappedYieldDollarLongShortPairFinancialProductLibraryAbi,
  getCappedYieldDollarLongShortPairFinancialProductLibraryAddress,
  getCoveredCallLongShortPairFinancialProductLibraryAbi,
  getCoveredCallLongShortPairFinancialProductLibraryAddress,
  getLinearLongShortPairFinancialProductLibraryAbi,
  getLinearLongShortPairFinancialProductLibraryAddress,
  getLongShortPairCreatorAbi,
  getLongShortPairCreatorAddress,
  getRangeBondLongShortPairFinancialProductLibraryAbi,
  getRangeBondLongShortPairFinancialProductLibraryAddress,
  getSimpleSuccessTokenLongShortPairFinancialProductLibraryAbi,
  getSimpleSuccessTokenLongShortPairFinancialProductLibraryAddress,
  getStoreAbi,
  getStoreAddress,
  getSuccessTokenLongShortPairFinancialProductLibraryAbi,
  getSuccessTokenLongShortPairFinancialProductLibraryAddress,
} from "@uma/contracts-frontend";

import { collateralTokens } from "./constants";
import { FPL, FPLParams, LaunchOptions } from "./models";
import { parseCustomAncillaryData } from "./utils";

const getFPLParams = (
  fpl: FPL,
  basePercentage: string,
  lowerBound: string,
  upperBound: string,
  chainId: number,
): FPLParams => {
  switch (fpl) {
    case "BinaryOption":
    case "KPI Option - Binary":
      return {
        address:
          getBinaryOptionLongShortPairFinancialProductLibraryAddress(chainId),
        abi: getBinaryOptionLongShortPairFinancialProductLibraryAbi(),
        contractParams: [lowerBound],
      };
    case "CappedYieldDollar":
      return {
        address:
          getCappedYieldDollarLongShortPairFinancialProductLibraryAddress(
            chainId,
          ),
        abi: getCappedYieldDollarLongShortPairFinancialProductLibraryAbi(),
        contractParams: [lowerBound],
      };
    case "CoveredCall":
      return {
        address:
          getCoveredCallLongShortPairFinancialProductLibraryAddress(chainId),
        abi: getCoveredCallLongShortPairFinancialProductLibraryAbi(),
        contractParams: [lowerBound],
      };
    case "SimpleSuccessToken":
      return {
        address:
          getSimpleSuccessTokenLongShortPairFinancialProductLibraryAddress(
            chainId,
          ),
        abi: getSimpleSuccessTokenLongShortPairFinancialProductLibraryAbi(),
        contractParams: [lowerBound],
      };
    case "RangeBond":
      return {
        address:
          getRangeBondLongShortPairFinancialProductLibraryAddress(chainId),
        abi: getRangeBondLongShortPairFinancialProductLibraryAbi(),
        contractParams: [upperBound, lowerBound],
      };
    case "Linear":
    case "KPI Option - Linear":
      return {
        address: getLinearLongShortPairFinancialProductLibraryAddress(chainId),
        abi: getLinearLongShortPairFinancialProductLibraryAbi(),
        contractParams: [upperBound, lowerBound],
      };
    case "SuccessToken":
      return {
        address:
          getSuccessTokenLongShortPairFinancialProductLibraryAddress(chainId),
        abi: getSuccessTokenLongShortPairFinancialProductLibraryAbi(),
        contractParams: [lowerBound, basePercentage],
      };
  }
};

export default async function launchLSP({
  web3,
  simulate,
  gasPrice,
  pairName,
  expirationTimestamp,
  collateralPerPair,
  priceIdentifier,
  longSynthName,
  longSynthSymbol,
  shortSynthName,
  shortSynthSymbol,
  collateralToken,
  customAncillaryData,
  proposerReward,
  optimisticOracleLivenessTime,
  optimisticOracleProposerBond,
  enableEarlyExpiration,
  fpl,
  basePercentage,
  lowerBound,
  upperBound,
}: LaunchOptions): Promise<string> {
  const { utf8ToHex, padRight, toWei } = web3.utils;

  const account = (await web3.eth.getAccounts())[0];
  const chainId = await web3.eth.net.getId();

  // Get the final fee for the collateral type to use as default proposer bond.
  const proposerBond =
    (optimisticOracleProposerBond
      ? toWei(optimisticOracleProposerBond)
      : (
          await new web3.eth.Contract(
            getStoreAbi(),
            getStoreAddress(chainId),
          ).methods
            .computeFinalFee(collateralToken)
            .call()
        )[0]) || "0";

  // Check if entered manually on test networks
  const collateral = collateralToken.startsWith("0x")
    ? collateralToken
    : collateralTokens
        .find((token) => token.currency === collateralToken)
        ?.addresses.find(
          (address) =>
            (chainId === 1 && address.includes("etherscan")) ||
            (chainId === 137 && address.includes("polygonscan")),
        )
        ?.split("/")
        ?.pop()!;

  const fplParams = getFPLParams(
    fpl,
    basePercentage,
    lowerBound,
    upperBound,
    chainId,
  );
  const fplContractParamsInWei = fplParams.contractParams.map((param) =>
    toWei(param),
  );

  const lspParams = {
    /* string  */ pairName,
    /* uint64  */ expirationTimestamp: Math.ceil(
      expirationTimestamp.getTime() / 1000,
    ).toString(),
    /* uint256 */ collateralPerPair: toWei(collateralPerPair),
    /* bytes32 */ priceIdentifier: padRight(utf8ToHex(priceIdentifier), 64),
    /* string  */ longSynthName,
    /* string  */ longSynthSymbol,
    /* string  */ shortSynthName,
    /* string  */ shortSynthSymbol,
    /* address */ collateralToken: collateral,
    /* address */ financialProductLibrary: fplParams.address,
    /* bytes   */ customAncillaryData: utf8ToHex(
      parseCustomAncillaryData(customAncillaryData),
    ),
    /* uint256 */ proposerReward: proposerReward?.length
      ? toWei(proposerReward)
      : "0",
    /* bool    */ enableEarlyExpiration: enableEarlyExpiration ?? false,
    /* uint256 */ optimisticOracleLivenessTime: optimisticOracleLivenessTime
      ? optimisticOracleLivenessTime.toString()
      : "7200",
    /* uint256 */ optimisticOracleProposerBond: proposerBond,
  };

  const contractParams = {
    from: account,
    gas: 12000000,
    gasPrice: (Number(gasPrice) * 1000000000).toString(),
  };

  console.log(
    JSON.stringify(
      {
        simulate,
        chainId,
        lspParams,
        fplContractParamsInWei,
        contractParams,
      },
      null,
      2,
    ),
  );

  const lspCreator = new web3.eth.Contract(
    getLongShortPairCreatorAbi(),
    chainId === 80001
      ? "0xed3D3F90b8426E683b8d361ac7dDBbEa1a8A7Da8"
      : getLongShortPairCreatorAddress(chainId),
    contractParams,
  );

  const lspAddress = await lspCreator.methods
    .createLongShortPair(lspParams)
    .call();

  if (!simulate) {
    await lspCreator.methods.createLongShortPair(lspParams).send();

    const deployedFPL = new web3.eth.Contract(
      fplParams.abi,
      fplParams.address,
      contractParams,
    );

    await deployedFPL.methods
      .setLongShortPairParameters(lspAddress, ...fplContractParamsInWei)
      .send();
  }

  return lspAddress;
}
