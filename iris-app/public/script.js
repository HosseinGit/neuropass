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
    serverTimestamp,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "YOUR_API_KEY", // AIzaSyCFviEOu-Y1_-Pf3WeLjgXU5lZI42N-EQg
    authDomain: "YOUR_AUTH_DOMAIN", // iris-neuropass.firebaseapp.com
    projectId: "YOUR_PROJECT_ID", // iris-neuropass
    storageBucket: "YOUR_STORAGE_BUCKET", // iris-neuropass.firebasestorage.app
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID", // 470784656826
    appId: "YOUR_APP_ID", // 1:470784656826:web:49bceaf81642ec54ad8983
    measurementId: "YOUR_MEASUREMENT_ID" // G-6E9618FLL4
  };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM Elements
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay'); // For mobile overlay
const hamburgerMenu = document.getElementById('hamburger-menu');
const authView = document.getElementById('auth-view');
const chatView = document.getElementById('chat-view');
const loginButton = document.getElementById('login-button');
const signupButton = document.getElementById('signup-button');
const logoutButtonSidebar = document.getElementById('logout-button-sidebar');
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

// --- Hamburger Menu Logic ---
hamburgerMenu.addEventListener('click', () => {
    const isOpen = sidebar.classList.toggle('open');
    hamburgerMenu.setAttribute('aria-expanded', isOpen.toString());
    if (isOpen) {
        sidebarOverlay.classList.add('active');
    } else {
        sidebarOverlay.classList.remove('active');
    }
});

sidebarOverlay.addEventListener('click', () => { // Close sidebar if overlay is clicked
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('active');
    hamburgerMenu.setAttribute('aria-expanded', 'false');
});


// --- Auto-resize Textarea ---
messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    let scrollHeight = messageInput.scrollHeight;
    const maxHeight = parseInt(window.getComputedStyle(messageInput).maxHeight) || 100; // Default 100 if not set
    if (scrollHeight > maxHeight) {
        messageInput.style.height = maxHeight + 'px';
        messageInput.style.overflowY = 'auto';
    } else {
        messageInput.style.height = scrollHeight + 'px';
        messageInput.style.overflowY = 'hidden';
    }
});

// --- Authentication Logic ---
signupButton.addEventListener('click', async () => {
    const nickname = nicknameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    authError.textContent = '';
    authError.classList.remove('active-error');

    if (!nickname || !email || !password) {
        authError.textContent = "Please enter nickname, email, and password.";
        authError.classList.add('active-error');
        return;
    }
    if (password.length < 6) {
        authError.textContent = "Password should be at least 6 characters.";
        authError.classList.add('active-error');
        return;
    }
    if (nickname.length < 3) {
        authError.textContent = "Nickname should be at least 3 characters.";
        authError.classList.add('active-error');
        return;
    }
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        await setDoc(doc(db, "users", user.uid), {
            nickname: nickname,
            email: user.email,
            createdAt: serverTimestamp()
        });
        // currentUserNickname = nickname; // Set by onAuthStateChanged after fetching
    } catch (error) {
        console.error("Signup Error:", error);
        authError.textContent = `Signup failed: ${getFirebaseErrorMessage(error)}`;
        authError.classList.add('active-error');
    }
});

loginButton.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    authError.textContent = '';
    authError.classList.remove('active-error');
    if (!email || !password) {
        authError.textContent = "Please enter email and password.";
        authError.classList.add('active-error');
        return;
    }
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        console.error("Login Error:", error);
        authError.textContent = `Login failed: ${getFirebaseErrorMessage(error)}`;
        authError.classList.add('active-error');
    }
});

const handleLogout = async () => {
    try {
        if (unsubscribeChatMessages) unsubscribeChatMessages();
        if (unsubscribeChatList) unsubscribeChatList();
        unsubscribeChatMessages = null;
        unsubscribeChatList = null;
        currentChatFormattedHistory = [];
        await signOut(auth);
        // UI changes handled by onAuthStateChanged
        if (sidebar.classList.contains('open')) { // Close sidebar on logout if open
            sidebar.classList.remove('open');
            sidebarOverlay.classList.remove('active');
            hamburgerMenu.setAttribute('aria-expanded', 'false');
        }
    } catch (error) {
        console.error("Logout Error:", error);
        chatError.textContent = "Logout failed. Please try again.";
        chatError.classList.add('active-error');
    }
};
logoutButtonSidebar.addEventListener('click', handleLogout);


