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
    getDocs,
    deleteDoc, // MODIFIED: Import deleteDoc
    writeBatch // MODIFIED: Import writeBatch for deleting subcollections
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// IMPORTANT: Replace with your actual Firebase configuration!
const firebaseConfig = {
    apiKey: "AIzaSyCFviEOu-Y1_-Pf3WeLjgXU5lZI42N-EQg",
    authDomain: "iris-neuropass.firebaseapp.com",
    projectId: "iris-neuropass",
    storageBucket: "iris-neuropass.firebasestorage.app",
    messagingSenderId: "470784656826",
    appId: "1:470784656826:web:49bceaf81642ec54ad8983",
    measurementId: "G-6E9618FLL4"
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
const userInfoSidebarSpan = document.getElementById('user-info-sidebar');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const chatHistoryDiv = document.getElementById('chat-history');
const loadingIndicator = document.getElementById('loading-indicator');
const newChatButton = document.getElementById('new-chat-button');
const chatListUl = document.getElementById('chat-list');
const noChatSelectedDiv = document.getElementById('no-chat-selected');
// Removed file upload DOM elements

let currentUserId = null;
let currentUserNickname = null;
let currentChatId = null;
let unsubscribeChatMessages = null;
let unsubscribeChatList = null;
let currentChatFormattedHistory = [];

// --- Hamburger Menu Logic ---
if (hamburgerMenu) {
    hamburgerMenu.addEventListener('click', () => {
        const isOpen = sidebar.classList.toggle('open');
        hamburgerMenu.setAttribute('aria-expanded', isOpen.toString());
        sidebarOverlay.classList.toggle('active', isOpen);
    });
}
if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('active');
        if (hamburgerMenu) hamburgerMenu.setAttribute('aria-expanded', 'false');
    });
}

// --- Auto-resize Textarea ---
if (messageInput) {
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
}

// --- Authentication Logic ---
if (signupButton) {
    signupButton.addEventListener('click', async () => {
        const nickname = nicknameInput.value.trim();
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        authError.textContent = ''; authError.classList.remove('active-error');
        if (!nickname || !email || !password) { authError.textContent = "Please enter nickname, email, and password."; authError.classList.add('active-error'); return; }
        if (password.length < 6) { authError.textContent = "Password should be at least 6 characters."; authError.classList.add('active-error'); return; }
        if (nickname.length < 3) { authError.textContent = "Nickname should be at least 3 characters."; authError.classList.add('active-error'); return; }
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            await setDoc(doc(db, "users", user.uid), { nickname: nickname, email: user.email, createdAt: serverTimestamp() });
        } catch (error) { console.error("Signup Error:", error); authError.textContent = `Signup failed: ${getFirebaseErrorMessage(error)}`; authError.classList.add('active-error'); }
    });
}
if (loginButton) {
    loginButton.addEventListener('click', async () => {
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        authError.textContent = ''; authError.classList.remove('active-error');
        if (!email || !password) { authError.textContent = "Please enter email and password."; authError.classList.add('active-error'); return; }
        try { await signInWithEmailAndPassword(auth, email, password); }
        catch (error) { console.error("Login Error:", error); authError.textContent = `Login failed: ${getFirebaseErrorMessage(error)}`; authError.classList.add('active-error'); }
    });
}

if (logoutButtonSidebar) {
    logoutButtonSidebar.addEventListener('click', async () => {
        try {
            if (unsubscribeChatMessages) unsubscribeChatMessages();
            if (unsubscribeChatList) unsubscribeChatList();
            unsubscribeChatMessages = null; unsubscribeChatList = null;
            currentChatFormattedHistory = [];
            await signOut(auth);
        } catch (error) { console.error("Logout Error:", error); if(chatError) {chatError.textContent = "Logout failed. Please try again."; chatError.classList.add('active-error');} }
    });
}


async function createNewChatSession(userId, activate = true) {
    if (!userId) return null;
    if(chatError) { chatError.textContent = ''; chatError.classList.remove('active-error'); }
    try {
        const newChatRef = await addDoc(collection(db, "users", userId, "chats"), { title: "New Chat", createdAt: serverTimestamp(), lastMessageAt: serverTimestamp() });
        console.log("Created new chat with ID:", newChatRef.id);
        if (activate) {
            currentChatId = newChatRef.id;
            loadChatMessages(userId, currentChatId);
            updateActiveChatInSidebar(currentChatId);
            if (window.innerWidth <= 768 && sidebar.classList.contains('open')) { sidebar.classList.remove('open'); sidebarOverlay.classList.remove('active'); if(hamburgerMenu) hamburgerMenu.setAttribute('aria-expanded', 'false'); }
        }
        return newChatRef.id;
    } catch (error) { console.error("Error creating new chat:", error); if(chatError) {chatError.textContent = "Could not start a new chat."; chatError.classList.add('active-error');} return null; }
}


