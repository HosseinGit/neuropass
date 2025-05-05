// public/script.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"; // Use latest 10.x version
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getFirestore,
    collection,
    addDoc,
    query,
    // where, // Not currently used, but keep if needed later
    orderBy,
    limit,
    onSnapshot // For real-time updates
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyCFviEOu-Y1_-Pf3WeLjgXU5lZI42N-EQg",
    authDomain: "iris-neuropass.firebaseapp.com",
    projectId: "iris-neuropass",
    storageBucket: "iris-neuropass.firebasestorage.app",
    messagingSenderId: "470784656826",
    appId: "1:470784656826:web:49bceaf81642ec54ad8983",
    measurementId: "G-6E9618FLL4"
  };


// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app); // Initialize Firestore

// DOM Elements
const authContainer = document.getElementById('auth-container');
const chatContainer = document.getElementById('chat-container');
const loginButton = document.getElementById('login-button');
const signupButton = document.getElementById('signup-button');
const logoutButton = document.getElementById('logout-button');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const authError = document.getElementById('auth-error');
const chatError = document.getElementById('chat-error');
const userEmailSpan = document.getElementById('user-email');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const chatHistoryDiv = document.getElementById('chat-history');
const loadingIndicator = document.getElementById('loading-indicator');

let currentUserId = null;
let unsubscribeChat = null; // To stop listening to Firestore when logged out

// --- Authentication Logic ---
signupButton.addEventListener('click', async () => {
    const email = emailInput.value;
    const password = passwordInput.value;
    authError.textContent = ''; // Clear previous errors
    // Basic validation
    if (!email || !password) {
         authError.textContent = "Please enter both email and password.";
         return;
    }
     if (password.length < 6) {
         authError.textContent = "Password should be at least 6 characters.";
         return;
     }

    try {
        await createUserWithEmailAndPassword(auth, email, password);
        // User will be logged in automatically by onAuthStateChanged
    } catch (error) {
        console.error("Signup Error:", error);
        authError.textContent = `Signup failed: ${error.code}`; // Provide clearer error code
    }
});

loginButton.addEventListener('click', async () => {
    const email = emailInput.value;
    const password = passwordInput.value;
    authError.textContent = ''; // Clear previous errors
     if (!email || !password) {
         authError.textContent = "Please enter both email and password.";
         return;
     }

    try {
        await signInWithEmailAndPassword(auth, email, password);
        // User will be logged in automatically by onAuthStateChanged
    } catch (error) {
        console.error("Login Error:", error);
        authError.textContent = `Login failed: ${error.code}`; // Provide clearer error code
    }
});

logoutButton.addEventListener('click', async () => {
    try {
        if (unsubscribeChat) { // Ensure listener is stopped BEFORE sign out
            unsubscribeChat();
            unsubscribeChat = null;
            console.log("Stopped Firestore listener.");
        }
        await signOut(auth);
        // UI changes handled by onAuthStateChanged
    } catch (error) {
        console.error("Logout Error:", error);
    }
});

// Listen for Auth State Changes
onAuthStateChanged(auth, (user) => {
    if (user) {
        // User is signed in
        if (currentUserId !== user.uid) { // Only run if user *changed* or first login
             console.log("User logged in:", user.uid, user.email);
            currentUserId = user.uid;
            userEmailSpan.textContent = user.email;
            authContainer.style.display = 'none';
            chatContainer.style.display = 'block';
            messageInput.value = ''; // Clear input on login
            chatError.textContent = '';
            authError.textContent = '';
            // Load/Listen to chat history for this user
            loadChatHistory(currentUserId);
        }
    } else {
        // User is signed out
         if (currentUserId !== null) { // Only run if user was previously logged in
            console.log("User logged out");
            currentUserId = null;
            // Stop listener if it exists (already handled in logout, but safe here too)
            if (unsubscribeChat) {
                unsubscribeChat();
                unsubscribeChat = null;
            }
            chatHistoryDiv.innerHTML = ''; // Clear chat history display
            authContainer.style.display = 'block';
            chatContainer.style.display = 'none';
        }
    }
});

// --- Chat Logic ---

function displayMessage(sender, text) {
    const messageDiv = document.createElement('div');
    // Basic sanitization (replace < and > to prevent HTML injection) - More robust needed for production
    const sanitizedText = text.replace(/</g, "<").replace(/>/g, ">");
    messageDiv.innerHTML = sanitizedText; // Use innerHTML carefully after basic sanitization
    messageDiv.className = sender === 'user' ? 'user-message' : 'iris-message'; // Use className
    chatHistoryDiv.appendChild(messageDiv);
    // Scroll to bottom smoothly
    chatHistoryDiv.scrollTo({ top: chatHistoryDiv.scrollHeight, behavior: 'smooth' });
}

