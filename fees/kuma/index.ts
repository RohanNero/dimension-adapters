import { SimpleAdapter, FetchOptions } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

const feeChargedABI = "event FeeCharged (uint256 fee)";
const kumaSwapSetABI = "event KUMASwapSet (address KUMASwap, bytes4 indexed currency, bytes32 indexed issuer, uint64 indexed term)"
const getRiskCategoryABI = "function getRiskCategory() external view returns (bytes32)"
const getKIBTokenABI = "function getKIBToken(bytes32 riskCategory) external view returns (address)"


const fetch = (addressProvider: string, creationBlock: number) => {
    return async (options: FetchOptions) => {
        const dailyFees = options.createBalances();

        const swapSetLogs = await options.getLogs({
            target: addressProvider,
            eventAbi: kumaSwapSetABI,
            fromBlock: creationBlock,
            toBlock: await options.getToBlock(),
            onlyArgs: true,
        })

        const swapContracts = swapSetLogs.map((log) => log.KUMASwap);


        for (const contract of swapContracts) {
            const feeLogs = await options.getLogs({
                target: contract,
                eventAbi: feeChargedABI,
                onlyArgs: true,
            })
            if (feeLogs.length == 0) continue;


            const riskCategory = await options.api.call({
                target: contract,
                abi: getRiskCategoryABI,
            })

            const currency = await options.api.call({
                target: addressProvider,
                abi: getKIBTokenABI,
                params: [riskCategory],
            })

            feeLogs.forEach((log) => {
                if (!log.fee || log.fee == 0) return;
                dailyFees.add(currency, log.fee)
            })
        }
        return { dailyFees, dailyRevenue: dailyFees }
    }
}


const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch: fetch("0xDc024bf64F893A682008083E805c9a204f3D7DC9", 17235839),
            start: "May-11-2023"
        },
        [CHAIN.POLYGON]: {
            fetch: fetch("0x4dBA794671B891D2Ee2E3E7eA9E993026219941C", 49180899),
            start: "Oct-26-2023",
        },
        [CHAIN.LINEA]: {
            fetch: fetch("0x69c6d64Efa37a94fb234DbaE52f4BEAe506e27f2", 818832),
            start: "Nov-9-2023",
        },
        [CHAIN.MANTLE]: {
            fetch: fetch("0xe740e27a0f24d45b42f361eda063a47088ede6be", 8259),
            start: "Jul-17-2023",
        },
        [CHAIN.TELOS]: {
            fetch: fetch("0xcDF658Ee01B43c7cA9b8b567751c3a7d2F9A3b66", 333384602),
            start: "Mar-28-2024",
        },
        [CHAIN.NEON]: {
            fetch: fetch("0xcE7f5fc6a855f514099c85f69956801bbd862321", 264595746),
            start: "May-8-2024",
        },
    }
}

export default adapter