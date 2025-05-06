// public/script.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
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
    doc,
    setDoc,
    getDoc,
    query,
    orderBy,
    limit,
    onSnapshot,
    serverTimestamp // For server-side timestamps
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Your Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyCFviEOu-Y1_-Pf3WeLjgXU5lZI42N-EQg", // Replace with your actual API key
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
const db = getFirestore(app);

// DOM Elements
const sidebar = document.getElementById('sidebar');
const authContainer = document.getElementById('auth-container');
const chatContainer = document.getElementById('chat-container');
const loginButton = document.getElementById('login-button');
const signupButton = document.getElementById('signup-button');
const logoutButtonSidebar = document.getElementById('logout-button-sidebar');
const logoutButtonMain = document.getElementById('logout-button-main');
const nicknameInput = document.getElementById('nickname');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const authError = document.getElementById('auth-error');
const chatError = document.getElementById('chat-error');
const userDisplayNameSpan = document.getElementById('user-display-name');
const userInfoSidebarSpan = document.getElementById('user-info-sidebar');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const chatHistoryDiv = document.getElementById('chat-history');
const loadingIndicator = document.getElementById('loading-indicator');
const newChatButton = document.getElementById('new-chat-button');
const chatListUl = document.getElementById('chat-list');
const noChatSelectedDiv = document.getElementById('no-chat-selected');

let currentUserId = null;
let currentUserNickname = null;
let currentChatId = null;
let unsubscribeChatMessages = null;
let unsubscribeChatList = null;
let currentChatFormattedHistory = [];

// --- Auto-resize Textarea ---
messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto'; // Reset height
    let scrollHeight = messageInput.scrollHeight;
    const maxHeight = parseInt(window.getComputedStyle(messageInput).maxHeight); // Get max-height from CSS
    if (scrollHeight > maxHeight) {
        messageInput.style.height = maxHeight + 'px';
        messageInput.style.overflowY = 'auto'; // Show scrollbar if content exceeds max-height
    } else {
        messageInput.style.height = scrollHeight + 'px';
        messageInput.style.overflowY = 'hidden'; // Hide scrollbar if content is within max-height
    }
});


// --- Authentication Logic ---
signupButton.addEventListener('click', async () => {
    const nickname = nicknameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    authError.textContent = '';

    if (!nickname || !email || !password) {
        authError.textContent = "Please enter nickname, email, and password.";
        return;
    }
    if (password.length < 6) {
        authError.textContent = "Password should be at least 6 characters.";
        return;
    }
    if (nickname.length < 3) {
        authError.textContent = "Nickname should be at least 3 characters.";
        return;
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        // Store nickname in Firestore
        await setDoc(doc(db, "users", user.uid), {
            nickname: nickname,
            email: user.email, // Storing email here too can be useful
            createdAt: serverTimestamp()
        });
        currentUserNickname = nickname; // Set for immediate use
        // onAuthStateChanged will handle UI changes
    } catch (error) {
        console.error("Signup Error:", error);
        authError.textContent = `Signup failed: ${getFirebaseErrorMessage(error)}`;
    }
});

loginButton.addEventListener('click', async () => {
    const email = emailInput.value;
    const password = passwordInput.value;
    authError.textContent = '';
    if (!email || !password) {
        authError.textContent = "Please enter email and password.";
        return;
    }
    try {
        await signInWithEmailAndPassword(auth, email, password);
        // onAuthStateChanged will handle UI changes and nickname fetching
    } catch (error) {
        console.error("Login Error:", error);
        authError.textContent = `Login failed: ${getFirebaseErrorMessage(error)}`;
    }
});

const handleLogout = async () => {
    try {
        if (unsubscribeChatMessages) unsubscribeChatMessages();
        if (unsubscribeChatList) unsubscribeChatList();
        unsubscribeChatMessages = null;
        unsubscribeChatList = null;
        await signOut(auth);
        // UI changes handled by onAuthStateChanged
    } catch (error) {
        console.error("Logout Error:", error);
        chatError.textContent = "Logout failed. Please try again.";
    }
};
logoutButtonSidebar.addEventListener('click', handleLogout);
logoutButtonMain.addEventListener('click', handleLogout);


