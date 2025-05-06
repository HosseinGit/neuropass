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

// IMPORTANT: Replace with your actual Firebase configuration!
const firebaseConfig = {
    apiKey: "AIzaSyCFviEOu-Y1_-Pf3WeLjgXU5lZI42N-EQg", // YOUR_API_KEY
    authDomain: "iris-neuropass.firebaseapp.com", // YOUR_AUTH_DOMAIN
    projectId: "iris-neuropass", // YOUR_PROJECT_ID
    storageBucket: "iris-neuropass.firebasestorage.app", // YOUR_STORAGE_BUCKET
    messagingSenderId: "470784656826", // YOUR_MESSAGING_SENDER_ID
    appId: "1:470784656826:web:49bceaf81642ec54ad8983", // YOUR_APP_ID
    measurementId: "G-6E9618FLL4" // YOUR_MEASUREMENT_ID
  };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM Elements
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');
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
// const userDisplayNameSpan = document.getElementById('user-display-name'); // Not used
const userInfoSidebarSpan = document.getElementById('user-info-sidebar');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const chatHistoryDiv = document.getElementById('chat-history');
const loadingIndicator = document.getElementById('loading-indicator');
const newChatButton = document.getElementById('new-chat-button');
const chatListUl = document.getElementById('chat-list');
const noChatSelectedDiv = document.getElementById('no-chat-selected');
const uploadFileButton = document.getElementById('upload-file-button');
const fileInputHidden = document.getElementById('file-input-hidden');


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
    sidebarOverlay.classList.toggle('active', isOpen);
});

sidebarOverlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('active');
    hamburgerMenu.setAttribute('aria-expanded', 'false');
});


// --- Auto-resize Textarea ---
messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    let scrollHeight = messageInput.scrollHeight;
    const maxHeight = parseInt(window.getComputedStyle(messageInput).maxHeight) || 100;
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
        await signOut(auth); // onAuthStateChanged will handle UI cleanup
    } catch (error) {
        console.error("Logout Error:", error);
        chatError.textContent = "Logout failed. Please try again.";
        chatError.classList.add('active-error');
    }
};
logoutButtonSidebar.addEventListener('click', handleLogout);


async function createNewChatSession(userId, activate = true) {
    if (!userId) return null;
    chatError.textContent = '';
    chatError.classList.remove('active-error');
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
            if (window.innerWidth <= 768 && sidebar.classList.contains('open')) {
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
    if (user) { // User is signed IN
        if (currentUserId !== user.uid) { // New login or different user
            currentUserId = user.uid;
            try {
                const userDocRef = doc(db, "users", user.uid);
                const userDocSnap = await getDoc(userDocRef);
                if (userDocSnap.exists()) {
                    currentUserNickname = userDocSnap.data().nickname;
                } else {
                    currentUserNickname = user.email.split('@')[0];
                    await setDoc(doc(db, "users", user.uid), {
                        nickname: currentUserNickname, email: user.email, createdAt: serverTimestamp()
                    }, { merge: true });
                }
            } catch (fetchError) {
                console.error("Error fetching user nickname:", fetchError);
                currentUserNickname = user.email.split('@')[0];
            }

            userInfoSidebarSpan.textContent = `${currentUserNickname}`;

            authView.style.display = 'none';
            chatView.style.display = 'flex';
            sidebar.style.display = 'flex'; // Make sidebar eligible for display
            checkScreenSize(); // This will set hamburger visibility based on screen AND login

            messageInput.value = '';
            chatError.textContent = ''; chatError.classList.remove('active-error');
            authError.textContent = ''; authError.classList.remove('active-error');

            currentChatId = null;
            loadUserChats(currentUserId);

        } else { // Same user, page refresh
            authView.style.display = 'none';
            chatView.style.display = 'flex';
            sidebar.style.display = 'flex';
            checkScreenSize();
            if (!unsubscribeChatList) loadUserChats(currentUserId);
            else if (currentChatId && !unsubscribeChatMessages) loadChatMessages(currentUserId, currentChatId);
            else if (currentChatId) updateChatUIForActiveChat();
            else updateChatUIForNoSelection();
        }
    } else { // User is signed OUT
        // Only run full cleanup if a user was previously logged in
        if (currentUserId !== null || authView.style.display === 'none') {
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
            sidebar.style.display = 'none';
            hamburgerMenu.style.display = 'none';
            sidebar.classList.remove('open');
            sidebarOverlay.classList.remove('active');
            if(hamburgerMenu) hamburgerMenu.setAttribute('aria-expanded', 'false');


            userInfoSidebarSpan.textContent = '';
            nicknameInput.value = '';
            emailInput.value = '';
            passwordInput.value = '';
        }
        // Ensure clean state if on initial load and no user
        authView.style.display = 'flex';
        chatView.style.display = 'none';
        sidebar.style.display = 'none';
        hamburgerMenu.style.display = 'none';
    }
});

