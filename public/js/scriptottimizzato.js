// --- Riferimenti agli elementi del DOM ---
const DOM = {
    settingsModal: document.getElementById('settings-modal'),
    createLobbyModal: document.getElementById('create-lobby-modal'),
    joinLobbyModal: document.getElementById('join-lobby-modal'),
    playersModal: document.getElementById('players-modal'),
    rulesTab: document.getElementById('rules-tab'), 

    settingsBtn: document.getElementById('settings-btn'),
    createLobbyBtn: document.getElementById('create-lobby-btn'),
    joinLobbyBtn: document.getElementById('join-lobby-btn'),
    rulesBtn: document.getElementById('rules-btn'),

    closeButtons: document.querySelectorAll('.close-btn'), 

    lobbyCodeInput: document.getElementById('lobby-code'),
    copyLobbyBtn: document.getElementById('copy-lobby-code'),
    startGameBtn: document.getElementById('start-game-btn'),
    joinLobbyCodeInput: document.getElementById('join-lobby-code'),
    joinLobbySubmit: document.getElementById('join-lobby-submit'),
    
    playersListContainer: document.getElementById('players-list'),
    playerSpots: document.querySelectorAll('.player-spot p'),

    themeToggle: document.getElementById('theme-toggle'),

    // NUOVI RIFERIMENTI PER IL MODALE NOME GIOCATORE
    playerNameModal: document.getElementById('player-name-modal'),
    playerNameModalTitle: document.getElementById('player-name-modal-title'),
    playerNameInput: document.getElementById('player-name-input'),
    playerNameConfirmBtn: document.getElementById('player-name-confirm-btn'),
    playerNameCancelBtn: document.getElementById('player-name-cancel-btn'),
};

// --- Connessione Socket.IO ---
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

// =========================================================================
// NUOVA FUNZIONE: Mostra un modale per inserire il nome del giocatore
// Restituisce una Promise che si risolve con il nome o si rifiuta se annullato.
// =========================================================================
function getPlayerName(title = "Inserisci il tuo nome") {
    return new Promise((resolve, reject) => {
        DOM.playerNameModalTitle.textContent = title;
        DOM.playerNameInput.value = ''; // Pulisci l'input
        toggleModal(DOM.playerNameModal, true); // Mostra il modale

        // Gestori eventi per i pulsanti del modale
        const confirmHandler = () => {
            const name = DOM.playerNameInput.value.trim();
            if (name === '') {
                alert("Il nome non può essere vuoto.");
                return;
            }
            toggleModal(DOM.playerNameModal, false);
            removeListeners(); // Rimuovi i listener per evitare doppie chiamate
            resolve(name); // Risolvi la Promise con il nome
        };

        const cancelHandler = () => {
            toggleModal(DOM.playerNameModal, false);
            removeListeners(); // Rimuovi i listener
            reject('Cancellato'); // Rifiuta la Promise
        };

        const closeBtnHandler = () => {
            toggleModal(DOM.playerNameModal, false);
            removeListeners();
            reject('Chiuso'); // Rifiuta la Promise anche con il pulsante chiudi
        };

        // Aggiungi i listener
        DOM.playerNameConfirmBtn.addEventListener('click', confirmHandler);
        DOM.playerNameCancelBtn.addEventListener('click', cancelHandler);
        // Usa il close button specifico del modale nome giocatore per evitare conflitti con DOM.closeButtons
        DOM.playerNameModal.querySelector('#close-player-name-modal').addEventListener('click', closeBtnHandler);

        // Funzione per rimuovere i listener una volta che la Promise è risolta/rifiutata
        const removeListeners = () => {
            DOM.playerNameConfirmBtn.removeEventListener('click', confirmHandler);
            DOM.playerNameCancelBtn.removeEventListener('click', cancelHandler);
            DOM.playerNameModal.querySelector('#close-player-name-modal').removeEventListener('click', closeBtnHandler);
        };

        // Permetti anche la conferma con Invio nell'input
        const inputKeyHandler = (event) => {
            if (event.key === 'Enter') {
                confirmHandler();
            }
        };
        DOM.playerNameInput.addEventListener('keydown', inputKeyHandler);
        DOM.playerNameModal.addEventListener('transitionend', function focusInput() {
            if (DOM.playerNameModal.classList.contains('is-active')) {
                DOM.playerNameInput.focus(); // Metti il focus sull'input quando il modale è visibile
            }
            DOM.playerNameModal.removeEventListener('transitionend', focusInput);
        }, { once: true });
    });
}


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
    
    // NOTA: Il tuo server richiede esattamente 4 giocatori per avviare la partita.
    // Ho corretto la condizione a `players.length === 4` per essere coerente con il backend.
    const canStart = appState.isOwner && players.length === 4; 
    DOM.startGameBtn.disabled = !canStart;
    DOM.startGameBtn.classList.toggle('enabled', canStart);
}

