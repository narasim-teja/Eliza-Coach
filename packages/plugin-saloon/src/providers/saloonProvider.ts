import { chromium, Browser, Page } from "playwright";
import { Provider, IAgentRuntime } from "@elizaos/core";
import { ScreenAnalysisProvider } from "./screenAnalysisProvider";

export class SaloonProvider implements Provider {
    private static instance: SaloonProvider;
    private browser: Browser | null = null;
    private page: Page | null = null;
    private screenAnalyzer: ScreenAnalysisProvider;
    private runtime: IAgentRuntime;

    private constructor() {
        this.screenAnalyzer = ScreenAnalysisProvider.getInstance();
    }

    public static getInstance(): SaloonProvider {
        if (!SaloonProvider.instance) {
            SaloonProvider.instance = new SaloonProvider();
        }
        return SaloonProvider.instance;
    }

    get(): any {
        return this.page;
    }

    setRuntime(runtime: IAgentRuntime) {
        this.runtime = runtime;
    }

    async init() {
        if (!this.browser) {
            this.browser = await chromium.launch({
                headless: false,
                args: [
                    "--disable-blink-features=AutomationControlled",
                    "--disable-features=IsolateOrigins,site-per-process",
                ],
            });

            const context = await this.browser.newContext({
                userAgent:
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            });

            this.page = await context.newPage();
            await this.page.addInitScript(() => {
                Object.defineProperty(navigator, "webdriver", {
                    get: () => undefined,
                });
            });
        }
    }

    private async randomDelay(
        min: number = 1500,
        max: number = 3500
    ): Promise<void> {
        const delay = Math.floor(Math.random() * (max - min)) + min;
        await new Promise((resolve) => setTimeout(resolve, delay));
    }

    async navigateToSupercuts() {
        if (!this.page) throw new Error("Browser not initialized");

        try {
            await this.page.goto("https://www.supercuts.com");
            await this.page.waitForLoadState("networkidle");

            // Wait longer for initial load and popup
            await this.randomDelay(3000, 4000);

            // Take and analyze initial screenshot
            await this.page.screenshot({ path: "supercuts-initial-load.jpg" });
            const initialAnalysis = await this.screenAnalyzer.analyzeScreenshot(
                this.page,
                "Analyze the current page state. Look for: 1) Any popup/modal dialogs 2) Sign in button 3) Check-in button 4) Close buttons or X symbols"
            );

            console.log("Initial page analysis:", initialAnalysis.rawResponse);

            // First handle the popup by looking for the close button
            const closeButton = initialAnalysis.elements.find(
                (el) =>
                    el.type === "image" &&
                    el.text?.toLowerCase().includes("close")
            );

            if (closeButton && closeButton.boundingBox) {
                // Click the close button
                await this.page.mouse.click(
                    closeButton.boundingBox.x +
                        closeButton.boundingBox.width / 2,
                    closeButton.boundingBox.y +
                        closeButton.boundingBox.height / 2
                );
                await this.randomDelay(1000);
            } else {
                // Fallback: click in the top-right area
                await this.page.mouse.click(650, 160);
                await this.randomDelay(1000);
            }

            // Take another screenshot to analyze the main page state
            await this.page.screenshot({ path: "main-page.jpg" });
            const mainPageAnalysis =
                await this.screenAnalyzer.analyzeScreenshot(
                    this.page,
                    "Find the CHECK-IN button or link in the navigation area"
                );

            console.log("Main page analysis:", mainPageAnalysis.rawResponse);

            // Look for CHECK-IN button with exact coordinates
            const checkInButton = mainPageAnalysis.elements.find(
                (el) =>
                    (el.type === "button" || el.type === "text") &&
                    el.text?.toUpperCase().includes("CHECK-IN")
            );

            if (checkInButton && checkInButton.boundingBox) {
                // Click the exact center of the CHECK-IN button
                await this.page.mouse.click(
                    checkInButton.boundingBox.x +
                        checkInButton.boundingBox.width / 2,
                    checkInButton.boundingBox.y +
                        checkInButton.boundingBox.height / 2
                );
                await this.randomDelay(1000);
            } else {
                // Fallback: try clicking at the known coordinates from the analysis
                await this.page.mouse.click(725 + 50, 57 + 14); // Center of the CHECK-IN button
                await this.randomDelay(1000);
            }

            // Take screenshot of location input page
            await this.page.screenshot({ path: "location-input.jpg" });
            const locationPageAnalysis =
                await this.screenAnalyzer.analyzeScreenshot(
                    this.page,
                    "Find the location/zipcode input field and the Find a Salon button"
                );

            console.log(
                "Location page analysis:",
                locationPageAnalysis.rawResponse
            );

            // Find and fill location input
            const pincode = process.env.SUPERCUTS_PINCODE;
            if (!pincode) {
                throw new Error(
                    "SUPERCUTS_PINCODE not configured in environment"
                );
            }

            const inputElement = locationPageAnalysis.elements.find(
                (el) =>
                    el.type === "input" ||
                    (el.type === "text" &&
                        el.text?.toLowerCase().includes("zip"))
            );

            if (inputElement) {
                await this.clickElement(inputElement);
                await this.page.keyboard.type(pincode);
                await this.randomDelay(1000);

                // Look for Find a Salon button
                const findSalonElement = locationPageAnalysis.elements.find(
                    (el) =>
                        (el.type === "button" || el.type === "text") &&
                        el.text?.toLowerCase().includes("find a salon")
                );

                if (findSalonElement) {
                    await this.clickElement(findSalonElement);
                    await this.randomDelay(1000);
                }
            }

            // Wait for results and take screenshot
            await this.page.waitForLoadState("networkidle");
            await this.randomDelay(1000);
            await this.page.screenshot({ path: "location-results.jpg" });

            // Analyze results page
            const resultsAnalysis = await this.screenAnalyzer.analyzeScreenshot(
                this.page,
                "Check for no results message or book buttons"
            );

            console.log("Results page analysis:", resultsAnalysis.rawResponse);

            // Check for no results
            const hasNoResults = resultsAnalysis.elements.some(
                (el) =>
                    el.text?.toLowerCase().includes("no locations found") ||
                    el.text?.toLowerCase().includes("no results")
            );

            if (hasNoResults) {
                console.log("No salon locations found in the area");
                return false;
            }

            // Look for Book button
            const bookButton = resultsAnalysis.elements.find(
                (el) =>
                    (el.type === "button" || el.type === "text") &&
                    (el.text?.toLowerCase().includes("book") ||
                        el.text?.toLowerCase().includes("schedule"))
            );

            if (bookButton) {
                await this.clickElement(bookButton);
                await this.randomDelay(1000);
                return true;
            }

            return false;
        } catch (error) {
            console.error("Navigation failed:", error);
            await this.page.screenshot({ path: "navigation-error.jpg" });
            throw error;
        }
    }