async function createNewChatSession(userId, activate = true) {
    if (!userId) return null;
    try {
        const newChatRef = await addDoc(collection(db, "users", userId, "chats"), {
            title: "New Chat",
            createdAt: serverTimestamp(),
            lastMessageAt: serverTimestamp()
        });
        console.log("Created new chat with ID:", newChatRef.id);
        if (activate) {
            currentChatId = newChatRef.id;
            loadChatMessages(userId, currentChatId);
            updateActiveChatInSidebar(currentChatId);
            messageInput.focus();
            if (sidebar.classList.contains('open')) { // Close mobile sidebar after creating new chat
                sidebar.classList.remove('open');
                sidebarOverlay.classList.remove('active');
                hamburgerMenu.setAttribute('aria-expanded', 'false');
            }
        }
        return newChatRef.id;
    } catch (error) {
        console.error("Error creating new chat:", error);
        chatError.textContent = "Could not start a new chat.";
        chatError.classList.add('active-error');
        return null;
    }
}


onAuthStateChanged(auth, async (user) => {
    if (user) {
        if (currentUserId !== user.uid) { // New login or different user
            currentUserId = user.uid;
            try {
                const userDocRef = doc(db, "users", user.uid);
                const userDocSnap = await getDoc(userDocRef);
                if (userDocSnap.exists()) {
                    currentUserNickname = userDocSnap.data().nickname;
                } else { // Should not happen if signup is correct, but handle as fallback
                    currentUserNickname = user.email.split('@')[0];
                    await setDoc(doc(db, "users", user.uid), {
                        nickname: currentUserNickname, email: user.email, createdAt: serverTimestamp()
                    }, { merge: true });
                }
            } catch (fetchError) {
                console.error("Error fetching user nickname:", fetchError);
                currentUserNickname = user.email.split('@')[0]; // Fallback
            }

            userDisplayNameSpan.textContent = currentUserNickname;
            userInfoSidebarSpan.textContent = `${currentUserNickname}`; // Just nickname or "Logged in as..."

            authView.style.display = 'none';
            chatView.style.display = 'flex';
            sidebar.style.display = 'flex'; // Sidebar is always display:flex, visibility controlled by transform
            hamburgerMenu.style.display = 'block'; // Show hamburger once logged in

            messageInput.value = '';
            chatError.textContent = '';
            chatError.classList.remove('active-error');
            authError.textContent = '';
            authError.classList.remove('active-error');

            loadUserChats(currentUserId); // This will also handle auto-selecting/creating a chat

        } else { // Same user, already logged in (e.g., page refresh) - ensure UI is correct
            authView.style.display = 'none';
            chatView.style.display = 'flex';
            sidebar.style.display = 'flex';
            hamburgerMenu.style.display = 'block';
            // Ensure chat list and current chat are loaded if necessary
            if (!unsubscribeChatList) loadUserChats(currentUserId);
            if (currentChatId && !unsubscribeChatMessages) loadChatMessages(currentUserId, currentChatId);
            else if (!currentChatId) updateChatUIForNoSelection();

        }
    } else { // User is signed out
        if (currentUserId !== null) {
            currentUserId = null;
            currentUserNickname = null;
            currentChatId = null;
            if (unsubscribeChatMessages) unsubscribeChatMessages();
            if (unsubscribeChatList) unsubscribeChatList();
            unsubscribeChatMessages = null;
            unsubscribeChatList = null;
            currentChatFormattedHistory = [];

            chatHistoryDiv.innerHTML = '';
            chatListUl.innerHTML = '';

            authView.style.display = 'flex';
            chatView.style.display = 'none';
            sidebar.style.display = 'none'; // Hide sidebar container too
            hamburgerMenu.style.display = 'none'; // Hide hamburger
            sidebar.classList.remove('open'); // Ensure it's closed
            sidebarOverlay.classList.remove('active');

            userDisplayNameSpan.textContent = '';
            userInfoSidebarSpan.textContent = '';
            nicknameInput.value = '';
            emailInput.value = '';
            passwordInput.value = '';
        }
    }
});

function getFirebaseErrorMessage(error) {
    // Basic error mapping
    if (error.code) {
        switch (error.code) {
            case 'auth/invalid-email': return 'Invalid email address.';
            case 'auth/user-not-found': return 'No account found with this email.';
            case 'auth/wrong-password': return 'Incorrect password.';
            case 'auth/email-already-in-use': return 'This email is already registered.';
            case 'auth/weak-password': return 'Password is too weak.';
            default: return error.message.replace('Firebase: ', '');
        }
    }
    return 'An unknown error occurred.';
}

