export const GEMINI_CONFIG = {
    model: "gemini-1.5-flash",
    mimeType: "image/jpeg",
} as const;

export const PROMPTS = {
    baseAnalysis: `
        Analyze this Tinder webpage screenshot.
        Focus on identifying:
        1. Interactive elements (buttons, inputs, links)
        2. Their exact locations on screen (x, y coordinates)
        3. Text content and labels
        4. Element types and states (enabled/disabled)

        Format the response as JSON with this structure:
        {
            "elements": [
                {
                    "type": "button|input|text|image",
                    "text": "element text or label",
                    "confidence": 0.95,
                    "boundingBox": {
                        "x": 100,
                        "y": 200,
                        "width": 50,
                        "height": 30
                    }
                }
            ]
        }
    `.trim(),
} as const;
