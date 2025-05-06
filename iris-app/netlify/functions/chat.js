// netlify/functions/chat.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Access your API key securely from Netlify environment variables
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- DEFINE YOUR IRIS SYSTEM PROMPT ---
const IRIS_SYSTEM_PROMPT = `
YOU ARE: Iris, a personal coach representing Neuropass.
Your primary goal is to help users with self-development based on the principles of neuroplasticity.
You are empathetic, insightful, supportive, and empowering.
You should guide users to explore their thoughts, feelings, and behaviors, helping them identify areas for growth and actionable steps they can take.
You can ask clarifying questions to understand the user better.
Your tone should be calm, encouraging, and professional, yet warm and approachable.
Avoid giving direct medical advice or diagnoses. Instead, encourage users to consult with professionals if they express severe distress or mention conditions requiring medical attention.
Focus on practical strategies related to mindset, habit formation, learning, emotional regulation, and resilience, all through the lens of neuroplasticity (the brain's ability to change).
You can gently introduce concepts of neuroplasticity when relevant, explaining how understanding brain function can empower self-change.
If a user's message is unclear or very short, ask for more details to better assist them.
If a user expresses gratitude, acknowledge it warmly.
Remember the user's context if provided in the chat history.
If a topic is outside your scope as a self-development coach (e.g., complex financial advice, specific technical troubleshooting), politely state that and try to steer the conversation back to personal growth.
Maintain a positive and hopeful outlook.
`; // Make sure this is one big string literal

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
    }

    try {
        const body = JSON.parse(event.body);
        const userMessage = body.message; // Current user message
        const receivedChatHistory = body.chatHistory || []; // History from frontend
        // const userId = body.userId; // Available if needed for logging or other backend logic
        // const chatId = body.chatId; // Available if needed

        if (!userMessage && receivedChatHistory.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: "Bad Request: No message or history provided." }) };
        }
        if (!userMessage && receivedChatHistory.length > 0) {
             // This case is unusual for sendMessage, but if it happens,
             // let Gemini respond based on history only.
             // For startChat, the last message in history is often the "user" message.
        }


        // Ensure history is in the correct format (it should be if frontend sends it correctly)
        // [{role: "user", parts: [{text: "..."}]}, {role: "model", parts: [{text: "..."}]}]
        const BANNED_WORDS = ["example_banned_word_1", "example_banned_word_2"] //Replace with your list

        const containsBannedWord = (text) => {
            if (!text || typeof text !== 'string') return false; // Ensure text is a non-null string
            return BANNED_WORDS.some(word => text.toLowerCase().includes(word.toLowerCase()));
        };
        
        // Check userMessage for banned words
        if (containsBannedWord(userMessage)) {
            console.warn("User message contained a banned word.");
            return {
                statusCode: 200, // Still OK, but provide a canned response
                body: JSON.stringify({ reply: "I'm sorry, but I cannot process requests containing certain terms. Let's focus on your Neuropass goals." }),
            };
        }

        // Check chat history for banned words (optional, but good for context)
        if (receivedChatHistory.some(entry => entry.parts.some(part => containsBannedWord(part.text)))) {
            console.warn("Chat history contained a banned word.");
            // Decide how to handle this. You might still proceed or return a canned response.
            // For now, we'll proceed but log it. Could be stricter.
        }

        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash-latest", // Or your preferred model
            systemInstruction: IRIS_SYSTEM_PROMPT,
        });

        const chat = model.startChat({
            history: receivedChatHistory, // Pass the conversation history
            generationConfig: {
                // maxOutputTokens: 250, // Optional: Adjust as needed
                // temperature: 0.7,     // Optional: Adjust creativity
            }
        });

        // If userMessage is present, send it.
        // If userMessage is empty but history is not, Gemini will respond based on history.
        // However, the frontend structure usually ensures userMessage is the latest one to send.
        const messageToSendToGemini = userMessage || (receivedChatHistory.length > 0 ? receivedChatHistory[receivedChatHistory.length -1].parts[0].text : "..."); //Fall back just in case
        
        if (!messageToSendToGemini || messageToSendToGemini.trim() === "") {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "Cannot send an empty message to the AI." }),
            };
        }

        const result = await chat.sendMessage(messageToSendToGemini);
        const response = await result.response;
        const irisResponseText = response.text();

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reply: irisResponseText }),
        };

    } catch (error) {
        console.error("Error in Netlify function (chat.js):", error);
        if (error.message && error.message.includes('SAFETY')) {
            return {
                statusCode: 200,
                body: JSON.stringify({ reply: "I cannot provide a response to that topic due to safety guidelines. Perhaps we could focus back on your Neuropass goals?" }),
            };
        }
        // Check for other specific error types if needed
        // e.g., error.response && error.response.status === 429 for rate limits

        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Internal Server Error: Could not get a response from Iris." }),
        };
    }
};