newChatButton.addEventListener('click', async () => {
    if (!currentUserId) return;
    await createNewChatSession(currentUserId, true);
});

function loadUserChats(userId) {
    if (unsubscribeChatList) unsubscribeChatList();

    const chatsRef = collection(db, "users", userId, "chats");
    const q = query(chatsRef, orderBy("lastMessageAt", "desc"), limit(30));

    unsubscribeChatList = onSnapshot(q, async (snapshot) => { // Made async for await
        chatListUl.innerHTML = '';
        let firstChatId = null;
        let activeChatExistsInSnapshot = false;

        if (snapshot.empty) {
            chatListUl.innerHTML = '<li class="no-chats">No chats yet.</li>';
            console.log("No chats found for user, creating initial chat from loadUserChats.");
            const newId = await createNewChatSession(userId, true); // Create and activate
            // createNewChatSession will set currentChatId and load messages
            return; // Exit early as new chat creation will handle UI
        }

        snapshot.forEach((docSnap, index) => {
            if (index === 0) firstChatId = docSnap.id;

            const chatData = docSnap.data();
            const li = document.createElement('li');
            li.dataset.chatId = docSnap.id;
            li.textContent = chatData.title || `Chat from ${chatData.createdAt?.toDate().toLocaleDateString([], {month:'short', day:'numeric'}) || 'earlier'}`;
            if (docSnap.id === currentChatId) {
                li.classList.add('active-chat');
                activeChatExistsInSnapshot = true;
            }
            li.addEventListener('click', () => {
                if (currentChatId !== docSnap.id) {
                    currentChatId = docSnap.id;
                    loadChatMessages(userId, currentChatId);
                    updateActiveChatInSidebar(currentChatId);
                    if (sidebar.classList.contains('open')) { // Close mobile sidebar on chat selection
                        sidebar.classList.remove('open');
                        sidebarOverlay.classList.remove('active');
                        hamburgerMenu.setAttribute('aria-expanded', 'false');
                    }
                }
            });
            chatListUl.appendChild(li);
        });

        if (!activeChatExistsInSnapshot && firstChatId) { // If currentChatId was deleted or null
            console.log("Auto-selecting most recent chat as current was not found or null:", firstChatId);
            currentChatId = firstChatId;
            loadChatMessages(userId, currentChatId);
            updateActiveChatInSidebar(currentChatId);
        } else if (!currentChatId && firstChatId) { // No current chat selected, select the first one
             console.log("No chat selected, auto-selecting most recent:", firstChatId);
             currentChatId = firstChatId;
             loadChatMessages(userId, currentChatId);
             updateActiveChatInSidebar(currentChatId);
        } else if (currentChatId && activeChatExistsInSnapshot) {
            // Current chat is valid and exists, ensure UI is correct for active chat
            updateChatUIForActiveChat();
        } else if (!currentChatId && !firstChatId && !snapshot.empty) {
            // This case should ideally not be reached if snapshot.empty handles creation
            updateChatUIForNoSelection();
        }

    }, (error) => {
        console.error("Error loading user chats:", error);
        chatError.textContent = "Could not load chat list.";
        chatError.classList.add('active-error');
    });
}

function updateActiveChatInSidebar(chatId) {
    Array.from(chatListUl.children).forEach(li => {
        if (li.classList.contains('no-chats')) return; // Skip the "no-chats" item
        li.classList.toggle('active-chat', li.dataset.chatId === chatId);
    });
}

function updateChatUIForNoSelection() {
    chatHistoryDiv.innerHTML = ''; // Clear messages
    currentChatFormattedHistory = [];
    noChatSelectedDiv.style.display = 'flex';
    messageInput.disabled = true;
    sendButton.disabled = true;
    messageInput.placeholder = "Select or create a chat";
}

function updateChatUIForActiveChat() {
    noChatSelectedDiv.style.display = 'none';
    messageInput.disabled = false;
    sendButton.disabled = false;
    messageInput.placeholder = "Message Iris...";
    // messageInput.focus(); // Be careful with auto-focus, can be annoying on mobile
}