function getFirebaseErrorMessage(error) {
    if (error.code) {
        switch (error.code) {
            case 'auth/api-key-not-valid.-please-pass-a-valid-api-key.': return 'Firebase API Key is invalid.';
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
    chatError.textContent = ''; chatError.classList.remove('active-error');

    const chatsRef = collection(db, "users", userId, "chats");
    const q = query(chatsRef, orderBy("lastMessageAt", "desc"), limit(30));

    unsubscribeChatList = onSnapshot(q, async (snapshot) => {
        chatListUl.innerHTML = '';
        let firstChatIdFromSnapshot = null;
        let activeChatStillExists = false;

        if (snapshot.empty) {
            chatListUl.innerHTML = '<li class="no-chats">No chats yet.</li>';
            console.log("No chats found. Creating initial chat.");
            if (!currentChatId) { // Prevent re-creation if one was just made
                 await createNewChatSession(userId, true);
            } else {
                updateChatUIForNoSelection();
            }
            return;
        }

        snapshot.forEach((docSnap, index) => {
            if (index === 0) firstChatIdFromSnapshot = docSnap.id;
            if (docSnap.id === currentChatId) activeChatStillExists = true;

            const chatData = docSnap.data();
            const li = document.createElement('li');
            li.dataset.chatId = docSnap.id;
            li.textContent = chatData.title || `Chat from ${chatData.createdAt?.toDate().toLocaleDateString([], {month:'short', day:'numeric'}) || 'earlier'}`;
            if (docSnap.id === currentChatId) {
                li.classList.add('active-chat');
            }
            li.addEventListener('click', () => {
                if (currentChatId !== docSnap.id) {
                    currentChatId = docSnap.id;
                    loadChatMessages(userId, currentChatId);
                    updateActiveChatInSidebar(currentChatId);
                    if (window.innerWidth <= 768 && sidebar.classList.contains('open')) {
                        sidebar.classList.remove('open');
                        sidebarOverlay.classList.remove('active');
                        if(hamburgerMenu) hamburgerMenu.setAttribute('aria-expanded', 'false');
                    }
                }
            });
            chatListUl.appendChild(li);
        });

        if (currentChatId && activeChatStillExists) {
            updateChatUIForActiveChat();
            updateActiveChatInSidebar(currentChatId);
        } else if (firstChatIdFromSnapshot) {
            console.log("Selecting first available chat:", firstChatIdFromSnapshot);
            currentChatId = firstChatIdFromSnapshot;
            loadChatMessages(userId, currentChatId);
            updateActiveChatInSidebar(currentChatId);
        } else {
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
        if (li.classList.contains('no-chats')) return;
        li.classList.toggle('active-chat', li.dataset.chatId === chatId);
    });
}

function updateChatUIForNoSelection() {
    chatHistoryDiv.innerHTML = '';
    currentChatFormattedHistory = [];
    noChatSelectedDiv.style.display = 'flex';
    messageInput.disabled = true;
    sendButton.disabled = true;
    uploadFileButton.disabled = true;
    messageInput.placeholder = "Select or create a chat";
}

function updateChatUIForActiveChat() {
    noChatSelectedDiv.style.display = 'none';
    messageInput.disabled = false;
    sendButton.disabled = false;
    uploadFileButton.disabled = false;
    messageInput.placeholder = "Message Iris...";
}

function displayMessage(sender, text, isError = false) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', sender === 'user' ? 'user-message' : 'iris-message');
    if (isError && sender === 'iris') {
        messageDiv.classList.add('error-message');
    }

    const textNode = document.createTextNode(text);
    messageDiv.appendChild(textNode);

    const timestampSpan = document.createElement('span');
    timestampSpan.classList.add('message-timestamp');
    timestampSpan.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    messageDiv.appendChild(timestampSpan);

    chatHistoryDiv.appendChild(messageDiv);
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

        if (chatDocSnap.exists()) {
            const chatDataVal = chatDocSnap.data();
            if ((chatDataVal.title === "New Chat" || !chatDataVal.title) && sender === 'user') {
                const messagesQuery = query(messagesCollectionRef, orderBy("timestamp", "asc"), limit(1)); // Get the very first message
                const messagesSnapshot = await getDocs(messagesQuery);
                // If this newly added message is the first user message in the chat
                if (messagesSnapshot.docs.length > 0 && messagesSnapshot.docs[0].data().text === text && messagesSnapshot.docs[0].data().sender === 'user') {
                     updateData.title = text.substring(0, 25) + (text.length > 25 ? "..." : "");
                }
            }
        }
        await setDoc(chatDocRef, updateData, { merge: true });
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
    chatError.textContent = ''; chatError.classList.remove('active-error');
    chatHistoryDiv.innerHTML = '';
    updateChatUIForActiveChat();
    currentChatFormattedHistory = [];

    const messagesRef = collection(db, "users", userId, "chats", chatId, "messages");
    const q_msg = query(messagesRef, orderBy("timestamp", "asc"), limit(50));

    unsubscribeChatMessages = onSnapshot(q_msg, (querySnapshot) => {
        const newFormattedHistory = [];
        chatHistoryDiv.innerHTML = '';
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            displayMessage(data.sender, data.text, data.sender === 'iris' && data.text.startsWith("[System Error"));
            newFormattedHistory.push({
                role: data.sender === 'user' ? 'user' : 'model',
                parts: [{ text: data.text }]
            });
        });
        currentChatFormattedHistory = newFormattedHistory;

        if (chatHistoryDiv.innerHTML !== '') {
            requestAnimationFrame(() => {
                chatHistoryDiv.scrollTo({ top: chatHistoryDiv.scrollHeight, behavior: 'auto' });
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
    messageInput.style.height = 'auto';
    messageInput.dispatchEvent(new Event('input'));
    chatError.textContent = ''; chatError.classList.remove('active-error');

    displayMessage('user', messageToSend);
    await saveMessageToFirestore(currentUserId, currentChatId, 'user', messageToSend);

    let historyForAPI = currentChatFormattedHistory.filter(m => !(m.role === 'user' && m.parts[0].text === messageToSend));
    historyForAPI.push({ role: 'user', parts: [{ text: messageToSend }] });

    const MAX_HISTORY_MESSAGES = 20;
    if (historyForAPI.length > MAX_HISTORY_MESSAGES) {
        historyForAPI = historyForAPI.slice(-MAX_HISTORY_MESSAGES);
    }

    loadingIndicator.style.display = 'flex';
    sendButton.disabled = true;
    messageInput.disabled = true;
    uploadFileButton.disabled = true;

    try {
        const functionUrl = '/.netlify/functions/chat';
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: messageToSend,
                chatHistory: historyForAPI,
                userId: currentUserId,
                chatId: currentChatId
            })
        });

        if (!response.ok) {
            let errorMsg = `Network: ${response.status} ${response.statusText}`;
            try { const errorData = await response.json(); errorMsg += ` - ${errorData.error || 'Unknown backend error'}`; } catch (parseError) {}
            throw new Error(errorMsg);
        }

        const data = await response.json();
        if (data.reply) {
            await saveMessageToFirestore(currentUserId, currentChatId, 'iris', data.reply);
        } else {
            const noReplyMsg = "Iris didn't have a response to that.";
            await saveMessageToFirestore(currentUserId, currentChatId, 'iris', noReplyMsg);
        }
    } catch (error) {
        console.error('Error during sendMessage:', error);
        const displayErrorMessage = `An issue occurred: ${error.message || "Could not reach Iris."}`;
        chatError.textContent = displayErrorMessage;
        chatError.classList.add('active-error');
        await saveMessageToFirestore(currentUserId, currentChatId, 'iris', `[System Error: ${error.message || "Could not reach Iris."}]`);
    } finally {
        loadingIndicator.style.display = 'none';
        sendButton.disabled = false;
        messageInput.disabled = false;
        uploadFileButton.disabled = false;
    }
}

uploadFileButton.addEventListener('click', () => {
    fileInputHidden.click();
});

fileInputHidden.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        if (file.type === "application/pdf") {
            console.log("PDF selected:", file.name);
            displayMessage('user', `File selected: ${file.name} (upload feature demo)`);
            alert(`Selected PDF: ${file.name}. Actual upload to Iris is not yet implemented.`);
        } else {
            chatError.textContent = "Only PDF files can be selected.";
            chatError.classList.add('active-error');
        }
        fileInputHidden.value = '';
    }
});


