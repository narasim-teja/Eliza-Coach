import { Action } from "@elizaos/core";
import { TinderProvider } from "../providers/tinderProvider";

export const tinderLoginAction: Action = {
    name: "tinder-login",
    description: "Login to Tinder website using phone number authentication",
    similes: ["LOGIN_TINDER", "SIGNIN_TINDER", "AUTHENTICATE_TINDER"],
    validate: async (runtime, message) => {
        const text = message.content.text.toLowerCase();
        return (
            text.includes("login") ||
            text.includes("log in") ||
            text.includes("signin") ||
            text.includes("sign in")
        );
    },
    handler: async (runtime, message) => {
        const provider = TinderProvider.getInstance();
        const phoneNumber = process.env.TINDER_PHONE_NUMBER;

        if (!phoneNumber) {
            await runtime.messageManager.createMemory({
                userId: runtime.agentId,
                roomId: message.roomId,
                agentId: runtime.agentId,
                content: {
                    text: "Phone number not configured. Please set TINDER_PHONE_NUMBER in environment variables.",
                    action: "tinder-login",
                },
            });
            return false;
        }

        try {
            await provider.init();

            // Check if already logged in
            const isLoggedIn = await provider.isLoggedIn();
            if (isLoggedIn) {
                await runtime.messageManager.createMemory({
                    userId: runtime.agentId,
                    roomId: message.roomId,
                    agentId: runtime.agentId,
                    content: {
                        text: "Already logged into Tinder",
                        action: "tinder-login",
                    },
                });
                return true;
            }

            await provider.navigateToLogin();

            await runtime.messageManager.createMemory({
                userId: runtime.agentId,
                roomId: message.roomId,
                agentId: runtime.agentId,
                content: {
                    text: "Starting phone number login process...",
                    action: "tinder-login",
                },
            });

            const loginSuccess = await provider.loginWithPhone(phoneNumber);

            if (loginSuccess) {
                await runtime.messageManager.createMemory({
                    userId: runtime.agentId,
                    roomId: message.roomId,
                    agentId: runtime.agentId,
                    content: {
                        text: "Successfully logged into Tinder",
                        action: "tinder-login",
                    },
                });
                return true;
            } else {
                await runtime.messageManager.createMemory({
                    userId: runtime.agentId,
                    roomId: message.roomId,
                    agentId: runtime.agentId,
                    content: {
                        text: "Failed to log into Tinder. Please check the console for OTP entry.",
                        action: "tinder-login",
                    },
                });
                return false;
            }
        } catch (error) {
            await provider.close();
            throw error;
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Login to Tinder",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Starting phone number login process...",
                    action: "tinder-login",
                },
            },
        ],
    ],
};
