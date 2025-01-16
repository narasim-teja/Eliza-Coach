import { Plugin } from "@elizaos/core";
import { bookSaloonAppointment } from "./actions/bookAppointment";
import { SaloonProvider } from "./providers/saloonProvider";

// Export individual components
export * as actions from "./actions/index";
export * as providers from "./providers/index";

export const saloonPlugin: Plugin = {
    name: "saloon",
    description: "Plugin for booking salon appointments",
    actions: [bookSaloonAppointment],
    providers: [SaloonProvider.getInstance()],
};
