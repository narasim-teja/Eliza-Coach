import { Provider } from "@elizaos/core";
import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";
import { Page } from "playwright";
import { GEMINI_CONFIG, PROMPTS } from "../lib/constants";
import { IAgentRuntime, Memory, State } from "@elizaos/core";

export class ScreenAnalysisProvider implements Provider {
    private static instance: ScreenAnalysisProvider;
    private genAI: GoogleGenerativeAI;
    private model: GenerativeModel;

    private constructor() {
        if (!process.env.GOOGLE_MODEL) {
            throw new Error("GOOGLE_MODEL environment variable is not set");
        }
        this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_MODEL);
        this.model = this.genAI.getGenerativeModel({
            model: GEMINI_CONFIG.model,
        });
    }

    public static getInstance(): ScreenAnalysisProvider {
        if (!ScreenAnalysisProvider.instance) {
            ScreenAnalysisProvider.instance = new ScreenAnalysisProvider();
        }
        return ScreenAnalysisProvider.instance;
    }

    async get(
        _runtime: IAgentRuntime,
        _message: Memory,
        _state?: State
    ): Promise<GenerativeModel> {
        return Promise.resolve(this.model);
    }

    async analyzeScreenshot(
        page: Page,
        query: string
    ): Promise<AnalysisResult> {
        try {
            // Take screenshot as buffer and convert to base64
            const screenshotBuffer = await page.screenshot({ type: "jpeg" });
            const base64Image = screenshotBuffer.toString("base64");

            // Add salon-specific context to the query
            const enhancedQuery = `${query}. Look for salon-specific elements like appointment slots, stylist availability, service options, and location details.`;
            const prompt = `${PROMPTS.baseAnalysis}\nAdditional task: ${enhancedQuery}`;

            // Generate content with correct parts format
            const result = await this.model.generateContent({
                contents: [
                    {
                        role: "user",
                        parts: [
                            { text: prompt },
                            {
                                inlineData: {
                                    mimeType: GEMINI_CONFIG.mimeType,
                                    data: base64Image,
                                },
                            },
                        ],
                    },
                ],
            });

            // Wait for response
            const response = result.response;
            const text = response.text();

            try {
                // Try to parse as JSON first
                return JSON.parse(text) as AnalysisResult;
            } catch {
                // If not valid JSON, use the text parser
                return this.parseGeminiResponse(text);
            }
        } catch (error) {
            console.error("Screenshot analysis failed:", error);
            if (error instanceof Error) {
                throw new Error(`Screenshot analysis failed: ${error.message}`);
            }
            throw error;
        }
    }

    async findElement(
        page: Page,
        elementType: string,
        identifier: string
    ): Promise<ElementLocation | null> {
        // Add salon-specific context to the search
        const salonContext = `Look for ${elementType} that matches "${identifier}" in the context of salon appointments and services.`;
        const query = `${salonContext} Return only the matching element in the JSON response.`;

        try {
            const result = await this.analyzeScreenshot(page, query);
            return (
                result.elements.find(
                    (el) =>
                        el.type === elementType &&
                        el.text
                            ?.toLowerCase()
                            .includes(identifier.toLowerCase())
                ) || null
            );
        } catch (error) {
            console.error(
                `Failed to find element ${elementType}:${identifier}:`,
                error
            );
            return null;
        }
    }

    private parseGeminiResponse(response: string): AnalysisResult {
        try {
            const elements: ElementLocation[] = [];
            const lines = response.split("\n");

            let currentElement: Partial<ElementLocation> | null = null;

            for (const line of lines) {
                const trimmedLine = line.trim().toLowerCase();

                // Start new element on type indicators
                if (
                    trimmedLine.includes("button:") ||
                    trimmedLine.includes("input:") ||
                    trimmedLine.includes("text:") ||
                    trimmedLine.includes("image:") ||
                    trimmedLine.includes("timeslot:") || // Added for salon-specific elements
                    trimmedLine.includes("service:") // Added for salon-specific elements
                ) {
                    if (currentElement?.type && currentElement?.boundingBox) {
                        elements.push(currentElement as ElementLocation);
                    }
                    currentElement = {
                        type: this.extractElementType(trimmedLine),
                        confidence: 0.8,
                    };
                }

                // Extract coordinates
                if (currentElement && trimmedLine.includes("coordinates:")) {
                    const coords = this.extractCoordinates(trimmedLine);
                    if (coords) {
                        currentElement.boundingBox = coords;
                    }
                }

                // Extract text content
                if (currentElement && trimmedLine.includes("text:")) {
                    currentElement.text = line.split("text:")[1]?.trim();
                }
            }

            // Add last element if exists
            if (currentElement?.type && currentElement?.boundingBox) {
                elements.push(currentElement as ElementLocation);
            }

            return {
                elements,
                rawResponse: response,
            };
        } catch (error) {
            console.error("Failed to parse Gemini response:", error);
            return {
                elements: [],
                rawResponse: response,
            };
        }
    }

    private extractElementType(line: string): ElementLocation["type"] {
        if (line.includes("button")) return "button";
        if (line.includes("input")) return "input";
        if (line.includes("image")) return "image";
        if (line.includes("timeslot")) return "button"; // Treat timeslots as buttons
        if (line.includes("service")) return "button"; // Treat service options as buttons
        return "text";
    }

    private extractCoordinates(
        line: string
    ): ElementLocation["boundingBox"] | null {
        try {
            const numbers = line.match(/\d+/g)?.map(Number);
            if (numbers && numbers.length >= 4) {
                return {
                    x: numbers[0],
                    y: numbers[1],
                    width: numbers[2],
                    height: numbers[3],
                };
            }
        } catch (error) {
            console.error("Failed to extract coordinates:", error);
        }
        return null;
    }
}

interface ElementLocation {
    type: "button" | "input" | "text" | "image";
    text?: string;
    confidence: number;
    boundingBox: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}

interface AnalysisResult {
    elements: ElementLocation[];
    rawResponse: string;
}