onAuthStateChanged(auth, async (user) => {
    if (user) {
        if (currentUserId !== user.uid) {
            currentUserId = user.uid;
            try {
                const userDocRef = doc(db, "users", user.uid);
                const userDocSnap = await getDoc(userDocRef);
                if (userDocSnap.exists()) { currentUserNickname = userDocSnap.data().nickname; }
                else { currentUserNickname = user.email.split('@')[0]; await setDoc(doc(db, "users", user.uid), { nickname: currentUserNickname, email: user.email, createdAt: serverTimestamp() }, { merge: true }); }
            } catch (fetchError) { console.error("Error fetching user nickname:", fetchError); currentUserNickname = user.email.split('@')[0]; }
            if(userInfoSidebarSpan) userInfoSidebarSpan.textContent = `${currentUserNickname}`;
            if(authView) authView.style.display = 'none';
            if(chatView) chatView.style.display = 'flex';
            if(sidebar) sidebar.style.display = 'flex';
            checkScreenSize();
            if(messageInput) messageInput.value = '';
            if(chatError) { chatError.textContent = ''; chatError.classList.remove('active-error'); }
            if(authError) { authError.textContent = ''; authError.classList.remove('active-error'); }
            currentChatId = null;
            loadUserChats(currentUserId);
        } else {
            if(authView) authView.style.display = 'none';
            if(chatView) chatView.style.display = 'flex';
            if(sidebar) sidebar.style.display = 'flex';
            checkScreenSize();
            if (!unsubscribeChatList) loadUserChats(currentUserId);
            else if (currentChatId && !unsubscribeChatMessages) loadChatMessages(currentUserId, currentChatId);
            else if (currentChatId) updateChatUIForActiveChat();
            else updateChatUIForNoSelection();
        }
    } else {
        if (currentUserId !== null || (authView && authView.style.display === 'none')) {
            currentUserId = null; currentUserNickname = null; currentChatId = null;
            if (unsubscribeChatMessages) unsubscribeChatMessages();
            if (unsubscribeChatList) unsubscribeChatList();
            unsubscribeChatMessages = null; unsubscribeChatList = null;
            currentChatFormattedHistory = [];
            if(chatHistoryDiv) chatHistoryDiv.innerHTML = '';
            if(chatListUl) chatListUl.innerHTML = '';
            if(authView) authView.style.display = 'flex';
            if(chatView) chatView.style.display = 'none';
            if(sidebar) sidebar.style.display = 'none';
            if(hamburgerMenu) hamburgerMenu.style.display = 'none';
            if(sidebar) sidebar.classList.remove('open');
            if(sidebarOverlay) sidebarOverlay.classList.remove('active');
            if(hamburgerMenu) hamburgerMenu.setAttribute('aria-expanded', 'false');
            if(userInfoSidebarSpan) userInfoSidebarSpan.textContent = '';
            if(nicknameInput) nicknameInput.value = '';
            if(emailInput) emailInput.value = '';
            if(passwordInput) passwordInput.value = '';
        }
        if(authView) authView.style.display = 'flex';
        if(chatView) chatView.style.display = 'none';
        if(sidebar) sidebar.style.display = 'none';
        if(hamburgerMenu) hamburgerMenu.style.display = 'none';
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
    } return 'An unknown error occurred.';
}

if (newChatButton) {
    newChatButton.addEventListener('click', async () => { if (!currentUserId) return; await createNewChatSession(currentUserId, true); });
}

// MODIFIED: Function to delete a chat and its messages
async function deleteChat(userId, chatIdToDelete) {
    if (!userId || !chatIdToDelete) return;

    const confirmation = confirm("Are you sure you want to delete this chat? This action cannot be undone.");
    if (!confirmation) return;

    try {
        // 1. Delete all messages in the chat's subcollection
        const messagesRef = collection(db, "users", userId, "chats", chatIdToDelete, "messages");
        const messagesSnapshot = await getDocs(messagesRef);
        const batch = writeBatch(db);
        messagesSnapshot.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        console.log(`Messages for chat ${chatIdToDelete} deleted.`);

        // 2. Delete the chat document itself
        const chatDocRef = doc(db, "users", userId, "chats", chatIdToDelete);
        await deleteDoc(chatDocRef);
        console.log(`Chat ${chatIdToDelete} deleted.`);

        // 3. Update UI
        if (currentChatId === chatIdToDelete) {
            currentChatId = null; // Clear current active chat
            if (unsubscribeChatMessages) unsubscribeChatMessages();
            unsubscribeChatMessages = null;
            updateChatUIForNoSelection(); // Show placeholder, disable input
        }
        // The onSnapshot listener for loadUserChats will automatically update the chat list.
        // If no chats are left, it will trigger createNewChatSession.
        // If other chats exist, it will select the newest one.

    } catch (error) {
        console.error("Error deleting chat:", error);
        if (chatError) {
            chatError.textContent = "Error deleting chat. Please try again.";
            chatError.classList.add('active-error');
        }
    }
}


function loadUserChats(userId) {
    if (unsubscribeChatList) unsubscribeChatList();
    if(chatError) { chatError.textContent = ''; chatError.classList.remove('active-error'); }

    const chatsRef = collection(db, "users", userId, "chats");
    const q = query(chatsRef, orderBy("lastMessageAt", "desc"), limit(30));

    unsubscribeChatList = onSnapshot(q, async (snapshot) => {
        if (!chatListUl) return;
        chatListUl.innerHTML = '';
        let firstChatIdFromSnapshot = null;
        let activeChatStillExists = false;

        if (snapshot.empty) {
            chatListUl.innerHTML = '<li class="no-chats">No chats yet.</li>';
            console.log("No chats found. Creating initial chat from loadUserChats.");
            if (!currentChatId) {
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

            // MODIFIED: Create a span for the title to sit next to the delete button
            const titleSpan = document.createElement('span');
            titleSpan.classList.add('chat-item-title');
            titleSpan.textContent = chatData.title || `Chat from ${chatData.createdAt?.toDate().toLocaleDateString([], {month:'short', day:'numeric'}) || 'earlier'}`;
            li.appendChild(titleSpan);

            // MODIFIED: Add delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.classList.add('delete-chat-button');
            deleteBtn.setAttribute('aria-label', `Delete chat: ${titleSpan.textContent}`);
            deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent li click event from firing
                deleteChat(userId, docSnap.id);
            });
            li.appendChild(deleteBtn);


            if (docSnap.id === currentChatId) {
                li.classList.add('active-chat');
            }
            li.addEventListener('click', () => { // Click on the li itself (not the delete button)
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
            console.log("Selecting first available chat (current invalid or null):", firstChatIdFromSnapshot);
            currentChatId = firstChatIdFromSnapshot;
            loadChatMessages(userId, currentChatId);
            updateActiveChatInSidebar(currentChatId);
        } else {
             // This case means snapshot was not empty, but firstChatIdFromSnapshot is null.
             // This implies something is wrong or all chats were simultaneously deleted by another client.
             // onSnapshot should run again if snapshot.empty becomes true.
             updateChatUIForNoSelection();
        }

    }, (error) => {
        console.error("Error loading user chats:", error);
        if(chatError) { chatError.textContent = "Could not load chat list."; chatError.classList.add('active-error'); }
    });
}

function updateActiveChatInSidebar(chatId) {
    if (!chatListUl) return;
    Array.from(chatListUl.children).forEach(li => {
        if (li.classList.contains('no-chats')) return;
        // Check if dataset.chatId exists, as titleSpan doesn't have it
        const itemChatId = li.dataset.chatId;
        li.classList.toggle('active-chat', itemChatId === chatId);
    });
}

function updateChatUIForNoSelection() {
    if(chatHistoryDiv) chatHistoryDiv.innerHTML = '';
    currentChatFormattedHistory = [];
    if(noChatSelectedDiv) noChatSelectedDiv.style.display = 'flex';
    if(messageInput) { messageInput.disabled = true; messageInput.placeholder = "Select or create a chat"; }
    if(sendButton) sendButton.disabled = true;
}

function updateChatUIForActiveChat() {
    if(noChatSelectedDiv) noChatSelectedDiv.style.display = 'none';
    if(messageInput) { messageInput.disabled = false; messageInput.placeholder = "Message Iris..."; }
    if(sendButton) sendButton.disabled = false;
}

function displayMessage(sender, text, isError = false) {
    if(!chatHistoryDiv) return;
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', sender === 'user' ? 'user-message' : 'iris-message');
    if (isError && sender === 'iris') { messageDiv.classList.add('error-message'); }
    const textNode = document.createTextNode(text); messageDiv.appendChild(textNode);
    const timestampSpan = document.createElement('span'); timestampSpan.classList.add('message-timestamp');
    timestampSpan.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    messageDiv.appendChild(timestampSpan); chatHistoryDiv.appendChild(messageDiv);
    requestAnimationFrame(() => { chatHistoryDiv.scrollTo({ top: chatHistoryDiv.scrollHeight, behavior: 'smooth' }); });
}

async function saveMessageToFirestore(userId, chatId, sender, text) {
    if (!userId || !chatId) { console.warn("Cannot save message: userId or chatId missing."); return; }
    try {
        const messageData = { sender: sender, text: text, timestamp: serverTimestamp() };
        const messagesCollectionRef = collection(db, "users", userId, "chats", chatId, "messages");
        await addDoc(messagesCollectionRef, messageData);
        const chatDocRef = doc(db, "users", userId, "chats", chatId);
        const updateData = { lastMessageAt: serverTimestamp() };
        const chatDocSnap = await getDoc(chatDocRef);
        if (chatDocSnap.exists()) {
            const chatDataVal = chatDocSnap.data();
            if ((chatDataVal.title === "New Chat" || !chatDataVal.title) && sender === 'user') {
                const messagesQuery = query(messagesCollectionRef, orderBy("timestamp", "asc"), limit(1));
                const messagesSnapshot = await getDocs(messagesQuery);
                if (messagesSnapshot.docs.length > 0 && messagesSnapshot.docs[0].data().text === text && messagesSnapshot.docs[0].data().sender === 'user') {
                     updateData.title = text.substring(0, 25) + (text.length > 25 ? "..." : "");
                }
            }
        }
        await setDoc(chatDocRef, updateData, { merge: true });
    } catch (error) { console.error("Error saving message to Firestore:", error); if(chatError) {chatError.textContent = "Error saving message."; chatError.classList.add('active-error');} }
}

function loadChatMessages(userId, chatId) {
    if (!userId || !chatId) { updateChatUIForNoSelection(); return; }
    if (unsubscribeChatMessages) unsubscribeChatMessages();
    if(chatError) { chatError.textContent = ''; chatError.classList.remove('active-error'); }
    if(chatHistoryDiv) chatHistoryDiv.innerHTML = '';
    updateChatUIForActiveChat();
    currentChatFormattedHistory = [];

    const messagesRef = collection(db, "users", userId, "chats", chatId, "messages");
    const q_msg = query(messagesRef, orderBy("timestamp", "asc"), limit(50));

    unsubscribeChatMessages = onSnapshot(q_msg, (querySnapshot) => {
        if(!chatHistoryDiv) return;
        const newFormattedHistory = []; chatHistoryDiv.innerHTML = '';
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            displayMessage(data.sender, data.text, data.sender === 'iris' && data.text.startsWith("[System Error"));
            newFormattedHistory.push({ role: data.sender === 'user' ? 'user' : 'model', parts: [{ text: data.text }] });
        });
        currentChatFormattedHistory = newFormattedHistory;
        if (chatHistoryDiv.innerHTML !== '') { requestAnimationFrame(() => { chatHistoryDiv.scrollTo({ top: chatHistoryDiv.scrollHeight, behavior: 'auto' }); }); }
    }, (error) => { console.error("Error listening to chat messages:", error); if(chatError) {chatError.textContent = "Could not load messages for this chat."; chatError.classList.add('active-error');} currentChatFormattedHistory = []; });
}

