import { chromium, Browser, Page } from "playwright";
import { Provider, IAgentRuntime, ICacheManager } from "@elizaos/core";
import { ScreenAnalysisProvider } from "./screenAnalysisProvider";

export class TinderProvider implements Provider {
    private static instance: TinderProvider;
    private browser: Browser | null = null;
    private page: Page | null = null;
    private screenAnalyzer: ScreenAnalysisProvider;
    private runtime: IAgentRuntime;

    private constructor() {
        this.screenAnalyzer = ScreenAnalysisProvider.getInstance();
    }

    public static getInstance(): TinderProvider {
        if (!TinderProvider.instance) {
            TinderProvider.instance = new TinderProvider();
        }
        return TinderProvider.instance;
    }

    get(): any {
        return this.page;
    }

    setRuntime(runtime: IAgentRuntime) {
        this.runtime = runtime;
    }

    async getCachedCookies(identifier: string): Promise<any[] | null> {
        if (!this.runtime?.cacheManager) return null;
        const cacheManager = this.runtime.cacheManager as ICacheManager;
        return await cacheManager.get(`tinder/cookies/${identifier}`);
    }

    async cacheCookies(identifier: string, cookies: any[]): Promise<void> {
        if (!this.runtime?.cacheManager) return;
        const cacheManager = this.runtime.cacheManager as ICacheManager;
        await cacheManager.set(`tinder/cookies/${identifier}`, cookies);
    }

    async init() {
        if (!this.browser) {
            const context = await chromium.launchPersistentContext(
                "user-data",
                {
                    headless: false,
                    args: [
                        "--disable-blink-features=AutomationControlled",
                        "--disable-features=IsolateOrigins,site-per-process",
                    ],
                    userAgent:
                        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                }
            );
            this.page = context.pages()[0];

            // Override navigator.webdriver
            await this.page.addInitScript(() => {
                Object.defineProperty(navigator, "webdriver", {
                    get: () => undefined,
                });
            });

            // Try to restore cookies if available
            const phoneNumber = process.env.TINDER_PHONE_NUMBER;
            if (phoneNumber) {
                const cookies = await this.getCachedCookies(phoneNumber);
                if (cookies) {
                    await this.setCookiesFromArray(cookies);
                }
            }
        }
    }

    private async randomDelay(
        min: number = 1500,
        max: number = 3500
    ): Promise<void> {
        const delay = Math.floor(Math.random() * (max - min)) + min;
        await new Promise((resolve) => setTimeout(resolve, delay));
    }

    async setCookiesFromArray(cookiesArray: any[]) {
        if (!this.page) throw new Error("Browser not initialized");
        await this.page.context().addCookies(cookiesArray);
    }

    async navigateToLogin() {
        if (!this.page) throw new Error("Browser not initialized");

        try {
            // Navigate to Tinder
            await this.page.goto("https://tinder.com");

            // Wait for page to load and stabilize
            await this.page.waitForLoadState("networkidle");
            await this.page.waitForTimeout(3000);

            // Take debug screenshot
            await this.page.screenshot({ path: "tinder-initial-load.jpg" });

            // Handle cookie consent if present
            const cookieButton = this.page.getByRole("button", {
                name: /I accept|Accept/i,
            });
            if (await cookieButton.isVisible()) {
                await cookieButton.click();
                await this.page.waitForTimeout(1000);
            }

            // Try multiple strategies to find the login button
            let loginButton;

            // Strategy 1: Try direct text match
            loginButton = this.page.getByText("Log in", { exact: true });
            if (!loginButton.isVisible()) {
                // Strategy 2: Try button role
                loginButton = this.page.getByRole("button", {
                    name: "Log in",
                });
            }
            if (!(await loginButton.isVisible())) {
                // Strategy 3: Try link role
                loginButton = this.page.getByRole("link", {
                    name: "Log in",
                });
            }
            if (!(await loginButton.isVisible())) {
                // Strategy 4: Try case-insensitive partial match
                loginButton = this.page.getByText(/log.?in/i, {
                    exact: false,
                });
            }

            if (!(await loginButton.isVisible())) {
                // Take a screenshot of the failure state
                await this.page.screenshot({
                    path: "login-button-not-found.jpg",
                });

                const errorDetails = {
                    timestamp: new Date().toISOString(),
                    url: this.page.url(),
                    screenshot: "login-button-not-found.jpg",
                    type: "ELEMENT_NOT_FOUND",
                    message: "Could not find login button using any strategy",
                };
                console.error(
                    "Navigation failed:",
                    JSON.stringify(errorDetails, null, 2)
                );
                throw new Error(
                    "Could not find the login button - please check if the website layout has changed"
                );
            }

            // Click the found login button
            await loginButton.click();
        } catch (error) {
            const errorContext = {
                timestamp: new Date().toISOString(),
                error: error.message,
                url: this.page?.url(),
                screenshot: "tinder-error-state.jpg",
            };
            await this.page?.screenshot({ path: errorContext.screenshot });
            console.error(
                "Detailed navigation error:",
                JSON.stringify(errorContext, null, 2)
            );
            throw error;
        }
    }