function displayMessage(sender, text, isError = false) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', sender === 'user' ? 'user-message' : 'iris-message');
    if (isError && sender === 'iris') {
        messageDiv.classList.add('error-message');
    }

    const textNode = document.createTextNode(text); // Use textNode for safety
    messageDiv.appendChild(textNode);

    const timestampSpan = document.createElement('span');
    timestampSpan.classList.add('message-timestamp');
    timestampSpan.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    messageDiv.appendChild(timestampSpan);

    chatHistoryDiv.appendChild(messageDiv);
    // Smooth scroll to bottom, ensuring it happens after element is rendered
    requestAnimationFrame(() => {
        chatHistoryDiv.scrollTo({ top: chatHistoryDiv.scrollHeight, behavior: 'smooth' });
    });
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
        const chatDocRef = doc(db, "users", userId, "chats", chatId);
        const updateData = { lastMessageAt: serverTimestamp() };
        const chatDocSnap = await getDoc(chatDocRef);
        // Only update title if it's the default "New Chat" and it's the first user message in this interaction
        if (chatDocSnap.exists() && chatData.title === "New Chat" && sender === 'user') {
             const messagesQuery = query(messagesCollectionRef, orderBy("timestamp", "asc"), limit(1));
             const messagesSnapshot = await getDocs(messagesQuery);
             if (messagesSnapshot.docs.length === 1 && messagesSnapshot.docs[0].data().sender === 'user') { // Check if it's truly the first user message
                updateData.title = text.substring(0, 25) + (text.length > 25 ? "..." : "");
             }
        } else if (chatDocSnap.exists() && !chatDocSnap.data().title && sender === 'user') { // If title is empty
            updateData.title = text.substring(0, 25) + (text.length > 25 ? "..." : "");
        }

        await setDoc(chatDocRef, updateData, { merge: true });
        console.log("Message saved to chat:", chatId);
    } catch (error) {
        console.error("Error saving message to Firestore:", error);
        chatError.textContent = "Error saving message.";
        chatError.classList.add('active-error');
    }
}

