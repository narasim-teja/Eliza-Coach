import { Action } from "@elizaos/core";
import { SaloonProvider } from "../providers/saloonProvider";

export const bookSaloonAppointment: Action = {
    name: "book-saloon-appointment",
    description: "Book a salon appointment at Supercuts",
    similes: ["BOOK_SALOON", "SCHEDULE_HAIRCUT", "MAKE_APPOINTMENT"],
    validate: async (runtime, message) => {
        const text = message.content.text.toLowerCase();
        return (
            text.includes("book") ||
            text.includes("schedule") ||
            text.includes("appointment") ||
            text.includes("haircut") ||
            text.includes("salon") ||
            text.includes("saloon")
        );
    },
    handler: async (runtime, message) => {
        const provider = SaloonProvider.getInstance();
        provider.setRuntime(runtime);

        // Extract time range from message
        const text = message.content.text.toLowerCase();
        const timeMatch = text.match(
            /(\d{1,2})(:\d{2})?(\s*-\s*\d{1,2}(:\d{2})?)?(\s*[ap]m)/i
        );
        if (!timeMatch) {
            await runtime.messageManager.createMemory({
                userId: runtime.agentId,
                roomId: message.roomId,
                agentId: runtime.agentId,
                content: {
                    text: "Please specify a time range for the appointment (e.g., 4-5pm)",
                    action: "book-saloon-appointment",
                },
            });
            return false;
        }

        const timeRange = timeMatch[0];

        try {
            await provider.init();

            await runtime.messageManager.createMemory({
                userId: runtime.agentId,
                roomId: message.roomId,
                agentId: runtime.agentId,
                content: {
                    text: "Searching for available Supercuts locations...",
                    action: "book-saloon-appointment",
                },
            });

            await provider.navigateToSupercuts();

            await runtime.messageManager.createMemory({
                userId: runtime.agentId,
                roomId: message.roomId,
                agentId: runtime.agentId,
                content: {
                    text: `Looking for available appointments between ${timeRange}...`,
                    action: "book-saloon-appointment",
                },
            });

            const success = await provider.bookAppointment(timeRange);

            if (success) {
                await runtime.messageManager.createMemory({
                    userId: runtime.agentId,
                    roomId: message.roomId,
                    agentId: runtime.agentId,
                    content: {
                        text: `Successfully booked a Supercuts appointment for ${timeRange}`,
                        action: "book-saloon-appointment",
                    },
                });
                return true;
            } else {
                await runtime.messageManager.createMemory({
                    userId: runtime.agentId,
                    roomId: message.roomId,
                    agentId: runtime.agentId,
                    content: {
                        text: "Failed to book the appointment. Please try a different time or location.",
                        action: "book-saloon-appointment",
                    },
                });
                return false;
            }
        } catch (error) {
            await provider.close();
            await runtime.messageManager.createMemory({
                userId: runtime.agentId,
                roomId: message.roomId,
                agentId: runtime.agentId,
                content: {
                    text: `Error booking appointment: ${error.message}`,
                    action: "book-saloon-appointment",
                },
            });
            throw error;
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Book a salon appointment between 4-5pm today at Supercuts",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Searching for available Supercuts locations...",
                    action: "book-saloon-appointment",
                },
            },
        ],
    ],
};