    async bookAppointment(timeRange: string) {
        if (!this.page) throw new Error("Browser not initialized");

        try {
            // Wait for appointment page to load
            await this.page.waitForLoadState("networkidle");
            await this.randomDelay();

            // Take screenshot for analysis
            await this.page.screenshot({ path: "appointment-page.jpg" });

            // Analyze the page to find available time slots
            const result = await this.screenAnalyzer.analyzeScreenshot(
                this.page,
                `Find available time slot between ${timeRange}`
            );

            const timeSlot = result.elements.find(
                (el) =>
                    el.type === "button" &&
                    el.text?.toLowerCase().includes(timeRange.toLowerCase())
            );

            if (!timeSlot) {
                throw new Error(
                    `No available time slots found for ${timeRange}`
                );
            }

            await this.clickElement(timeSlot);
            await this.randomDelay();

            // Handle login if required
            const loginForm = await this.page.getByRole("form");
            if (await loginForm.isVisible()) {
                await this.login();
            }

            // Confirm booking
            const confirmButton = this.page.getByRole("button", {
                name: /confirm|book|schedule/i,
            });
            if (!(await confirmButton.isVisible())) {
                throw new Error("Confirm button not found");
            }
            await confirmButton.click();
            await this.randomDelay();

            // Wait for confirmation
            await this.page.waitForLoadState("networkidle");
            await this.page.screenshot({ path: "booking-confirmation.jpg" });

            return true;
        } catch (error) {
            console.error("Booking failed:", error);
            await this.page.screenshot({ path: "booking-error.jpg" });
            throw error;
        }
    }

    private async login() {
        const email = process.env.SUPERCUTS_EMAIL;
        const password = process.env.SUPERCUTS_PASSWORD;

        if (!email || !password) {
            throw new Error("Supercuts credentials not configured");
        }

        const emailInput = this.page?.getByLabel(/email/i);
        const passwordInput = this.page?.getByLabel(/password/i);

        if (
            !(await emailInput?.isVisible()) ||
            !(await passwordInput?.isVisible())
        ) {
            throw new Error("Login form not found");
        }

        await emailInput.fill(email);
        await this.randomDelay(100, 300);
        await passwordInput.fill(password);
        await this.randomDelay();

        const loginButton = this.page?.getByRole("button", {
            name: /sign in|login/i,
        });
        if (!(await loginButton?.isVisible())) {
            throw new Error("Login button not found");
        }
        await loginButton.click();
        await this.randomDelay();
    }

    private async clickElement(element: {
        boundingBox: { x: number; y: number; width: number; height: number };
    }) {
        if (!this.page) throw new Error("Browser not initialized");

        await this.page.mouse.click(
            element.boundingBox.x + element.boundingBox.width / 2,
            element.boundingBox.y + element.boundingBox.height / 2
        );
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
        }
    }
}
