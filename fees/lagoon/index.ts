import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { graph } from "@defillama/sdk";
// Chains that have different subgraph names
const chainToSubgraphName: Record<string, string> = {
  [CHAIN.ETHEREUM]: "mainnet",
  [CHAIN.AVAX]: "avalanche",
  [CHAIN.HYPERLIQUID]: "hyperevm",
  [CHAIN.UNICHAIN]: "unichain-mainnet",
  [CHAIN.WC]: "worldchain-mainnet",
};

const getSubgraphUrl = (chain: string) => {
  const subgraphChain = chainToSubgraphName[chain] || chain;
  return `https://api.goldsky.com/api/public/project_cmbrqvox367cy01y96gi91bis/subgraphs/lagoon-${subgraphChain}-vault/prod/gn`;
};

const abis = {
  getRolesStorage: "function getRolesStorage() view returns (address whitelistManager, address feeReceiver, address safe, address feeRegistry, address valuationManager)",
  protocolFeeReceiver: "function protocolFeeReceiver() view returns (address)",
  asset: "function asset() view returns (address)",
  convertToAssets: "function convertToAssets(uint256 shares) view returns (uint256)"
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const subgraphUrl = getSubgraphUrl(options.chain);

  const settleRedeemsQuery = await graph.request(subgraphUrl, `{
        settleRedeems(
            where: { blockTimestamp_gte: ${Math.floor(options.fromTimestamp)}, blockTimestamp_lte: ${Math.floor(options.toTimestamp)} }
        ) {
            vault
            transactionHash
        }
    }`);
  if (!settleRedeemsQuery.settleRedeems || settleRedeemsQuery.settleRedeems.length === 0) {
    return { dailyFees, dailyRevenue };
  }

  const uniqueVaults = [...new Set(settleRedeemsQuery.settleRedeems.map((s: any) => s.vault))];
  if (uniqueVaults.length === 0) {
    return { dailyFees, dailyRevenue };
  }

  const [roleStorages, assets] = await Promise.all([
    options.api.multiCall({
      abi: abis.getRolesStorage,
      calls: uniqueVaults as string[],
    }),
    options.api.multiCall({
      abi: abis.asset,
      calls: uniqueVaults as string[],
    })
  ]);
  // Get protocolFeeReceiver from the first vault's feeRegistry (same for all vaults)
  const feeRegistry = roleStorages[0].feeRegistry;
  const protocolFeeReceiver = (await options.api.call({
    target: feeRegistry,
    abi: abis.protocolFeeReceiver,
  })).toLowerCase();

  // Map vault addresses to feeReceiver and asset
  const vaultConfigs = new Map(
    (uniqueVaults as string[]).map((vault: string, i: number) => [
      vault.toLowerCase(),
      {
        feeReceiver: roleStorages[i].feeReceiver.toLowerCase(),
        asset: assets[i],
      }
    ])
  );

  // Get all fee transfers from settlement transactions in one query
  const allTxHashes = settleRedeemsQuery.settleRedeems
    .map((s: any) => `"${s.transactionHash.toLowerCase()}"`)
    .join(',');
  const feeTransfersQuery = await graph.request(subgraphUrl, `{
        transfers(
            where: { 
                transactionHash_in: [${allTxHashes}], 
                from: "0x0000000000000000000000000000000000000000"
            }
        ) {
            vault
            to
            value
            transactionHash
        }
    }`);
  if (!feeTransfersQuery.transfers || feeTransfersQuery.transfers.length === 0) {
    return { dailyFees, dailyRevenue };
  }

  const assetAmounts = await options.api.multiCall({
    abi: abis.convertToAssets,
    calls: feeTransfersQuery.transfers.map((transfer: any) => ({
      target: transfer.vault,
      params: [transfer.value]
    }))
  });

  for (let i = 0; i < feeTransfersQuery.transfers.length; i++) {
    const assetAmount = assetAmounts[i];
    const toAddress = feeTransfersQuery.transfers[i].to.toLowerCase();
    const vaultConfig = vaultConfigs.get(feeTransfersQuery.transfers[i].vault.toLowerCase());
    if (!vaultConfig) continue;

    if (toAddress === vaultConfig.feeReceiver) {
      dailyFees.add(vaultConfig.asset, assetAmount);
    } else if (toAddress === protocolFeeReceiver) {
      dailyRevenue.add(vaultConfig.asset, assetAmount);
    }
  }

  return { dailyFees, dailyRevenue }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: "4-8-2025",
    },
    [CHAIN.AVAX]: {
      fetch,
      start: "7-17-2025",
    },
    [CHAIN.BASE]: {
      fetch,
      start: "5-1-2025",
    },
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "4-8-2025",
    },
    [CHAIN.HYPERLIQUID]: {
      fetch,
      start: "9-8-2025",
    },
    [CHAIN.KATANA]: {
      fetch,
      start: "7-4-2025",
    },
    [CHAIN.LINEA]: {
      fetch,
      start: "9-9-2025",
    },
    [CHAIN.MANTLE]: {
      fetch,
      start: "7-3-2025",
    },
    [CHAIN.MONAD]: {
      fetch,
      start: "11-19-2025",
    },
    [CHAIN.OPTIMISM]: {
      fetch,
      start: "10-16-2025",
    },
    [CHAIN.PLASMA]: {
      fetch,
      start: "9-30-2025",
    },
    [CHAIN.POLYGON]: {
      fetch,
      start: "9-26-2025",
    },
    [CHAIN.TAC]: {
      fetch,
      start: "7-9-2025",
    },
    [CHAIN.UNICHAIN]: {
      fetch,
      start: "4-22-2025",
    },
    [CHAIN.WC]: {
      fetch,
      start: "5-22-2025",
    },
  },
  methodology: {
    Fees: "Management and Performance fees set by Lagoon vaults are paid in the form of minted shares.",
    Revenue: "A portion of the fees collected are sent to the protocol's fee receiver."
  }
}

export default adapter;