if (sendButton && messageInput) {
    sendButton.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
}

async function sendMessage() {
    const messageText = messageInput.value.trim();
    if (!messageText || !currentUserId || !currentChatId || sendButton.disabled) return;

    const messageToSend = messageText;
    messageInput.value = ''; messageInput.style.height = 'auto'; messageInput.dispatchEvent(new Event('input'));
    if(chatError) { chatError.textContent = ''; chatError.classList.remove('active-error'); }

    displayMessage('user', messageToSend);
    await saveMessageToFirestore(currentUserId, currentChatId, 'user', messageToSend);

    let historyForAPI = currentChatFormattedHistory.filter(m => !(m.role === 'user' && m.parts[0].text === messageToSend));
    historyForAPI.push({ role: 'user', parts: [{ text: messageToSend }] });

    const MAX_HISTORY_MESSAGES = 20;
    if (historyForAPI.length > MAX_HISTORY_MESSAGES) { historyForAPI = historyForAPI.slice(-MAX_HISTORY_MESSAGES); }

    if(loadingIndicator) loadingIndicator.style.display = 'flex';
    if(sendButton) sendButton.disabled = true;
    if(messageInput) messageInput.disabled = true;

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
        if (!response.ok) { let errorMsg = `Network: ${response.status} ${response.statusText}`; try { const errorData = await response.json(); errorMsg += ` - ${errorData.error || 'Unknown backend error'}`; } catch (parseError) {} throw new Error(errorMsg); }
        const data = await response.json();
        if (data.reply) { await saveMessageToFirestore(currentUserId, currentChatId, 'iris', data.reply); }
        else { const noReplyMsg = "Iris didn't have a response to that."; await saveMessageToFirestore(currentUserId, currentChatId, 'iris', noReplyMsg); }
    } catch (error) {
        console.error('Error during sendMessage:', error);
        const displayErrorMessage = `An issue occurred: ${error.message || "Could not reach Iris."}`;
        if(chatError) { chatError.textContent = displayErrorMessage; chatError.classList.add('active-error'); }
        await saveMessageToFirestore(currentUserId, currentChatId, 'iris', `[System Error: ${error.message || "Could not reach Iris."}]`);
    } finally {
        if(loadingIndicator) loadingIndicator.style.display = 'none';
        if(sendButton) sendButton.disabled = false;
        if(messageInput) messageInput.disabled = false;
    }
}