function loadChatMessages(userId, chatId) {
    if (!userId || !chatId) {
        updateChatUIForNoSelection();
        return;
    }
    if (unsubscribeChatMessages) unsubscribeChatMessages();
    chatHistoryDiv.innerHTML = '';
    updateChatUIForActiveChat();
    currentChatFormattedHistory = [];

    const messagesRef = collection(db, "users", userId, "chats", chatId, "messages");
    const q_msg = query(messagesRef, orderBy("timestamp", "asc"), limit(50)); // Get last 50 messages

    unsubscribeChatMessages = onSnapshot(q_msg, (querySnapshot) => {
        const newMessages = []; // To avoid re-rendering all messages if not needed
        const newFormattedHistory = [];

        querySnapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                newMessages.push(change.doc.data());
            }
            // Handle "modified" or "removed" if needed for more complex scenarios
        });

        // Efficiently build history and display only new messages if possible
        // For simplicity here, re-rendering on any change in the limited snapshot
        chatHistoryDiv.innerHTML = ''; // Clear and re-render for simplicity with timestamps
        querySnapshot.forEach((doc) => { // Iterate full snapshot to maintain order
            const data = doc.data();
            displayMessage(data.sender, data.text, data.sender === 'iris' && data.text.startsWith("[System Error"));
            newFormattedHistory.push({
                role: data.sender === 'user' ? 'user' : 'model',
                parts: [{ text: data.text }]
            });
        });
        currentChatFormattedHistory = newFormattedHistory;

        if (chatHistoryDiv.innerHTML === '' && !querySnapshot.empty) {
            // This means messages were loaded, but displayMessage might not have run yet or scrolled
             requestAnimationFrame(() => {
                chatHistoryDiv.scrollTo({ top: chatHistoryDiv.scrollHeight, behavior: 'auto' });
            });
        } else if (chatHistoryDiv.innerHTML !== '') {
            requestAnimationFrame(() => { // Ensure scroll happens after DOM update
                chatHistoryDiv.scrollTo({ top: chatHistoryDiv.scrollHeight, behavior: 'auto' }); // 'auto' on load
            });
        }


    }, (error) => {
        console.error("Error listening to chat messages:", error);
        chatError.textContent = "Could not load messages for this chat.";
        chatError.classList.add('active-error');
        currentChatFormattedHistory = [];
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
    if (!messageText || !currentUserId || !currentChatId || sendButton.disabled) return;

    const messageToSend = messageText;
    messageInput.value = '';
    messageInput.style.height = 'auto'; // Reset textarea height
    messageInput.dispatchEvent(new Event('input')); // Trigger input event to resize if needed
    chatError.textContent = '';
    chatError.classList.remove('active-error');

    // Display user message immediately & save (onSnapshot will reflect this in history)
    displayMessage('user', messageToSend); // Display locally first
    await saveMessageToFirestore(currentUserId, currentChatId, 'user', messageToSend);

    // Prepare history for the API call.
    // currentChatFormattedHistory will be updated by onSnapshot from the save above.
    // To be safe, construct it from what we know, ensuring the latest message is last.
    let historyForAPI = [...currentChatFormattedHistory];
    // Ensure the message just sent by the user is the last 'user' message in the history sent to API
    // Remove any older instance of this exact text by user (edge case) and add the new one
    historyForAPI = historyForAPI.filter(m => !(m.role === 'user' && m.parts[0].text === messageToSend));
    historyForAPI.push({ role: 'user', parts: [{ text: messageToSend }] });


    const MAX_HISTORY_MESSAGES = 20; // e.g., last 10 turns
    if (historyForAPI.length > MAX_HISTORY_MESSAGES) {
        historyForAPI = historyForAPI.slice(-MAX_HISTORY_MESSAGES);
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
                message: messageToSend, // Current message for context/logging on backend
                chatHistory: historyForAPI,
                userId: currentUserId, // Optional: for backend logging/logic
                chatId: currentChatId   // Optional: for backend logging/logic
            })
        });

        if (!response.ok) {
            let errorMsg = `Network: ${response.status} ${response.statusText}`;
            try {
                const errorData = await response.json();
                errorMsg += ` - ${errorData.error || 'Unknown backend error'}`;
            } catch (parseError) { /* ignore if not JSON */ }
            throw new Error(errorMsg);
        }

        const data = await response.json();
        if (data.reply) {
            // Iris's reply will be displayed and saved by onSnapshot from Firestore
            // So, we just need to save it. displayMessage is handled by loadChatMessages.
            await saveMessageToFirestore(currentUserId, currentChatId, 'iris', data.reply);
        } else {
            const noReplyMsg = "Iris didn't have a response to that.";
            await saveMessageToFirestore(currentUserId, currentChatId, 'iris', noReplyMsg);
            // displayMessage('iris', noReplyMsg, true); // onSnapshot will display it
        }

    } catch (error) {
        console.error('Error during sendMessage:', error);
        const displayErrorMessage = `Sorry, an issue occurred: ${error.message || "Could not reach Iris."}`;
        chatError.textContent = displayErrorMessage;
        chatError.classList.add('active-error');
        // Save and display system error message from Iris's side
        await saveMessageToFirestore(currentUserId, currentChatId, 'iris', `[System Error: ${error.message || "Could not reach Iris."}]`);
        // displayMessage('iris', `[System Error: ${error.message || "Could not reach Iris."}]`, true); // onSnapshot
    } finally {
        loadingIndicator.style.display = 'none';
        sendButton.disabled = false;
        messageInput.disabled = false;
        // messageInput.focus(); // Consider if auto-focus is always desired
    }
}

// Initial check for screen size to set sidebar state correctly
function checkScreenSize() {
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
        sidebar.style.display = 'flex'; // Keep it in DOM for transform
        hamburgerMenu.style.display = 'block'; // Show hamburger if logged in
        // Sidebar starts closed on mobile, JS handles .open
    } else { // Desktop
        sidebar.style.display = 'flex'; // Always display flex on desktop
        sidebar.classList.remove('open'); // Ensure not in 'open' state from mobile
        sidebarOverlay.classList.remove('active');
        hamburgerMenu.style.display = 'none';
    }
     // Adjust logo-title centering based on hamburger visibility
    const logoTitle = document.querySelector('.logo-title');
    const headerActionsPlaceholder = document.querySelector('.header-actions-placeholder');
    if (logoTitle && headerActionsPlaceholder) {
        if (hamburgerMenu.style.display === 'block') {
            logoTitle.style.marginLeft = '10px'; // Give some space from hamburger
            logoTitle.style.marginRight = 'auto';
            headerActionsPlaceholder.style.display = 'block'; // Takes up space on the right
        } else {
            logoTitle.style.marginLeft = 'auto';
            logoTitle.style.marginRight = 'auto';
            headerActionsPlaceholder.style.display = 'none';
        }
    }
}

window.addEventListener('resize', checkScreenSize);
// Call on load, but onAuthStateChanged will also call it once user state is known
// document.addEventListener('DOMContentLoaded', checkScreenSize);
// onAuthStateChanged will handle initial hamburger visibility based on login state.