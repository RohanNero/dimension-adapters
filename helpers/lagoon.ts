import { FetchOptions, FetchResultV2, FetchV2, IJSON, SimpleAdapter } from "../adapters/types";
import { METRIC } from "./metrics";

const Abis = {
    ProxyDeployedEvent: 'event ProxyDeployed(address proxy, address deployer)',
    convertToAssets: 'function convertToAssets(uint256) view returns (uint256)',
    feeRates: 'function feeRates() view returns (uint256 managementRate, uint256 performanceRate)',
    protocolRate: 'function protocolRate(address vault) view returns (uint256 rate)',
}

interface FactoryConfig {
    address: string;
    fromBlock: number;
}

export type LagoonConfig = {
    feeRegistry: string;
    factories?: FactoryConfig[];
    vaults?: string[];
}

export const getLagoonFetch = (config: LagoonConfig): FetchV2 => {
    const fetch: FetchV2 = async (options: FetchOptions): Promise<FetchResultV2> => {
        const { api, createBalances } = options;
        const { feeRegistry, factories = [], vaults: staticVaults = [] } = config;

        const dailyFees = createBalances();
        const dailyRevenue = createBalances();
        const dailyProtocolRevenue = createBalances();
        const dailySupplySideRevenue = createBalances();

        let vaults: string[] = [...staticVaults];
        for (const factory of factories) {
            const events = await options.getLogs({
                eventAbi: Abis.ProxyDeployedEvent,
                target: factory.address,
                fromBlock: factory.fromBlock,
            });
            vaults = vaults.concat(events.map((e: any) => e.proxy));
        }

        if (vaults.length === 0) {
            return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue };
        }

        const [protocolRates, assets, balances, feeRates] = await Promise.all([
            api.multiCall({
                abi: Abis.protocolRate,
                calls: vaults.map(vault => ({ target: feeRegistry, params: [vault] })),
                permitFailure: true
            }),
            api.multiCall({ abi: 'address:asset', calls: vaults, permitFailure: true }),
            api.multiCall({ abi: 'uint256:totalAssets', calls: vaults, permitFailure: true }),
            api.multiCall({ abi: Abis.feeRates, calls: vaults, permitFailure: true })
        ]);

        const convertCalls = vaults.map((vault: string) => ({
            target: vault,
            params: [String(1e18)],
        }));

        const [indexBefore, indexAfter] = await Promise.all([
            options.fromApi.multiCall({ abi: Abis.convertToAssets, calls: convertCalls, permitFailure: true }),
            options.toApi.multiCall({ abi: Abis.convertToAssets, calls: convertCalls, permitFailure: true })
        ]);

        for (let i = 0; i < vaults.length; i++) {
            if (!assets[i] || !balances[i] || !indexBefore[i] || !indexAfter[i]) continue;

            const cumulativeYield = (BigInt(indexAfter[i]) - BigInt(indexBefore[i])) * BigInt(balances[i]) / BigInt(1e18);

            const managementFeeRate = feeRates[i] ? Number(feeRates[i].managementRate) / 1e4 : 0;
            const performanceFeeRate = feeRates[i] ? Number(feeRates[i].performanceRate) / 1e4 : 0;
            const protocolFeeRate = protocolRates[i] ? Number(protocolRates[i]) / 1e4 : 0;

            const performanceFees = Number(cumulativeYield) * performanceFeeRate;

            const oneYear = 365 * 24 * 3600;
            const timeframe = options.toTimestamp - options.fromTimestamp;
            const managementFees = Number(balances[i]) * managementFeeRate * timeframe / oneYear;

            const supplySideYields = Number(cumulativeYield) - performanceFees;

            dailyFees.add(assets[i], supplySideYields, METRIC.ASSETS_YIELDS);
            dailyFees.add(assets[i], performanceFees, METRIC.PERFORMANCE_FEES);
            dailyFees.add(assets[i], managementFees, METRIC.MANAGEMENT_FEES);

            dailySupplySideRevenue.add(assets[i], supplySideYields, METRIC.ASSETS_YIELDS);

            dailyRevenue.add(assets[i], performanceFees, METRIC.PERFORMANCE_FEES);
            dailyRevenue.add(assets[i], managementFees, METRIC.MANAGEMENT_FEES);

            dailyProtocolRevenue.add(assets[i], performanceFees * protocolFeeRate, METRIC.PERFORMANCE_FEES);
            dailyProtocolRevenue.add(assets[i], managementFees * protocolFeeRate, METRIC.MANAGEMENT_FEES);
        }

        return {
            dailyFees,
            dailyRevenue,
            dailySupplySideRevenue,
            dailyProtocolRevenue,
        };
    }
    return fetch;
}

export function lagoonExports(config: IJSON<LagoonConfig>): SimpleAdapter {
    const adapter: SimpleAdapter = {
        version: 2,
        adapter: {},
    };
    for (const [chain, chainConfig] of Object.entries(config)) {
        adapter.adapter![chain] = {
            fetch: getLagoonFetch(chainConfig),
        };
    }
    return adapter;
}