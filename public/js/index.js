// --- Riferimenti agli elementi del DOM ---
const DOM = {
    settingsModal: document.getElementById('settings-modal'),
    createLobbyModal: document.getElementById('create-lobby-modal'),
    joinLobbyModal: document.getElementById('join-lobby-modal'),
    playersModal: document.getElementById('players-modal'),
    rulesTab: document.getElementById('rules-tab'), // Ora è un modale completo

    settingsBtn: document.getElementById('settings-btn'),
    createLobbyBtn: document.getElementById('create-lobby-btn'),
    joinLobbyBtn: document.getElementById('join-lobby-btn'),
    rulesBtn: document.getElementById('rules-btn'),

    // Selezioniamo TUTTI i pulsanti di chiusura con una sola classe per semplicità
    closeButtons: document.querySelectorAll('.close-btn'), // Assicurati che rules-tab abbia un close-btn al suo interno

    lobbyCodeInput: document.getElementById('lobby-code'),
    copyLobbyBtn: document.getElementById('copy-lobby-code'),
    startGameBtn: document.getElementById('start-game-btn'),
    joinLobbyCodeInput: document.getElementById('join-lobby-code'),
    joinLobbySubmit: document.getElementById('join-lobby-submit'),
    
    // Contenitori per le liste giocatori
    playersListContainer: document.getElementById('players-list'),
    playerSpots: document.querySelectorAll('.player-spot p'),

    themeToggle: document.getElementById('theme-toggle')
};

// --- Connessione Socket.IO (verrà inizializzata direttamente in initializeApp) ---
let socket; 

// --- Stato Globale dell'Applicazione ---
const appState = {
    currentLobbyCode: null,
    currentPlayerName: null,
    isOwner: false,
    currentSocketId: null
};

// =========================================================================
// Funzione per i Modali Semplificata e Robusta
// =========================================================================
function toggleModal(modalElement, show) {
    if (!modalElement) return;
    
    if (show) {
        modalElement.classList.add('is-active');
    } else {
        modalElement.classList.remove('is-active');
    }
}

// --- Funzioni di Logica ---

function updatePlayerDisplay(players) {
    DOM.playerSpots.forEach((spot, index) => {
        spot.textContent = players[index] || "Vuoto";
    });

    if (DOM.playersListContainer) {
        DOM.playersListContainer.innerHTML = "";
        players.forEach((player) => {
            const playerElement = document.createElement('p');
            playerElement.textContent = player;
            DOM.playersListContainer.appendChild(playerElement);
        });
    }
    
    const canStart = appState.isOwner && players.length >= 2; // MODIFICATO: per la logica del server, richiede 4 giocatori
    DOM.startGameBtn.disabled = !canStart;
    DOM.startGameBtn.classList.toggle('enabled', canStart);
}

function resetLobbyState() {
    // Chiude tutti i modali aperti
    document.querySelectorAll('.modal.is-active').forEach(modal => toggleModal(modal, false));

    appState.currentLobbyCode = null;
    appState.currentPlayerName = null;
    appState.isOwner = false;

    updatePlayerDisplay([]); // Pulisce la visualizzazione dei giocatori
}

function generateLobbyCode() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return code;
}

