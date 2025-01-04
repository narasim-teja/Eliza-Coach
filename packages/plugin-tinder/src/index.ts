import { Plugin } from "@elizaos/core";
import { tinderLoginAction } from "./actions/login";
import { TinderProvider } from "./providers/tinderProvider";

// Export individual components
export * as actions from "./actions/index";
export * as providers from "./providers/index";

export const tinderPlugin: Plugin = {
    name: "tinder",
    description: "Plugin for handling Tinder interactions",
    actions: [tinderLoginAction],
    providers: [TinderProvider.getInstance()],
};
