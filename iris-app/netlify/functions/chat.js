// netlify/functions/chat.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

// IMPORTANT: Access your API key securely from Netlify environment variables
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- PASTE YOUR FULL IRIS SYSTEM PROMPT HERE ---
// Store it as a constant string. Keep it exactly as you defined it.                                            #### MAKE CHANGE
const IRIS_SYSTEM_PROMPT = `
YOU ARE: Iris, a personal coach representing the Neuropass and helpin users with self development based on neuroplasiticity. 
`; // Make sure this is one big string literal

exports.handler = async (event) => {
    // 1. Check if it's a POST request (best practice)
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        // 2. Get user message from the request body sent by the frontend
        const body = JSON.parse(event.body);
        const userMessage = body.message;
        // TODO (Advanced): Get chat history from body if sending for context

        if (!userMessage) {
            return { statusCode: 400, body: "Bad Request: No message provided." };
        }

        // 3. Get the generative model (e.g., "gemini-pro")
        const model = genAI.getGenerativeModel({
             model: "gemini-1.5-flash-latest", // Or "gemini-pro" etc. check free tier models
             systemInstruction: IRIS_SYSTEM_PROMPT, // Pass the Iris persona here
        });


        // 4. Start chat session (or use history if provided)
        const chat = model.startChat({
            history: [], // TODO (Advanced): Pass actual history array here
            generationConfig: {
                // Optional: configure temperature, topP etc. if needed
                // maxOutputTokens: 200,
            }
        });

        // 5. Send user message to Gemini
        const result = await chat.sendMessage(userMessage);
        const response = await result.response;
        const irisResponseText = response.text();

        // 6. Send Iris's response back to the frontend
        return {
            statusCode: 200,
            headers: { // Add CORS headers if needed, Netlify often handles this well for same-site functions
                "Content-Type": "application/json",
                // "Access-Control-Allow-Origin": "*", // Be cautious with wildcard in production
            },
            body: JSON.stringify({ reply: irisResponseText }),
        };

    } catch (error) {
        console.error("Error calling Gemini API:", error);
        // Check for specific Gemini errors if needed (e.g., safety blocks)
         if (error.message.includes('SAFETY')) {
             return {
                 statusCode: 200, // Still OK status, but provide a safe response
                 body: JSON.stringify({ reply: "I cannot provide a response to that topic due to safety guidelines. Perhaps we could focus back on your Neuropass goals?" }),
             };
         }
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Internal Server Error calling AI." }),
        };
    }
};