    async loginWithPhone(phoneNumber: string) {
        if (!this.page) throw new Error("Browser not initialized");

        try {
            // Wait for the login modal to be visible
            await this.randomDelay(2000, 4000);

            // First check for "More Options" button and click if present
            const moreOptionsButton = this.page.getByRole("button", {
                name: /More Options|More ways to log in/i,
            });
            if (await moreOptionsButton.isVisible()) {
                await moreOptionsButton.click();
                await this.randomDelay();
            }

            // Click "Log in with phone number" button
            const phoneLoginButton = await this.page.getByRole("button", {
                name: /Log in with phone number/i,
            });
            if (!(await phoneLoginButton.isVisible())) {
                throw new Error("Phone login option not found");
            }
            await phoneLoginButton.click();
            await this.randomDelay();

            // Find phone input field - try multiple strategies
            let phoneInput = this.page.getByPlaceholder(/phone number/i);
            if (!(await phoneInput.isVisible())) {
                phoneInput = this.page.getByRole("textbox", {
                    name: /phone/i,
                });
            }
            if (!(await phoneInput.isVisible())) {
                phoneInput = this.page.locator('input[type="tel"]');
            }

            if (!(await phoneInput.isVisible())) {
                throw new Error("Phone input field not found");
            }

            // Enter phone number with human-like typing
            await phoneInput.click();
            for (const digit of phoneNumber) {
                await phoneInput.type(digit);
                await this.randomDelay(100, 300); // Random delay between keystrokes
            }

            await this.randomDelay();

            // Find and click continue button
            const continueButton = this.page.getByRole("button", {
                name: /Continue|Submit|Next/i,
            });
            if (!(await continueButton.isVisible())) {
                throw new Error("Continue button not found");
            }
            await continueButton.click();

            // Wait for OTP input (manual entry)
            console.log("Waiting for manual OTP entry (2 minutes)...");
            await this.page.waitForTimeout(120000);

            // After successful login, cache the cookies
            const cookies = await this.page.context().cookies();
            await this.cacheCookies(phoneNumber, cookies);

            return await this.isLoggedIn();
        } catch (error) {
            console.error("Login failed:", error);
            await this.page.screenshot({ path: "login-failed.jpg" });
            return false;
        }
    }

    async isLoggedIn(): Promise<boolean> {
        if (!this.page) throw new Error("Browser not initialized");

        try {
            // Look for elements that indicate logged-in state
            const result = await this.screenAnalyzer.analyzeScreenshot(
                this.page,
                "Check if user is logged in by looking for match tab or profile elements"
            );
            return result.elements.some(
                (el) =>
                    el.type === "button" &&
                    (el.text?.toLowerCase().includes("match") ||
                        el.text?.toLowerCase().includes("profile"))
            );
        } catch {
            return false;
        }
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