async function saveMessageToFirestore(userId, sender, text) {
     if (!userId) return; // Don't save if not logged in
    try {
        // Path: /chats/{userId}/messages/{messageId}
        const chatCollectionRef = collection(db, "chats", userId, "messages");
        await addDoc(chatCollectionRef, {
            sender: sender, // 'user' or 'iris'
            text: text,
            timestamp: new Date() // Use client timestamp for simplicity in test
        });
        console.log("Message saved:", sender, text.substring(0, 20) + "..."); // Log confirmation
    } catch (error) {
        console.error("Error saving message to Firestore:", error);
        chatError.textContent = "Error saving message."; // Inform user
    }
}


function loadChatHistory(userId) {
    if (!userId) return;

    // Stop previous listener if exists
     if (unsubscribeChat) {
         unsubscribeChat();
         console.log("Stopped previous listener before loading new history.");
     }

    chatHistoryDiv.innerHTML = ''; // Clear previous history display

    const chatCollectionRef = collection(db, "chats", userId, "messages");
    const q = query(chatCollectionRef, orderBy("timestamp", "desc"), limit(30)); // Get last 30, newest first

    console.log("Setting up Firestore listener for user:", userId);
    // Use onSnapshot for real-time updates
    unsubscribeChat = onSnapshot(q, (querySnapshot) => {
        console.log(`Received ${querySnapshot.docs.length} messages from snapshot.`);
        // Since we query descending, we need to reverse for display order
         const messages = [];
         querySnapshot.forEach((doc) => {
             messages.push(doc.data());
         });
         messages.reverse(); // Now oldest of the batch is first

         chatHistoryDiv.innerHTML = ''; // Clear before loading/re-loading snapshot
         messages.forEach(data => {
             displayMessage(data.sender, data.text);
         });

         // Scroll to bottom after loading/updating
         if (chatHistoryDiv.innerHTML !== '') { // Only scroll if there's content
             chatHistoryDiv.scrollTo({ top: chatHistoryDiv.scrollHeight, behavior: 'auto' }); // Auto scroll on load
         }

    }, (error) => {
        console.error("Error listening to chat history:", error);
        chatError.textContent = "Could not load chat history.";
        unsubscribeChat = null; // Clear listener on error
    });
}


sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { // Send on Enter, allow Shift+Enter for newline (though input is single line here)
        e.preventDefault(); // Prevent default form submission/newline
        sendMessage();
    }
});

async function sendMessage() {
    const messageText = messageInput.value.trim();
    if (!messageText || !currentUserId || sendButton.disabled) return; // Need text, logged-in user, and not already sending

    const messageToSend = messageText; // Grab text before clearing
    messageInput.value = ''; // Clear input immediately
    chatError.textContent = ''; // Clear previous errors

    // 1. Display user message immediately & save
    displayMessage('user', messageToSend); // Display the captured text
    await saveMessageToFirestore(currentUserId, 'user', messageToSend); // Save the captured text

    loadingIndicator.style.display = 'block'; // Show thinking indicator
    sendButton.disabled = true; // Prevent multiple sends
    messageInput.disabled = true; // Disable input while waiting

    try {
        // 2. Call the backend Netlify function
        // Ensure the path is correct for Netlify Functions
        const functionUrl = '/.netlify/functions/chat';
        console.log("Sending message to backend:", functionUrl, messageToSend.substring(0, 20) + "...");

        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            // Send message in the correct format expected by backend
            body: JSON.stringify({ message: messageToSend /* TODO: Add history here if needed */ })
        });

        console.log("Received response status:", response.status);

        if (!response.ok) {
            let errorMsg = `Network response was not ok: ${response.statusText}`;
            try {
                 const errorData = await response.json();
                 console.error("Backend error data:", errorData);
                 errorMsg += ` - ${errorData.error || 'Unknown backend error'}`;
            } catch (parseError) {
                console.error("Could not parse error response:", parseError);
                errorMsg += ' (Could not parse error response)';
            }
            throw new Error(errorMsg);
        }

        const data = await response.json();
        console.log("Received reply from backend:", data.reply.substring(0, 30) + "...");

        // 3. Display Iris's response & save
        if (data.reply) {
            displayMessage('iris', data.reply);
            await saveMessageToFirestore(currentUserId, 'iris', data.reply);
        } else {
             console.warn("Received empty reply from backend.");
             // Optionally display a generic message like "Iris didn't have a response."
        }

    } catch (error) {
        console.error('Error during sendMessage:', error);
        chatError.textContent = `Error: ${error.message || "Could not reach Iris."}`;
        // Display the error message in the chat for visibility?
        displayMessage('iris', `[System Error: ${error.message || "Could not reach Iris."}]`);

    } finally {
         // Runs whether try succeeded or failed
         loadingIndicator.style.display = 'none'; // Hide indicator
         sendButton.disabled = false; // Re-enable send
         messageInput.disabled = false; // Re-enable input
         messageInput.focus(); // Put cursor back in input
    }
}