// =========================================================================
// Funzione per inizializzare tutti gli Event Listeners e la logica principale
// Verrà chiamata al caricamento del DOM standard.
// =========================================================================
function initializeApp() {
    // Inizializza Socket.IO qui, al caricamento del DOM
    // ****** AGGIORNATO CON L'URL DEL TUO SERVER RENDER ******
    socket = io("https://cordova-ie4q.onrender.com/");

    // --- Event Listeners UI ---

    // Menu Principale
    DOM.createLobbyBtn.addEventListener('click', () => {
        const player = prompt("Inserisci il tuo nome (Proprietario):");
        if (!player || player.trim() === '') {
            alert("Il nome non può essere vuoto.");
            return;
        }

        appState.currentPlayerName = player;
        appState.isOwner = true;
        const lobbyCode = generateLobbyCode();

        // ****** AGGIORNATO CON L'URL DEL TUO SERVER RENDER ******
        fetch('https://cordova-ie4q.onrender.com/crea-lobby', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ codice: lobbyCode, player: player })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                appState.currentLobbyCode = lobbyCode;
                DOM.lobbyCodeInput.value = lobbyCode;
                socket.emit("join-lobby", { codice: lobbyCode, player: player });

                // APRIAMO SOLO IL MODALE DI CREAZIONE
                toggleModal(DOM.createLobbyModal, true);
            } else {
                alert("Errore dal server: " + data.error);
                resetLobbyState();
            }
        })
        .catch(err => {
            console.error("Errore fetch 'crea-lobby':", err);
            alert("Errore di rete. Impossibile creare la lobby.");
        });
    });

    DOM.joinLobbyBtn.addEventListener('click', () => toggleModal(DOM.joinLobbyModal, true));
    DOM.settingsBtn.addEventListener('click', () => toggleModal(DOM.settingsModal, true));
    DOM.rulesBtn.addEventListener('click', () => {
        // Ora rulesTab è un modale completo, quindi usa toggleModal
        toggleModal(DOM.rulesTab, true);
    });

    // Gestione Chiusura Modali (un solo handler per tutti)
    DOM.closeButtons.forEach(button => {
        button.addEventListener('click', (event) => {
            const modalToClose = event.target.closest('.modal');
            
            // Logica speciale per quando il proprietario chiude il modale di creazione
            if (modalToClose.id === 'create-lobby-modal' && appState.isOwner) {
                // ****** AGGIORNATO CON L'URL DEL TUO SERVER RENDER ******
                fetch('https://cordova-ie4q.onrender.com/chiudi-lobby', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ codice: appState.currentLobbyCode })
                }).finally(resetLobbyState); // Resetta lo stato in ogni caso
            } 
            // Logica speciale per quando un giocatore chiude il modale della lobby
            else if (modalToClose.id === 'players-modal' && !appState.isOwner) {
                // ****** AGGIORNATO CON L'URL DEL TUO SERVER RENDER ******
                fetch('https://cordova-ie4q.onrender.com/lascia-lobby', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ codice: appState.currentLobbyCode, player: appState.currentPlayerName })
                }).finally(resetLobbyState); // Resetta lo stato in ogni caso
            }
            else {
                toggleModal(modalToClose, false);
            }
        });
    });


    // Unisciti a Lobby
    DOM.joinLobbySubmit.addEventListener('click', () => {
        const lobbyCode = DOM.joinLobbyCodeInput.value.trim().toUpperCase();
        if (!lobbyCode) return alert("Inserisci un codice valido.");
        
        const player = prompt("Inserisci il tuo nome:");
        if (!player || player.trim() === '') return alert("Il nome non può essere vuoto.");

        appState.currentPlayerName = player;
        appState.isOwner = false;

        // ****** AGGIORNATO CON L'URL DEL TUO SERVER RENDER ******
        fetch('https://cordova-ie4q.onrender.com/unisciti-lobby', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ codice: lobbyCode, player })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                appState.currentLobbyCode = lobbyCode;
                socket.emit("join-lobby", { codice: lobbyCode, player });
                toggleModal(DOM.joinLobbyModal, false); // Chiudi modale di inserimento
                
                // Per chi si unisce, è corretto aprire il modale dei giocatori
                toggleModal(DOM.playersModal, true);
            } else {
                alert("⚠️ " + data.error);
            }
        })
        .catch(err => console.error("Errore fetch 'unisciti-lobby':", err));
    });

    // Altri pulsanti
    DOM.copyLobbyBtn.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(DOM.lobbyCodeInput.value);
            alert("Codice copiato!");
        } catch (err) {
            alert("Impossibile copiare il codice.");
        }
    });

    DOM.startGameBtn.addEventListener('click', () => {
        if (!appState.isOwner || !appState.currentSocketId) return;

        // ****** AGGIORNATO CON L'URL DEL TUO SERVER RENDER ******
        fetch('https://cordova-ie4q.onrender.com/avvia-partita', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Socket-ID': appState.currentSocketId
            },
            body: JSON.stringify({ codice: appState.currentLobbyCode })
        })
        .then(res => res.json())
        .then(data => {
            if (!data.success) {
                alert("Errore avvio partita: " + data.error);
            }
        });
    });

    // Gestione Tema Scuro
    DOM.themeToggle.addEventListener('change', () => {
        document.body.classList.toggle('dark-theme', DOM.themeToggle.checked);
        localStorage.setItem('dark-theme', DOM.themeToggle.checked);
    });

    // --- Gestione Eventi Socket.IO ---

    socket.on('connect', () => {
        appState.currentSocketId = socket.id;
        console.log(`[SOCKET.IO] Connesso con ID: ${appState.currentSocketId}`);
    });

    socket.on('disconnect', () => {
        appState.currentSocketId = null;
        console.log('[SOCKET.IO] Disconnesso.');
    });

    // =========================================================================
    // CORREZIONE: Handler `update-players` Semplificato (già corretto, ma ri-spiego)
    // Questa funzione ora si occupa SOLO di aggiornare la grafica, non apre più nessun modale.
    // =========================================================================
    socket.on("update-players", (players) => {
        console.log("[SOCKET] Giocatori aggiornati:", players);
        updatePlayerDisplay(players);
    });

    socket.on('lobby-closed', () => {
        alert("La lobby è stata chiusa.");
        resetLobbyState();
    });

    socket.on('game-started', (lobbyCode) => {
        console.log(`Partita avviata per la lobby ${lobbyCode}! Reindirizzamento in corso...`);
        
        // Costruiamo l'URL per la nuova pagina di gioco.
        // Includiamo il codice della lobby e il nome del giocatore corrente nei parametri dell'URL.
        // Queste informazioni saranno essenziali nella nuova pagina per sapere "chi siamo".
        const gameUrl = `gioco.html?code=${lobbyCode}&player=${encodeURIComponent(appState.currentPlayerName)}`;
        
        // Reindirizziamo l'utente alla pagina del gioco.
        window.location.href = gameUrl;
    });

    // Caricamento iniziale - Logica per applicare il tema scuro da localStorage e loggare l'apertura
    if (localStorage.getItem('dark-theme') === 'true') {
        document.body.classList.add('dark-theme');
        DOM.themeToggle.checked = true;
    }
    // ****** AGGIORNATO CON L'URL DEL TUO SERVER RENDER ******
    fetch('https://cordova-ie4q.onrender.com/log/apertura-gioco', { method: 'POST' });
}

// =========================================================================
// Modifica Cruciale: Sostituito 'deviceready' con 'DOMContentLoaded'
// Il gioco ora si avvia quando il DOM è completamente caricato nel browser web.
// =========================================================================
document.addEventListener('DOMContentLoaded', initializeApp); // rimosso il 'false'