function checkScreenSize() {
    const isMobile = window.innerWidth <= 768;
    const isLoggedIn = auth.currentUser != null;

    if (isLoggedIn) {
        // Sidebar's display:flex is set in onAuthStateChanged when user logs in.
        // Here, we only manage mobile-specific transform and hamburger visibility.
        if (isMobile) {
            hamburgerMenu.style.display = 'block';
            // CSS handles .open class transform for sidebar
        } else { // Desktop
            hamburgerMenu.style.display = 'none';
            sidebar.classList.remove('open'); // Ensure not 'open' from mobile
            sidebar.style.transform = 'translateX(0%)'; // Ensure visible in static desktop position
            sidebarOverlay.classList.remove('active');
        }
    } else { // Not logged in
        sidebar.style.display = 'none'; // Explicitly hide sidebar if not logged in
        hamburgerMenu.style.display = 'none';
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('active');
    }

    const logoTitle = document.querySelector('.logo-title');
    const headerActionsPlaceholder = document.querySelector('.header-actions-placeholder');
    if (logoTitle) {
        const hamburgerIsEffectivelyVisible = isLoggedIn && isMobile;
        if (hamburgerIsEffectivelyVisible) {
            logoTitle.style.marginLeft = '0';
            logoTitle.style.marginRight = 'auto'; // Pushes placeholder to right
            logoTitle.style.flexGrow = '0'; // Don't let it grow too much
            logoTitle.style.justifyContent = 'flex-start'; // Align to start
            if (headerActionsPlaceholder) headerActionsPlaceholder.style.display = 'block'; // Show placeholder to balance
        } else { // Desktop or not logged in (hamburger hidden)
            logoTitle.style.marginLeft = 'auto';
            logoTitle.style.marginRight = 'auto';
            logoTitle.style.flexGrow = '0';
            logoTitle.style.justifyContent = 'center';
            if (headerActionsPlaceholder) headerActionsPlaceholder.style.display = 'none';
        }
    }
}

window.addEventListener('resize', checkScreenSize);
document.addEventListener('DOMContentLoaded', () => {
    // Initial UI setup before Firebase auth state is known
    authView.style.display = 'flex'; // Show auth by default
    chatView.style.display = 'none';
    sidebar.style.display = 'none';
    hamburgerMenu.style.display = 'none';
    checkScreenSize(); // Initial call to set up responsive elements if needed (though onAuthStateChanged is key)
});