onAuthStateChanged(auth, async (user) => {
    if (user) { // User is signed in
        if (currentUserId !== user.uid) { // Only run if user *changed* or first login
            currentUserId = user.uid;

            // Fetch user's nickname
            try {
                const userDocRef = doc(db, "users", user.uid);
                const userDocSnap = await getDoc(userDocRef);
                if (userDocSnap.exists()) {
                    currentUserNickname = userDocSnap.data().nickname;
                } else {
                    console.warn("User document not found, using email as fallback for display.");
                    currentUserNickname = user.email.split('@')[0]; // Fallback
                    // Consider creating the user document here if it's missing from an old account
                    await setDoc(doc(db, "users", user.uid), {
                        nickname: currentUserNickname,
                        email: user.email,
                        createdAt: serverTimestamp()
                    }, { merge: true });
                }
            } catch (fetchError) {
                console.error("Error fetching user nickname:", fetchError);
                currentUserNickname = user.email.split('@')[0]; // Fallback
            }

            userDisplayNameSpan.textContent = currentUserNickname;
            userInfoSidebarSpan.textContent = `Logged in as ${currentUserNickname}`;
            authContainer.style.display = 'none';
            sidebar.style.display = 'flex';
            chatContainer.style.display = 'flex'; // Use flex for chat container
            logoutButtonMain.style.display = 'block'; // Show in main content for mobile

            messageInput.value = '';
            chatError.textContent = '';
            authError.textContent = '';

            loadUserChats(currentUserId); // Load existing chats for this user
            // Don't load messages for a specific chat yet, wait for selection or new chat
            updateChatUIForNoSelection();
        }
    } else { // User is signed out
        if (currentUserId !== null) { // Only run if user was previously logged in
            currentUserId = null;
            currentUserNickname = null;
            currentChatId = null;
            if (unsubscribeChatMessages) unsubscribeChatMessages();
            if (unsubscribeChatList) unsubscribeChatList();
            unsubscribeChatMessages = null;
            unsubscribeChatList = null;

            chatHistoryDiv.innerHTML = '';
            chatListUl.innerHTML = '';
            authContainer.style.display = 'block';
            sidebar.style.display = 'none';
            chatContainer.style.display = 'none';
            logoutButtonMain.style.display = 'none';
            userDisplayNameSpan.textContent = '';
            userInfoSidebarSpan.textContent = '';
            nicknameInput.value = ''; // Clear nickname field on logout too
            emailInput.value = '';
            passwordInput.value = '';
        }
    }
});

function getFirebaseErrorMessage(error) {
    // Basic error mapping, can be expanded
    if (error.code) {
        switch (error.code) {
            case 'auth/invalid-email': return 'Invalid email address.';
            case 'auth/user-not-found': return 'No account found with this email.';
            case 'auth/wrong-password': return 'Incorrect password.';
            case 'auth/email-already-in-use': return 'This email is already registered.';
            case 'auth/weak-password': return 'Password is too weak.';
            default: return error.message.replace('Firebase: ', ''); // Cleaner message
        }
    }
    return 'An unknown error occurred.';
}


// --- Chat Management & UI ---

newChatButton.addEventListener('click', async () => {
    if (!currentUserId) return;

    try {
        // Create a new chat session document in Firestore
        const newChatRef = await addDoc(collection(db, "users", currentUserId, "chats"), {
            title: "New Chat", // Placeholder title, could be updated later
            createdAt: serverTimestamp(),
            lastMessageAt: serverTimestamp() // For sorting chats
        });
        currentChatId = newChatRef.id;
        console.log("Created new chat with ID:", currentChatId);
        // loadChatMessages will be triggered by the chat list listener, or call explicitly
        loadChatMessages(currentUserId, currentChatId);
        updateActiveChatInSidebar(currentChatId);
        messageInput.focus();
    } catch (error) {
        console.error("Error creating new chat:", error);
        chatError.textContent = "Could not start a new chat.";
    }
});