// Removed File Upload Logic (uploadFileButton, fileInputHidden listeners)

function checkScreenSize() {
    const isMobile = window.innerWidth <= 768;
    const isLoggedIn = auth.currentUser != null;

    if (isLoggedIn) {
        if(sidebar) sidebar.style.display = 'flex';
        if (isMobile) { if(hamburgerMenu) hamburgerMenu.style.display = 'block'; }
        else { if(hamburgerMenu) hamburgerMenu.style.display = 'none'; if(sidebar) {sidebar.classList.remove('open'); sidebar.style.transform = 'translateX(0%)';} if(sidebarOverlay) sidebarOverlay.classList.remove('active'); }
    } else {
        if(sidebar) sidebar.style.display = 'none';
        if(hamburgerMenu) hamburgerMenu.style.display = 'none';
        if(sidebar) sidebar.classList.remove('open');
        if(sidebarOverlay) sidebarOverlay.classList.remove('active');
    }

    const logoTitle = document.querySelector('.logo-title');
    const headerActionsPlaceholder = document.querySelector('.header-actions-placeholder');
    if (logoTitle && hamburgerMenu) {
        const hamburgerIsEffectivelyVisible = isLoggedIn && isMobile && window.getComputedStyle(hamburgerMenu).display !== 'none';
        if (hamburgerIsEffectivelyVisible) {
            logoTitle.style.marginLeft = '0'; logoTitle.style.marginRight = 'auto'; logoTitle.style.flexGrow = '0'; logoTitle.style.justifyContent = 'flex-start';
            const hamburgerWidth = hamburgerMenu.offsetWidth + parseInt(window.getComputedStyle(hamburgerMenu).marginLeft) + parseInt(window.getComputedStyle(hamburgerMenu).marginRight);
            // logoTitle.style.paddingRight = `${hamburgerWidth}px`; // This can misalign if hamburger has no margin
            if(headerActionsPlaceholder) headerActionsPlaceholder.style.display = 'block'; // Use placeholder to balance
        } else {
            logoTitle.style.marginLeft = 'auto'; logoTitle.style.marginRight = 'auto'; logoTitle.style.flexGrow = '0'; logoTitle.style.justifyContent = 'center'; logoTitle.style.paddingRight = '0';
            if(headerActionsPlaceholder) headerActionsPlaceholder.style.display = 'none';
        }
    }
}

window.addEventListener('resize', checkScreenSize);
document.addEventListener('DOMContentLoaded', () => {
    if(authView) authView.style.display = 'flex';
    if(chatView) chatView.style.display = 'none';
    if(sidebar) sidebar.style.display = 'none';
    if(hamburgerMenu) hamburgerMenu.style.display = 'none';
    checkScreenSize();
});