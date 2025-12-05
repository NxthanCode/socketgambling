let socket;
let currentUserId = null;
let currentUserData = null;
let conversations = [];
let typingTimeout = null;

document.addEventListener('DOMContentLoaded', function() {
    initializeSocket();
    loadConversations();
    setupEventListeners();
});

function initializeSocket() {
    socket = io();
    
    socket.on('connect', function() {
        console.log('connected to socket');
    });
    
    socket.on('new_message', function(message) {
        handleNewMessage(message);
    });
    
    socket.on('user_typing', function(data) {
        showTypingIndicator(data);
    });
    
    socket.on('user_stop_typing', function(data) {
        hideTypingIndicator(data.user_id);
    });
    
    socket.on('user_status', function(data) {
        updateUserStatus(data.user_id, data.status);
    });
}

function loadConversations() {
    fetch('/api/conversations')
        .then(response => {
            if (!response.ok) {
                if (response.status === 401) {
                    window.location.href = '/login';
                }
                throw new Error('failed to load conversations');
            }
            return response.json();
        })
        .then(data => {
            conversations = data;
            renderConversations(data);
            
            const urlParams = new URLSearchParams(window.location.search);
            const userId = urlParams.get('user');
            if (userId) {
                openConversation(parseInt(userId));
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showError('failed to load conversations');
        });
}

function renderConversations(conversations) {
    const conversationsList = document.getElementById('conversationsList');
    
    if (conversations.length === 0) {
        conversationsList.innerHTML = `
            <div class="no-conversations">
                <i class="fas fa-comment-slash"></i>
                <p>no convos yet</p>
            </div>
        `;
        return;
    }
    
    conversationsList.innerHTML = '';
    
    conversations.forEach(conversation => {
        const conversationItem = createConversationItem(conversation);
        conversationsList.appendChild(conversationItem);
    });
}

function createConversationItem(conversation) {
    const item = document.createElement('div');
    item.className = 'conversation-item';
    item.dataset.userId = conversation.user_id;
    
    if (currentUserId === conversation.user_id) {
        item.classList.add('active');
    }
    
    const lastTime = conversation.last_message_time ? 
        formatTime(conversation.last_message_time) : 'No messages';
    
    const preview = conversation.last_message ? 
        (conversation.last_message.length > 50 ? 
         conversation.last_message.substring(0, 50) + '...' : 
         conversation.last_message) : 'Start a conversation';
    
    item.innerHTML = `
        <div class="conversation-header">
            <div class="conversation-avatar">
                <img src="${conversation.avatar}" alt="${conversation.username}" onerror="this.src='/static/default-avatar.png'">
            </div>
            <div class="conversation-info">
                <div class="conversation-name">${conversation.username}</div>
                <div class="conversation-time">${lastTime}</div>
            </div>
            ${conversation.unread_count > 0 ? 
                `<span class="unread-badge">${conversation.unread_count}</span>` : ''}
        </div>
        <div class="conversation-preview">${preview}</div>
    `;
    
    item.addEventListener('click', () => openConversation(conversation.user_id));
    
    return item;
}

function openConversation(userId) {
    currentUserId = userId;
    
    document.querySelectorAll('.conversation-item').forEach(item => {
        item.classList.remove('active');
        if (parseInt(item.dataset.userId) === userId) {
            item.classList.add('active');
        }
    });
    
    loadUserData(userId);
    loadMessages(userId);
    setupChatInput();
}

function loadUserData(userId) {
    fetch(`/api/user/${userId}`)
        .then(response => response.json())
        .then(user => {
            currentUserData = user;
            updateChatHeader(user);
        })
        .catch(error => {
            console.error('Error:', error);
            showError('failed to load user data');
        });
}

function updateChatHeader(user) {
    const chatHeader = document.getElementById('chatHeader');
    
    chatHeader.innerHTML = `
        <div class="chat-header-content">
            <div class="chat-user-avatar">
                <img src="${user.avatar}" alt="${user.username}" onerror="this.src='/static/default-avatar.png'">
            </div>
            <div class="chat-user-info">
                <div class="chat-user-name">${user.username}</div>
                <div class="chat-user-status">
                    <span class="status-indicator ${user.status === 'online' ? 'online' : 'offline'}"></span>
                    <span>${user.status === 'online' ? 'Online' : 'Offline'}</span>
                    <span class="typing-indicator hidden" id="typingIndicator">is typing..</span>
                </div>
            </div>
        </div>
    `;
}

function loadMessages(userId) {
    fetch(`/api/messages?user_id=${userId}`)
        .then(response => response.json())
        .then(messages => {
            renderMessages(messages);
            scrollToBottom();
        })
        .catch(error => {
            console.error('Error:', error);
            showError('Failed to load messages');
        });
}

function renderMessages(messages) {
    const chatMessages = document.getElementById('chatMessages');
    
    if (messages.length === 0) {
        chatMessages.innerHTML = `
            <div class="no-messages">
                <i class="fas fa-comment-medical"></i>
                <p>No messages yet</p>
                <p class="hint">start the conversation</p>
            </div>
        `;
        return;
    }
    
    chatMessages.innerHTML = '';
    
    messages.forEach(message => {
        const messageElement = createMessageElement(message);
        chatMessages.appendChild(messageElement);
    });
}

function createMessageElement(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message-item ${message.is_own ? 'own' : ''}`;
    
    const time = formatTime(message.timestamp);
    
    messageDiv.innerHTML = `
        <div class="message-avatar">
            <img src="${message.sender_avatar}" alt="${message.sender_name}" onerror="this.src='/static/default-avatar.png'">
        </div>
        <div class="message-content">
            <div class="message-text">${escapeHtml(message.message)}</div>
            <div class="message-time">${time}</div>
        </div>
    `;
    
    return messageDiv;
}

function setupChatInput() {
    const chatInputContainer = document.getElementById('chatInputContainer');
    
    chatInputContainer.innerHTML = `
        <div class="chat-input-area">
            <textarea 
                class="chat-textarea" 
                id="messageInput" 
                placeholder="type your message"
                rows="1"
            ></textarea>
            <button class="send-btn" id="sendMessageBtn">
                <i class="fas fa-paper-plane"></i>
            </button>
        </div>
    `;
    
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendMessageBtn');
    
    messageInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        
        if (this.value.trim()) {
            sendBtn.disabled = false;
        } else {
            sendBtn.disabled = true;
        }
        
        if (currentUserId) {
            socket.emit('typing', { receiver_id: currentUserId });
            
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => {
                socket.emit('stop_typing', { receiver_id: currentUserId });
            }, 1000);
        }
    });
    
    messageInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    sendBtn.addEventListener('click', sendMessage);
}

function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const message = messageInput.value.trim();
    
    if (!message || !currentUserId) return;
    
    socket.emit('private_message', {
        receiver_id: currentUserId,
        message: message
    });
    
    const chatMessages = document.getElementById('chatMessages');
    const noMessages = chatMessages.querySelector('.no-messages');
    if (noMessages) {
        chatMessages.innerHTML = '';
    }
    
    const messageElement = createMessageElement({
        message: message,
        timestamp: new Date().toISOString(),
        is_own: true,
        sender_avatar: '/static/default-avatar.png'
    });
    
    chatMessages.appendChild(messageElement);
    messageInput.value = '';
    messageInput.style.height = 'auto';
    document.getElementById('sendMessageBtn').disabled = true;
    
    scrollToBottom();
    updateConversationPreview(currentUserId, message);
}

function handleNewMessage(message) {
    if (message.sender_id === currentUserId) {
        const chatMessages = document.getElementById('chatMessages');
        const noMessages = chatMessages.querySelector('.no-messages');
        if (noMessages) {
            chatMessages.innerHTML = '';
        }
        
        const messageElement = createMessageElement({
            ...message,
            is_own: false
        });
        
        chatMessages.appendChild(messageElement);
        scrollToBottom();
        updateConversationPreview(currentUserId, message.message);
    } else {
        const conversationItem = document.querySelector(`.conversation-item[data-user-id="${message.sender_id}"]`);
        if (conversationItem) {
            updateConversationPreview(message.sender_id, message.message);
            conversationItem.querySelector('.unread-badge')?.remove();
        }
    }
}

function updateConversationPreview(userId, message) {
    const conversationItem = document.querySelector(`.conversation-item[data-user-id="${userId}"]`);
    if (conversationItem) {
        const preview = conversationItem.querySelector('.conversation-preview');
        const time = conversationItem.querySelector('.conversation-time');
        
        if (preview) {
            preview.textContent = message.length > 50 ? message.substring(0, 50) + '...' : message;
        }
        
        if (time) {
            time.textContent = 'Just now';
        }
        
        conversationItem.parentNode.prepend(conversationItem);
    }
}

function showTypingIndicator(data) {
    if (data.user_id === currentUserId) {
        const typingIndicator = document.getElementById('typingIndicator');
        if (typingIndicator) {
            typingIndicator.classList.remove('hidden');
            setTimeout(() => {
                typingIndicator.classList.add('hidden');
            }, 3000);
        }
    }
}

function hideTypingIndicator(userId) {
    if (userId === currentUserId) {
        const typingIndicator = document.getElementById('typingIndicator');
        if (typingIndicator) {
            typingIndicator.classList.add('hidden');
        }
    }
}

function updateUserStatus(userId, status) {
    if (userId === currentUserId && currentUserData) {
        currentUserData.status = status;
        updateChatHeader(currentUserData);
    }
    
    const conversationItem = document.querySelector(`.conversation-item[data-user-id="${userId}"]`);
    if (conversationItem) {
        const statusIndicator = conversationItem.querySelector('.status-indicator');
        if (statusIndicator) {
            statusIndicator.className = `status-indicator ${status}`;
        }
    }
}

function setupEventListeners() {
    const newMessageBtn = document.getElementById('newMessageBtn');
    const closeNewMessageModal = document.getElementById('closeNewMessageModal');
    const cancelNewMessage = document.getElementById('cancelNewMessage');
    const sendNewMessage = document.getElementById('sendNewMessage');
    const modal = document.getElementById('newMessageModal');
    
    newMessageBtn.addEventListener('click', () => {
        loadPlayersForNewMessage();
        modal.classList.add('active');
    });
    
    closeNewMessageModal.addEventListener('click', () => {
        modal.classList.remove('active');
    });
    
    cancelNewMessage.addEventListener('click', () => {
        modal.classList.remove('active');
    });
    
    sendNewMessage.addEventListener('click', () => {
        const playerSelect = document.getElementById('selectPlayer');
        const messageInput = document.getElementById('newMessage');
        
        if (!playerSelect.value || !messageInput.value.trim()) {
            alert('please select a player and enter a message');
            return;
        }
        
        const userId = parseInt(playerSelect.value);
        const message = messageInput.value.trim();
        
        socket.emit('private_message', {
            receiver_id: userId,
            message: message
        });
        
        modal.classList.remove('active');
        playerSelect.value = '';
        messageInput.value = '';
        
        openConversation(userId);
    });
}

function loadPlayersForNewMessage() {
    fetch('/api/players')
        .then(response => response.json())
        .then(players => {
            const selectPlayer = document.getElementById('selectPlayer');
            selectPlayer.innerHTML = '<option value="">choose a player</option>';
            
            players.forEach(player => {
                const option = document.createElement('option');
                option.value = player.id;
                option.textContent = player.username;
                selectPlayer.appendChild(option);
            });
        })
        .catch(error => {
            console.error('Error:', error);
        });
}

function scrollToBottom() {
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) {
        return 'Just now';
    } else if (diff < 3600000) {
        const minutes = Math.floor(diff / 60000);
        return `${minutes} min${minutes !== 1 ? 's' : ''} ago`;
    } else if (diff < 86400000) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showError(message) {
    const chatMessages = document.getElementById('chatMessages');
    chatMessages.innerHTML = `
        <div class="error-message">
            <i class="fas fa-exclamation-triangle"></i>
            <p>${message}</p>
            <button onclick="loadMessages(currentUserId)" class="btn btn-secondary">
                <i class="fas fa-redo"></i> retry
            </button>
        </div>
    `;
}

document.body.classList.add('fade-in');