function resetLobbyState() {
    document.querySelectorAll('.modal.is-active').forEach(modal => toggleModal(modal, false));

    appState.currentLobbyCode = null;
    appState.currentPlayerName = null;
    appState.isOwner = false;

    updatePlayerDisplay([]); 
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
// =========================================================================
function initializeApp() {
    socket = io("https://cordova-ie4q.onrender.com/");

    // --- Event Listeners UI ---

    // Menu Principale - MODIFICATO per usare getPlayerName()
    DOM.createLobbyBtn.addEventListener('click', async () => {
        try {
            const player = await getPlayerName("Inserisci il tuo nome (Proprietario)");
            appState.currentPlayerName = player;
            appState.isOwner = true;
            const lobbyCode = generateLobbyCode();

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
        } catch (error) {
            console.log("Creazione Lobby annullata:", error);
            // Non fare nulla se l'utente annulla il nome
        }
    });

    DOM.joinLobbyBtn.addEventListener('click', () => toggleModal(DOM.joinLobbyModal, true));
    DOM.settingsBtn.addEventListener('click', () => toggleModal(DOM.settingsModal, true));
    DOM.rulesBtn.addEventListener('click', () => {
        toggleModal(DOM.rulesTab, true);
    });

    // Gestione Chiusura Modali (un solo handler per tutti i pulsanti .close-btn tranne quello del nome)
    DOM.closeButtons.forEach(button => {
        // Ignora il pulsante di chiusura del modale nome giocatore, che ha un handler specifico
        if (button.id === 'close-player-name-modal') return; 

        button.addEventListener('click', (event) => {
            const modalToClose = event.target.closest('.modal');
            
            if (modalToClose.id === 'create-lobby-modal' && appState.isOwner) {
                fetch('https://cordova-ie4q.onrender.com/chiudi-lobby', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ codice: appState.currentLobbyCode })
                }).finally(resetLobbyState); 
            } 
            else if (modalToClose.id === 'players-modal' && !appState.isOwner) {
                fetch('https://cordova-ie4q.onrender.com/lascia-lobby', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ codice: appState.currentLobbyCode, player: appState.currentPlayerName })
                }).finally(resetLobbyState); 
            }
            else {
                toggleModal(modalToClose, false);
            }
        });
    });


    // Unisciti a Lobby - MODIFICATO per usare getPlayerName()
    DOM.joinLobbySubmit.addEventListener('click', async () => {
        const lobbyCode = DOM.joinLobbyCodeInput.value.trim().toUpperCase();
        if (!lobbyCode) { alert("Inserisci un codice valido."); return; }
        
        try {
            const player = await getPlayerName("Inserisci il tuo nome");
            appState.currentPlayerName = player;
            appState.isOwner = false;

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
                    toggleModal(DOM.joinLobbyModal, false); 
                    
                    toggleModal(DOM.playersModal, true);
                } else {
                    alert("⚠️ " + data.error);
                }
            })
            .catch(err => console.error("Errore fetch 'unisciti-lobby':", err));
        } catch (error) {
            console.log("Unione Lobby annullata:", error);
            // Non fare nulla se l'utente annulla il nome
        }
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
        
        const gameUrl = `gioco.html?code=${lobbyCode}&player=${encodeURIComponent(appState.currentPlayerName)}`;
        
        window.location.href = gameUrl;
    });

    // Caricamento iniziale - Logica per applicare il tema scuro da localStorage e loggare l'apertura
    if (localStorage.getItem('dark-theme') === 'true') {
        document.body.classList.add('dark-theme');
        DOM.themeToggle.checked = true;
    }
    fetch('https://cordova-ie4q.onrender.com/log/apertura-gioco', { method: 'POST' });
}

// =========================================================================
// Il gioco si avvia quando il DOM è completamente caricato nel browser web.
// =========================================================================
document.addEventListener('DOMContentLoaded', initializeApp);
