let socket;
let allPlayers = [];
let currentFilter = 'all';

document.addEventListener('DOMContentLoaded', function() {
    initializeSocket();
    loadPlayers();
    setupEventListeners();
});

function initializeSocket() {
    socket = io();
    
    socket.on('connect', function() {
        console.log('connected to socket');
    });
    
    socket.on('user_status', function(data) {
        updatePlayerStatus(data.user_id, data.status);
    });
    
    socket.on('online_users', function(onlineUserIds) {
        updateAllPlayersStatus(onlineUserIds);
    });
}

function loadPlayers() {
    fetch('/api/players')
        .then(response => {
            if (!response.ok) {
                if (response.status === 401) {
                    window.location.href = '/login';
                }
                throw new Error('failed to load players');
            }
            return response.json();
        })
        .then(players => {
            allPlayers = players;
            renderPlayers(players);
        })
        .catch(error => {
            console.error('Error:', error);
            showError('failed to load players');
        });
}

function renderPlayers(players) {
    const playersGrid = document.getElementById('playersGrid');
    
    if (players.length === 0) {
        playersGrid.innerHTML = `
            <div class="no-players">
                <i class="fas fa-users-slash"></i>
                <p>no players found</p>
            </div>
        `;
        return;
    }
    
    playersGrid.innerHTML = '';
    
    players.forEach(player => {
        const playerCard = createPlayerCard(player);
        playersGrid.appendChild(playerCard);
    });
}

function createPlayerCard(player) {
    const card = document.createElement('div');
    card.className = 'player-card';
    card.dataset.userId = player.id;
    
    const statusClass = player.status === 'online' ? 'online' : 'offline';
    const statusText = player.status === 'online' ? 'Online' : 'Offline';
    const lastSeen = player.last_seen ? new Date(player.last_seen).toLocaleString() : 'Never';
    
    card.innerHTML = `
        <div class="player-header">
            <div class="player-avatar">
                <img src="${player.avatar}" alt="${player.username}" onerror="this.src='/static/default-avatar.png'">
            </div>
            <div class="player-info">
                <div class="player-name">${player.username}</div>
                <div class="player-status">
                    <span class="status-indicator ${statusClass}"></span>
                    <span>${statusText}</span>
                </div>
            </div>
        </div>
        <div class="player-details">
            <div class="player-last-seen">
                <i class="far fa-clock"></i>
                Last seen: ${lastSeen}
            </div>
        </div>
        <div class="player-actions">
            <button class="player-action-btn" onclick="viewProfile(${player.id})">
                <i class="fas fa-user"></i> profile
            </button>
            <button class="player-action-btn primary" onclick="startConversation(${player.id})">
                <i class="fas fa-comment"></i> message
            </button>
        </div>
    `;
    
    return card;
}

function setupEventListeners() {
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            filterBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentFilter = this.dataset.filter;
            filterPlayers();
        });
    });
    
    const searchInput = document.getElementById('playerSearch');
    searchInput.addEventListener('input', function() {
        filterPlayers();
    });
}

function filterPlayers() {
    let filteredPlayers = [...allPlayers];
    
    const searchTerm = document.getElementById('playerSearch').value.toLowerCase();
    if (searchTerm) {
        filteredPlayers = filteredPlayers.filter(player => 
            player.username.toLowerCase().includes(searchTerm)
        );
    }
    
    if (currentFilter === 'online') {
        filteredPlayers = filteredPlayers.filter(player => player.status === 'online');
    } else if (currentFilter === 'offline') {
        filteredPlayers = filteredPlayers.filter(player => player.status === 'offline');
    }
    
    renderPlayers(filteredPlayers);
}

function updatePlayerStatus(userId, status) {
    const playerIndex = allPlayers.findIndex(p => p.id === userId);
    if (playerIndex !== -1) {
        allPlayers[playerIndex].status = status;
        allPlayers[playerIndex].last_seen = new Date().toISOString();
        
        const playerCard = document.querySelector(`.player-card[data-user-id="${userId}"]`);
        if (playerCard) {
            const statusIndicator = playerCard.querySelector('.status-indicator');
            const statusText = playerCard.querySelector('.player-status span:nth-child(2)');
            const lastSeen = playerCard.querySelector('.player-last-seen');
            
            if (status === 'online') {
                statusIndicator.className = 'status-indicator online';
                statusText.textContent = 'Online';
            } else {
                statusIndicator.className = 'status-indicator offline';
                statusText.textContent = 'Offline';
            }
            
            lastSeen.innerHTML = `<i class="far fa-clock"></i> Last seen: ${new Date().toLocaleString()}`;
        }
        
        filterPlayers();
    }
}

function updateAllPlayersStatus(onlineUserIds) {
    allPlayers.forEach(player => {
        player.status = onlineUserIds.includes(player.id) ? 'online' : 'offline';
    });
    
    renderPlayers(allPlayers);
}

function viewProfile(userId) {
    fetch(`/api/user/${userId}`)
        .then(response => response.json())
        .then(user => {
            alert(`${user.username}\nstatus: ${user.status}\nbio: ${user.bio || 'no bio'}`);
        })
        .catch(error => {
            console.error('Error:', error);
            showError('failed to load user profile');
        });
}

function startConversation(userId) {
    window.location.href = `/messages?user=${userId}`;
}

function showError(message) {
    const playersGrid = document.getElementById('playersGrid');
    playersGrid.innerHTML = `
        <div class="error-message">
            <i class="fas fa-exclamation-triangle"></i>
            <p>${message}</p>
            <button onclick="loadPlayers()" class="btn btn-secondary">
                <i class="fas fa-redo"></i> retry
            </button>
        </div>
    `;
}

document.body.classList.add('fade-in');