function loadUserChats(userId) {
    if (unsubscribeChatList) unsubscribeChatList();

    const chatsRef = collection(db, "users", userId, "chats");
    // Order by last message time, or creation time if not available
    const q = query(chatsRef, orderBy("lastMessageAt", "desc"), limit(30));

    unsubscribeChatList = onSnapshot(q, (snapshot) => {
        chatListUl.innerHTML = ''; // Clear list
        if (snapshot.empty) {
            chatListUl.innerHTML = '<li class="no-chats">No chats yet.</li>';
            return;
        }
        snapshot.forEach(docSnap => {
            const chatData = docSnap.data();
            const li = document.createElement('li');
            li.dataset.chatId = docSnap.id;
            // Use a more descriptive title, e.g., first user message or a generic one
            li.textContent = chatData.title || `Chat from ${chatData.createdAt?.toDate().toLocaleDateString() || 'earlier'}`;
            if (docSnap.id === currentChatId) {
                li.classList.add('active-chat');
            }
            li.addEventListener('click', () => {
                if (currentChatId !== docSnap.id) {
                    currentChatId = docSnap.id;
                    loadChatMessages(userId, currentChatId);
                    updateActiveChatInSidebar(currentChatId);
                }
            });
            chatListUl.appendChild(li);
        });
        // If no currentChatId is set, and there are chats, maybe select the first one?
        // Or, if currentChatId was set but that chat got deleted.
        if (!currentChatId && !snapshot.empty) {
            // currentChatId = snapshot.docs[0].id;
            // loadChatMessages(userId, currentChatId);
            // updateActiveChatInSidebar(currentChatId);
            updateChatUIForNoSelection(); // Keep showing placeholder until a chat is clicked
        } else if (currentChatId && !snapshot.docs.find(d => d.id === currentChatId)) {
            // Current chat was deleted, clear selection
            currentChatId = null;
            updateChatUIForNoSelection();
        }

    }, (error) => {
        console.error("Error loading user chats:", error);
        chatError.textContent = "Could not load chat list.";
    });
}

function updateActiveChatInSidebar(chatId) {
    Array.from(chatListUl.children).forEach(li => {
        li.classList.toggle('active-chat', li.dataset.chatId === chatId);
    });
}

function updateChatUIForNoSelection() {
    chatHistoryDiv.innerHTML = ''; // Clear messages
    noChatSelectedDiv.style.display = 'flex'; // Show placeholder
    messageInput.disabled = true; // Disable input if no chat is active
    sendButton.disabled = true;
}

function updateChatUIForActiveChat() {
    noChatSelectedDiv.style.display = 'none'; // Hide placeholder
    messageInput.disabled = false;
    sendButton.disabled = false;
    messageInput.focus();
}

function displayMessage(sender, text, isError = false) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', sender === 'user' ? 'user-message' : 'iris-message');
    if (isError && sender === 'iris') {
        messageDiv.classList.add('error-message');
    }
    // Basic sanitization - more robust might be needed for production
    // For displaying, we can use textContent to prevent XSS directly
    messageDiv.textContent = text;
    chatHistoryDiv.appendChild(messageDiv);
    chatHistoryDiv.scrollTo({ top: chatHistoryDiv.scrollHeight, behavior: 'smooth' });
}

async function saveMessageToFirestore(userId, chatId, sender, text) {
    if (!userId || !chatId) {
        console.warn("Cannot save message: userId or chatId missing.");
        return;
    }
    try {
        const messagesCollectionRef = collection(db, "users", userId, "chats", chatId, "messages");
        await addDoc(messagesCollectionRef, {
            sender: sender,
            text: text,
            timestamp: serverTimestamp()
        });

        // Update the chat's lastMessageAt and potentially title
        const chatDocRef = doc(db, "users", userId, "chats", chatId);
        const updateData = { lastMessageAt: serverTimestamp() };
        if (sender === 'user') {
            const chatDocSnap = await getDoc(chatDocRef);
            if (chatDocSnap.exists() && (chatDocSnap.data().title === "New Chat" || !chatDocSnap.data().title)) {
                 updateData.title = text.substring(0, 30) + (text.length > 30 ? "..." : "");
            }
        }
        await setDoc(chatDocRef, updateData, { merge: true });

        console.log("Message saved to chat:", chatId);
    } catch (error) {
        console.error("Error saving message to Firestore:", error);
        chatError.textContent = "Error saving message.";
    }
}

