import { CHAIN } from "../../helpers/chains";
import { lagoonExports } from "../../helpers/lagoon";

export default {
    ...lagoonExports({
        [CHAIN.ETHEREUM]: {
            feeRegistry: "0x6dA4D1859bA1d02D095D2246142CdAd52233e27C",
            vaults: ["0x936facdf10c8c36294e7b9d28345255539d81bc7"],
        }
    }),
    methodology: {
        Fees: "Total yield generated from the rock.rETH vault.",
        Revenue: "Total amount of performance and management fees.",
        SupplySideRevenue: "Yield distributed to vault suppliers.",
        ProtocolRevenue: "Yield distributed to the protocol.",
    }
};