function loadChatMessages(userId, chatId) {
    if (!userId || !chatId) {
        updateChatUIForNoSelection();
        currentChatFormattedHistory = []; // Clear history if no chat
        return;
    }

    if (unsubscribeChatMessages) unsubscribeChatMessages();
    chatHistoryDiv.innerHTML = '';
    updateChatUIForActiveChat();
    currentChatFormattedHistory = []; // <--- RESET FOR NEW CHAT LOAD

    const messagesRef = collection(db, "users", userId, "chats", chatId, "messages");
    const q = query(messagesRef, orderBy("timestamp", "asc"), limit(50));

    unsubscribeChatMessages = onSnapshot(q, (querySnapshot) => {
        chatHistoryDiv.innerHTML = '';
        const newFormattedHistory = []; // Build history for this snapshot

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            displayMessage(data.sender, data.text);
            // Format for Gemini: { role: "user" or "model", parts: [{text: "..."}]}
            newFormattedHistory.push({
                role: data.sender === 'user' ? 'user' : 'model',
                parts: [{ text: data.text }]
            });
        });
        currentChatFormattedHistory = newFormattedHistory; // <--- UPDATE THE GLOBAL HISTORY

        if (chatHistoryDiv.innerHTML !== '') {
            chatHistoryDiv.scrollTo({ top: chatHistoryDiv.scrollHeight, behavior: 'auto' });
        }
    }, (error) => {
        console.error("Error listening to chat messages:", error);
        chatError.textContent = "Could not load messages for this chat.";
        currentChatFormattedHistory = []; // Clear on error
    });
}

sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});


async function sendMessage() {
    const messageText = messageInput.value.trim();
    // Ensure currentChatFormattedHistory is available
    if (!messageText || !currentUserId || !currentChatId || sendButton.disabled) return;

    const messageToSend = messageText;
    messageInput.value = '';
    messageInput.style.height = 'auto';
    chatError.textContent = '';

    displayMessage('user', messageToSend);
    await saveMessageToFirestore(currentUserId, currentChatId, 'user', messageToSend);

    // Add user's new message to the history that will be sent
    const historyToSend = [
        ...currentChatFormattedHistory,
        { role: 'user', parts: [{ text: messageToSend }] }
    ];
    // Trim history if it's too long (Gemini has token limits for history)
    // A simple way is to limit the number of turns. E.g., last 10 messages (5 turns).
    const MAX_HISTORY_MESSAGES = 20; // Adjust as needed
    if (historyToSend.length > MAX_HISTORY_MESSAGES) {
        historyToSend.splice(0, historyToSend.length - MAX_HISTORY_MESSAGES);
    }


    loadingIndicator.style.display = 'flex';
    sendButton.disabled = true;
    messageInput.disabled = true;

    try {
        const functionUrl = '/.netlify/functions/chat';
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: messageToSend, // Current message (Gemini API structure might prefer just history)
                chatHistory: historyToSend, // <--- SEND THE FORMATTED HISTORY
                userId: currentUserId,
                chatId: currentChatId
            })
        });
        // ... rest of the sendMessage function
        if (!response.ok) {
            let errorMsg = `Network response was not ok: ${response.statusText}`;
            try {
                const errorData = await response.json();
                errorMsg += ` - ${errorData.error || 'Unknown backend error'}`;
            } catch (parseError) { /* ignore if not JSON */ }
            throw new Error(errorMsg);
        }

        const data = await response.json();
        if (data.reply) {
            displayMessage('iris', data.reply);
            await saveMessageToFirestore(currentUserId, currentChatId, 'iris', data.reply);
            // The 'iris' message is saved, and onSnapshot in loadChatMessages
            // will update currentChatFormattedHistory automatically.
        } else {
            displayMessage('iris', "Iris didn't have a response to that.", true);
        }

    } catch (error) {
        console.error('Error during sendMessage:', error);
        const displayErrorMessage = `Sorry, I encountered an issue: ${error.message || "Could not reach Iris."}`;
        chatError.textContent = displayErrorMessage;
        displayMessage('iris', `[System Error: ${error.message || "Could not reach Iris."}]`, true);
    } finally {
        loadingIndicator.style.display = 'none';
        sendButton.disabled = false;
        messageInput.disabled = false;
        messageInput.focus();
    }
}