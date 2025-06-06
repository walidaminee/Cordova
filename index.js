console.log("Il server sta partendo... Checkpoint 0: Inizio File");

const express = require('express');
const cors = require('cors');
const app = express();
// Modifica: la porta deve essere dinamica per Render
const port = process.env.PORT || 3000; 
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
console.log("Checkpoint 1: Moduli richiesti caricati");

// --- CONFIGURAZIONE DEI MAZZI ---
const LIAR_DECK_CONFIG = [
    ...Array(6).fill('Re'), ...Array(6).fill('Regina'), ...Array(6).fill('Asso'),
    ...Array(2).fill('Jolly')
];
const TABLE_DECK_CONFIG = ['Re', 'Regina', 'Asso'];
const REVOLVER_DECK_CONFIG = ['Letale', ...Array(5).fill('A Salve')];
console.log("Checkpoint 2: Configurazioni mazzi definite");

// --- Middleware ---
app.use(cors());
app.use(express.json());
console.log("Checkpoint 3: Middleware Express configurati (cors, json)");

// --- Costanti Messaggi ---
const MSG = {
    LOBBY_NOT_FOUND: 'Lobby non trovata',
    LOBBY_FULL: 'Lobby piena',
    PLAYER_ALREADY_IN_LOBBY: 'Questo nome è già usato in questa lobby',
    INVALID_CODE: 'Codice lobby mancante o non valido',
    NOT_LOBBY_OWNER: 'Solo il proprietario della lobby può eseguire questa azione',
    GAME_ALREADY_STARTED: 'La partita è già in corso per questa lobby',
    PLAYER_NOT_FOUND_IN_GAME: 'Giocatore non trovato nella partita'
};
console.log("Checkpoint 4: Costanti MSG definite");

// --- Stato In-Memory ---
let lobbies = {};
let socketToLobbyMap = {};
console.log("Checkpoint 5: Stato in-memory inizializzato");

// --- Funzioni di Gioco ---
function createDeck() { 
    return [...LIAR_DECK_CONFIG];
}

function shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

/**
 * Invia l'aggiornamento dello stato del gioco a tutti i giocatori della lobby.
 * Ogni giocatore riceve uno stato personalizzato (mano visibile solo a se stesso).
 * @param {object} lobby - L'oggetto lobby con il gameState aggiornato.
 */
function sendGameStateUpdate(lobby) {
    if (!lobby || !lobby.gameState || !lobby.gameState.players) { 
        console.error(`[ERROR sendGameStateUpdate] Lobby o gameState non validi. Lobby Code: ${lobby ? (lobby.gameState ? lobby.gameState.lobbyCode : 'N/A') : 'N/A'}`);
        return; 
    }
    const { gameState } = lobby;
    gameState.players.forEach(p_loop => {
        if (p_loop.socketId) {
            const personalizedState = {
                players: gameState.players.map(pl => ({
                    name: pl.name, 
                    cardCount: pl.hand ? pl.hand.length : 0, 
                    revolverCardCount: pl.revolverDeck ? pl.revolverDeck.length : 0,
                    isEliminated: pl.isEliminated, 
                    isTurn: pl.isTurn
                })),
                myHand: p_loop.isEliminated ? [] : (p_loop.hand || []), 
                tableType: gameState.tableType,
                discardPile: gameState.discardPile || [],
                isMyTurn: p_loop.isTurn,
                roundNumber: gameState.roundNumber,
                lastPlay: gameState.lastPlay, 
                challenge: gameState.challenge,
                rouletteOutcome: gameState.rouletteOutcome 
            };
            io.to(p_loop.socketId).emit('game-state-update', personalizedState);
        } else {
            console.warn(`[WARN] Socket ID mancante per ${p_loop.name} in lobby ${gameState.lobbyCode}. Impossibile inviare aggiornamento.`);
        }
    });
}

/**
 * Avvia un nuovo round del gioco, distribuendo carte e impostando il tipo di tavolo.
 * @param {object} lobby - L'oggetto lobby.
 */
function startNewRound(lobby) {
    console.log("[DEBUG startNewRound] Inizio funzione startNewRound");
    if (!lobby || !lobby.gameState) { 
        const lobbyCodeForError = lobby ? (lobby.gameState ? lobby.gameState.lobbyCode : 'LOBBY_CODE_NON_TROVATO_IN_GAMESTATE') : 'LOBBY_NON_ESISTENTE';
        console.error(`[ERROR] Tentativo di startNewRound su lobby non valida o senza gameState: ${lobbyCodeForError}`);
        return; 
    }

    lobby.gameState.roundNumber = (lobby.gameState.roundNumber || 0) + 1;
    const lobbyCodeForLog = lobby.gameState.lobbyCode || Object.keys(lobbies).find(key => lobbies[key] === lobby) || 'CODICE_LOBBY_SCONOSCIUTO';
    console.log(`[GAME] Inizio Round ${lobby.gameState.roundNumber} per la lobby ${lobbyCodeForLog}`);

    let newTableDeck = shuffleDeck([...TABLE_DECK_CONFIG]);
    lobby.gameState.tableType = newTableDeck.pop();
    console.log(`[GAME] Tipo del Tavolo per il round ${lobby.gameState.roundNumber} in ${lobbyCodeForLog}: ${lobby.gameState.tableType}`);

    lobby.gameState.liarDeck = shuffleDeck(createDeck());
    lobby.gameState.discardPile = [];
    lobby.gameState.lastPlay = null;
    lobby.gameState.challenge = null;
    lobby.gameState.rouletteOutcome = null;

    lobby.gameState.players.forEach(player => {
        player.hand = [];
        if (!player.isEliminated) {
            for (let i = 0; i < 5; i++) {
                if (lobby.gameState.liarDeck.length > 0) {
                    player.hand.push(lobby.gameState.liarDeck.pop());
                } else {
                    console.warn(`[WARN] Mazzo delle bugie esaurito durante la distribuzione delle carte.`);
                    break;
                }
            }
        }
    });

    let initialTurnIndex = lobby.gameState.turnIndex !== undefined ? lobby.gameState.turnIndex : 0; 
    let safetyBreak = 0; 
    const totalPlayers = lobby.gameState.players.length;
    while (safetyBreak < totalPlayers && 
           (totalPlayers === 0 || lobby.gameState.players[initialTurnIndex % totalPlayers].isEliminated)) {
        initialTurnIndex = (initialTurnIndex + 1) % totalPlayers;
        safetyBreak++;
    }

    const activePlayersCount = lobby.gameState.players.filter(p => !p.isEliminated).length;

    if (activePlayersCount === 0) {
        console.log(`[GAME] Tutti i giocatori sono eliminati o assenti in ${lobbyCodeForLog} (startNewRound). Impossibile iniziare il turno.`);
        io.to(lobbyCodeForLog).emit('game-over', { winner: null, reason: 'Tutti i giocatori eliminati o assenti.' });
        if(lobbies[lobbyCodeForLog]) delete lobbies[lobbyCodeForLog];
        return; 
    }
    
    if (safetyBreak >= totalPlayers) {
        console.error(`[ERROR] Impossibile trovare un giocatore attivo per iniziare il round in ${lobbyCodeForLog}.`);
        io.to(lobbyCodeForLog).emit('game-over', { winner: null, reason: 'Errore interno: impossibile determinare il prossimo turno.' });
        if(lobbies[lobbyCodeForLog]) delete lobbies[lobbyCodeForLog];
        return;
    }

    lobby.gameState.turnIndex = initialTurnIndex % totalPlayers;

    lobby.gameState.players.forEach((player, index) => {
        player.isTurn = (index === lobby.gameState.turnIndex);
    });
    
    if (lobby.gameState.players[lobby.gameState.turnIndex]) {
        console.log(`[GAME] È il turno di: ${lobby.gameState.players[lobby.gameState.turnIndex].name} in ${lobbyCodeForLog}`);
    } else {
        console.error(`[ERROR] Impossibile determinare il giocatore di turno in ${lobbyCodeForLog} (startNewRound). Indice: ${lobby.gameState.turnIndex}. Giocatori: ${lobby.gameState.players.length}`);
        io.to(lobbyCodeForLog).emit('game-over', { winner: null, reason: 'Errore interno determinazione turno.' });
        if(lobbies[lobbyCodeForLog]) delete lobbies[lobbyCodeForLog];
        return;
    }
    
    sendGameStateUpdate(lobby);
    console.log("[DEBUG startNewRound] Fine funzione startNewRound");
}
console.log("Checkpoint 6: Funzioni di gioco definite");

// --- API REST ---
app.post('/log/apertura-gioco', (req, res) => {
    console.log(`[DEBUG] Un utente ha aperto il gioco alle ${new Date().toLocaleString()}`);
    res.sendStatus(200);
});

app.post('/crea-lobby', (req, res) => {
    try {
        const { codice, player } = req.body;
        if (!codice || typeof codice !== 'string' || codice.length !== 6) return res.status(400).json({ success: false, error: MSG.INVALID_CODE });
        if (!player || typeof player !== 'string' || player.trim() === '') return res.status(400).json({ success: false, error: 'Nome giocatore mancante o non valido' });
        if (lobbies[codice]) return res.status(409).json({ success: false, error: 'Codice lobby già esistente' });
        
        lobbies[codice] = {
            ownerSocketId: null,
            players: [player], 
            status: 'waiting',
            playerSockets: {}
        };
        console.log(`[LOBBY] Lobby creata: ${codice} da ${player}`);
        res.status(201).json({ success: true, players: lobbies[codice].players });
    } catch (error) { console.error(`[ERROR] Errore in /crea-lobby:`, error.stack); res.status(500).json({ success: false, error: 'Errore interno del server' }); }
});

app.post('/chiudi-lobby', (req, res) => {
    try {
        const { codice } = req.body;
        const lobby = lobbies[codice];
        if (lobby) {
            console.log(`[LOBBY] Chiusura forzata lobby ${codice}.`);
            io.to(codice).emit('lobby-closed');
            delete lobbies[codice];
            io.socketsLeave(codice);
            res.json({ success: true });
        } else { res.status(404).json({ success: false, error: MSG.LOBBY_NOT_FOUND }); }
    } catch (error) { console.error(`[ERROR] Errore in /chiudi-lobby:`, error.stack); res.status(500).json({ success: false, error: 'Errore interno del server' }); }
});

app.post('/unisciti-lobby', (req, res) => {
    try {
        const { codice, player } = req.body;
        if (!codice || typeof codice !== 'string' || codice.length !== 6) return res.status(400).json({ success: false, error: MSG.INVALID_CODE });
        if (!player || typeof player !== 'string' || player.trim() === '') return res.status(400).json({ success: false, error: 'Nome giocatore mancante o non valido' });
        
        const lobby = lobbies[codice];
        if (!lobby) return res.status(404).json({ success: false, error: MSG.LOBBY_NOT_FOUND });
        if (lobby.status !== 'waiting') return res.status(400).json({ success: false, error: MSG.GAME_ALREADY_STARTED });
        
        if (!lobby.players) lobby.players = []; 
        if (lobby.players.length >= 4) return res.status(400).json({ success: false, error: MSG.LOBBY_FULL });
        if (lobby.players.includes(player)) return res.status(400).json({ success: false, error: MSG.PLAYER_ALREADY_IN_LOBBY });

        lobby.players.push(player);
        console.log(`[LOBBY] ${player} si è unito alla lobby ${codice}`);
        io.to(codice).emit('update-players', lobby.players); 
        res.json({ success: true, players: lobby.players });
    } catch (error) { console.error(`[ERROR] Errore in /unisciti-lobby:`, error.stack); res.status(500).json({ success: false, error: 'Errore interno del server' }); }
});

app.post('/lascia-lobby', (req, res) => {
     try {
        const { codice, player } = req.body;
        const lobby = lobbies[codice];
        if (!lobby || !lobby.players) return res.status(404).json({ success: false, error: MSG.LOBBY_NOT_FOUND });

        const initialPlayerCount = lobby.players.length;
        lobby.players = lobby.players.filter(p => p !== player); 

        if (lobby.players.length < initialPlayerCount) { 
            console.log(`[LOBBY] ${player} ha lasciato la lobby ${codice} tramite API.`);
            
            if (lobby.playerSockets && lobby.playerSockets[player]) {
                const disconnectedSocketId = lobby.playerSockets[player];
                delete lobby.playerSockets[player];
                delete socketToLobbyMap[disconnectedSocketId];
                io.sockets.sockets.get(disconnectedSocketId)?.leave(codice); 
            }

            if (lobby.players.length === 0) {
                console.log(`[LOBBY] Lobby ${codice} chiusa perché vuota dopo abbandono API.`);
                io.to(codice).emit('lobby-closed'); 
                delete lobbies[codice];
            } else { 
                if (lobby.ownerSocketId === null || !Object.values(lobby.playerSockets).includes(lobby.ownerSocketId)) {
                    if (lobby.players.length > 0) {
                        const newOwnerName = lobby.players[0];
                        lobby.ownerSocketId = lobby.playerSockets[newOwnerName] || null;
                        console.log(`[LOBBY] Nuovo proprietario per ${codice}: ${newOwnerName} (${lobby.ownerSocketId}).`);
                    }
                }
                io.to(codice).emit('update-players', lobby.players);
            }
            res.json({ success: true });
        } else { res.status(404).json({ success: false, error: 'Giocatore non trovato nella lobby' }); }
    } catch (error) { console.error(`[ERROR] Errore in /lascia-lobby:`, error.stack); res.status(500).json({ success: false, error: 'Errore interno del server' }); }
});

app.post('/avvia-partita', (req, res) => {
    try {
        const { codice } = req.body;
        const ownerSocketId = req.headers['x-socket-id']; 
        const lobby = lobbies[codice];

        if (!lobby) return res.status(404).json({ success: false, error: MSG.LOBBY_NOT_FOUND });
        if (lobby.ownerSocketId !== ownerSocketId) return res.status(403).json({ success: false, error: MSG.NOT_LOBBY_OWNER });
        if (!lobby.players || lobby.players.length !== 4) return res.status(400).json({ success: false, error: 'Sono necessari esattamente 4 giocatori per avviare la partita.' });
        if (lobby.status === 'in-game') return res.status(400).json({ success: false, error: MSG.GAME_ALREADY_STARTED });

        lobby.status = 'in-game'; 
        lobby.gameState = {
            lobbyCode: codice,
            players: lobby.players.map(name => ({
                name: name, 
                socketId: lobby.playerSockets[name] || null, 
                hand: [], 
                revolverDeck: shuffleDeck([...REVOLVER_DECK_CONFIG]), 
                isEliminated: false, 
                isTurn: false
            })),
            liarDeck: [], 
            tableDeck: [...TABLE_DECK_CONFIG], 
            tableType: null, 
            discardPile: [], 
            turnIndex: 0, 
            readyPlayers: [], 
            roundNumber: 0,
            lastPlay: null, 
            challenge: null,
            rouletteOutcome: null 
        };
        
        console.log(`[GAME] Partita a 4 giocatori impostata per la lobby ${codice}. In attesa che i giocatori siano pronti.`);
        io.to(codice).emit('game-started', codice); 
        res.json({ success: true });
    } catch (error) { console.error(`[ERROR] Errore in /avvia-partita:`, error.stack); res.status(500).json({ success: false, error: 'Errore interno del server' }); }
});

app.get('/giocatori/:codice', (req, res) => {
    try {
        const lobby = lobbies[req.params.codice];
        if (lobby && lobby.players) { res.json({ success: true, players: lobby.players }); }
        else { res.status(404).json({ success: false, error: MSG.LOBBY_NOT_FOUND }); }
    } catch (error) { console.error(`[ERROR] Errore in /giocatori/:codice :`, error.stack); res.status(500).json({ success: false, error: 'Errore interno del server' }); }
});

app.get('/debug/stato-lobby', (req, res) => { res.json(lobbies); });
console.log("Checkpoint 7: Rotte API definite");

// --- Servizio File Statici ---
// Questa riga dovrebbe essere prima di app.get('/')
app.use(express.static(path.join(__dirname, 'public'))); 
console.log("Checkpoint 8: Servizio file statici configurato (app.use(express.static))");

// Rotta per la root del sito che serve index.html
// Questa dovrebbe venire dopo express.static per non intercettare le richieste di file statici
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
console.log("Checkpoint 8.1: Rotta per '/' definita");


// --- Logica Socket.IO ---
const serverHttp = http.createServer(app);
console.log("Checkpoint 9: Server HTTP creato");

const io = new Server(serverHttp, { 
    cors: { 
        origin: "*", 
        methods: ["GET", "POST"]
    } 
});
console.log("Checkpoint 10: Server Socket.IO creato");

io.on('connection', (socket) => {
    console.log(`[SOCKET.IO] Client connesso: ${socket.id} - Checkpoint 10.1: Dentro io.on('connection')`);

    socket.on('join-lobby', ({ codice, player }) => {
        try {
            const lobby = lobbies[codice];
            if (!lobby) { 
                console.warn(`[WARN] Tentativo di join a lobby ${codice} (da ${player}) non esistente.`); 
                socket.emit('error-message', 'Lobby non trovata o chiusa.'); 
                return; 
            }
            if (!lobby.players.includes(player)) { 
                socket.emit('error-message', 'Il tuo nome non è registrato per questa lobby. Riprova dalla pagina principale.');
                console.warn(`[WARN] ${player} ha tentato di connettersi via socket alla lobby ${codice} ma non è nella lista dei giocatori.`);
                return;
            }
            socket.join(codice); 
            lobby.playerSockets[player] = socket.id; 
            socketToLobbyMap[socket.id] = { lobbyCode: codice, playerName: player }; 
            
            if (lobby.ownerSocketId === null || !Object.values(lobby.playerSockets).includes(lobby.ownerSocketId)) {
                if (lobby.players && lobby.players[0] === player) {
                    lobby.ownerSocketId = socket.id; 
                    console.log(`[LOBBY] Proprietario ${player} (${socket.id}) registrato per lobby ${codice}.`); 
                }
            }
            
            console.log(`[LOBBY] ${player} (${socket.id}) si è unito alla stanza Socket.IO ${codice}. Benvenuto!`);
            io.to(codice).emit('update-players', lobby.players); 
        } catch (error) { console.error(`[ERROR] in 'join-lobby':`, error.stack); }
    });

    socket.on('player-ready-in-game', ({ lobbyCode, playerName }) => {
        try {
            const lobby = lobbies[lobbyCode];
            if (!lobby || !lobby.gameState || !lobby.gameState.players) { 
                console.warn(`[WARN] 'player-ready-in-game' per lobby ${lobbyCode} (player: ${playerName}) non valida o gameState non inizializzato.`); 
                socket.emit('error-message', `Lobby ${lobbyCode} non trovata o partita non ancora pronta.`); return; 
            }
            const playerInGame = lobby.gameState.players.find(p => p.name === playerName);
            if (playerInGame) { 
                playerInGame.socketId = socket.id;
                console.log(`[GAME] Socket ID aggiornato per ${playerName} (${socket.id}) in lobby ${lobbyCode}`); 
            } else { 
                console.error(`[ERRORE] Giocatore ${playerName} non trovato nel gameState della lobby ${lobbyCode} (player-ready).`); 
                socket.emit('error-message', MSG.PLAYER_NOT_FOUND_IN_GAME);
                return; 
            }
            if (!lobby.gameState.readyPlayers.includes(playerName)) { 
                lobby.gameState.readyPlayers.push(playerName); 
            }
            
            console.log(`[GAME] Giocatori pronti per ${lobbyCode}: ${lobby.gameState.readyPlayers.join(', ')} (${lobby.gameState.readyPlayers.length}/${lobby.gameState.players.length})`);

            if (lobby.gameState.readyPlayers.length === lobby.gameState.players.length && lobby.gameState.players.length > 0) {
                console.log(`[GAME] Condizione soddisfatta per avviare il round in ${lobbyCode}. Chiamo startNewRound.`);
                startNewRound(lobby);
            } else {
                console.log(`[GAME] Condizione NON soddisfatta per avviare il round in ${lobbyCode}. Pronti: ${lobby.gameState.readyPlayers.length}, Necessari: ${lobby.gameState.players.length}`);
            }
        } catch (error) { console.error(`[ERROR] in 'player-ready-in-game':`, error.stack); }
    });

    socket.on('play-cards', ({ lobbyCode, cards }) => { 
        try {
            const lobby = lobbies[lobbyCode];
            if (!lobby || !lobby.gameState) { console.warn(`[WARN] 'play-cards' per lobby/gameState non valido: ${lobbyCode}`); return; }
            const { gameState } = lobby;
            const currentPlayerTurnIndex = gameState.turnIndex;

            if (currentPlayerTurnIndex === undefined || !gameState.players || !gameState.players[currentPlayerTurnIndex]) { 
                console.error(`[ERROR] Turno non valido o giocatore non definito in 'play-cards' per lobby ${lobbyCode}`); 
                return; 
            }
            
            const player = gameState.players[currentPlayerTurnIndex];
            if (player.socketId !== socket.id || !player.isTurn) { 
                console.log(`[GAME] Mossa non valida da socket ${socket.id}. Giocatore di turno ${player.name}(${player.socketId}). Turno ${player.isTurn}.`); 
                return; 
            }

            if (!Array.isArray(cards) || cards.length === 0) {
                console.log(`[GAME] Mossa non valida: nessuna carta fornita.`);
                return;
            }

            const playerHandCopy = [...player.hand];
            for (const cardToPlay of cards) {
                const index = playerHandCopy.indexOf(cardToPlay);
                if (index === -1) {
                    console.log(`[GAME] Mossa non valida: ${player.name} non ha la carta ${cardToPlay} tra quelle selezionate. Mano: ${player.hand}`); 
                    socket.emit('error-message', `Non hai la carta ${cardToPlay} nella tua mano.`);
                    return; 
                }
                playerHandCopy.splice(index, 1);
            }
            
            player.hand = playerHandCopy;
            
            const implicitDeclaredValue = gameState.tableType; 

            console.log(`[GAME] ${player.name} ha giocato [${cards.join(', ')}] (dichiarato come ${implicitDeclaredValue}) dalla lobby ${lobbyCode}`);
            if(!gameState.discardPile) gameState.discardPile = [];
            gameState.discardPile.push(...cards);

            gameState.lastPlay = { playedBy: player.name, actualCards: cards, declaredValue: implicitDeclaredValue };
            
            if (player.hand.length === 0) { 
                console.log(`[GAME] Giocatore ${player.name} ha vinto il round in ${lobbyCode}!`); 
                io.to(lobbyCode).emit('round-over', { winner: player.name, message: `${player.name} ha finito le carte!` }); 
                
                gameState.players.forEach((p,idx) => p.isTurn = false);
                gameState.turnIndex = currentPlayerTurnIndex;
                gameState.players[gameState.turnIndex].isTurn = true;

                setTimeout(() => startNewRound(lobby), 4000); 
                return; 
            }
            
            gameState.players[currentPlayerTurnIndex].isTurn = false;
            let nextTurnIndex = (currentPlayerTurnIndex + 1) % gameState.players.length;
            let safetyBreak = 0;
            const totalPlayers = gameState.players.length;
            while(safetyBreak < totalPlayers && gameState.players[nextTurnIndex].isEliminated){ 
                nextTurnIndex = (nextTurnIndex + 1) % totalPlayers; 
                safetyBreak++; 
            }

            if (safetyBreak >= totalPlayers || totalPlayers === 0) { 
                console.log(`[GAME] Tutti i giocatori sono eliminati in ${lobbyCode}. Fine partita.`); 
                io.to(lobbyCode).emit('game-over', { winner: null, reason: 'Tutti i giocatori eliminati.' }); 
                delete lobbies[lobbyCode]; 
                return; 
            }
            
            gameState.turnIndex = nextTurnIndex;
            gameState.players[gameState.turnIndex].isTurn = true;
            console.log(`[GAME] Turno passato a ${gameState.players[gameState.turnIndex].name} in ${lobbyCode}`);

            sendGameStateUpdate(lobby); 
        } catch (error) { 
            console.error(`[ERROR] Errore catastrofico in 'play-cards' per lobby ${lobbyCode}:`, error.stack); 
            if(lobbyCode) io.to(lobbyCode).emit('error-message', 'Errore interno del server durante la giocata.'); 
        }
    });

    socket.on('call-liar', ({ lobbyCode }) => {
        try {
            const lobby = lobbies[lobbyCode];
            if (!lobby || !lobby.gameState) { console.warn(`[WARN] 'call-liar' ricevuto per lobby/gameState non valido: ${lobbyCode}`); return; }
            const { gameState } = lobby;

            const callingPlayer = gameState.players.find(p => p.socketId === socket.id);

            if (!callingPlayer || !callingPlayer.isTurn) { 
                console.log(`[GAME] ${callingPlayer ? callingPlayer.name : 'Socket sconosciuto'} (${socket.id}) ha provato a chiamare BUGIA! fuori turno o non valido.`); 
                return; 
            }
            if (!gameState.lastPlay || !gameState.lastPlay.actualCards || gameState.lastPlay.actualCards.length === 0) { 
                console.log(`[GAME] ${callingPlayer.name} ha chiamato BUGIA! ma non c'è una giocata precedente valida.`); 
                return; 
            }
            if (gameState.lastPlay.playedBy === callingPlayer.name) { 
                console.log(`[GAME] ${callingPlayer.name} ha provato a chiamare BUGIA! su se stesso.`); 
                return; 
            }
            
            io.to(lobbyCode).emit('play-liar-sounds'); 

            console.log(`[GAME] ${callingPlayer.name} chiama BUGIA! sulla giocata di ${gameState.lastPlay.playedBy} che ha dichiarato ${gameState.lastPlay.declaredValue} (tipo tavolo: ${gameState.tableType}) in lobby ${lobbyCode}`);

            const accusedPlayerName = gameState.lastPlay.playedBy;
            const revealedCards = gameState.lastPlay.actualCards; 
            const declaredValue = gameState.lastPlay.declaredValue; 
            let isLie = false;

            for (const card of revealedCards) {
                if (card !== 'Jolly' && card !== declaredValue) { 
                    isLie = true; 
                    break; 
                } 
            }

            let playerFacingRRName;
            if (isLie) { 
                playerFacingRRName = accusedPlayerName;
                console.log(`[GAME] Accusa CORRETTA! ${accusedPlayerName} era un bugiardo. Carte rivelate: ${revealedCards.join(', ')} (Dichiarato: ${declaredValue})`); 
            } else { 
                playerFacingRRName = callingPlayer.name;
                console.log(`[GAME] Accusa SBAGLIATA! ${accusedPlayerName} era innocente. Carte rivelate: ${revealedCards.join(', ')} (Dichiarato: ${declaredValue})`); 
            }
            
            gameState.challenge = {
                callingPlayer: callingPlayer.name, accusedPlayer: accusedPlayerName,
                revealedCards: revealedCards, isLie: isLie, playerFacingRR: playerFacingRRName
            };
            sendGameStateUpdate(lobby); 
            console.log(`[GAME] Sfida risolta. In attesa della Roulette Russa per: ${playerFacingRRName} in lobby ${lobbyCode}`);
        } catch (error) { 
            console.error(`[ERROR] Errore catastrofico in 'call-liar':`, error.stack); 
            if(lobbyCode) io.to(lobbyCode).emit('error-message', 'Errore interno del server durante la chiamata BUGIA!.'); 
        }
    });
    
    socket.on('play-russian-roulette', ({ lobbyCode }) => {
        try {
            const lobby = lobbies[lobbyCode];
            if (!lobby || !lobby.gameState || !lobby.gameState.challenge) {
                console.warn(`[WARN RR] 'play-russian-roulette' per lobby ${lobbyCode} senza gameState o sfida attiva.`);
                return;
            }
            const { gameState } = lobby;
            
            const playerPlayingRRName = gameState.challenge.playerFacingRR;
            const sendingPlayer = gameState.players.find(p => p.socketId === socket.id);

            if (!sendingPlayer || sendingPlayer.name !== playerPlayingRRName) {
                console.log(`[GAME RR] ${sendingPlayer ? sendingPlayer.name : 'Socket sconosciuto'} (${socket.id}) ha provato a giocare la roulette per ${playerPlayingRRName}, ma non era designato.`);
                return; 
            }

            const playerObject = gameState.players.find(p => p.name === playerPlayingRRName);
            if (!playerObject) {
                console.error(`[ERROR RR] Giocatore ${playerPlayingRRName} non trovato nel gameState per la roulette.`);
                return;
            }
            
            let drawnRevolverCard;
            if (playerObject.isEliminated) {
                console.log(`[GAME RR] Giocatore ${playerPlayingRRName} è già eliminato, non può giocare alla roulette. Saltando.`);
                drawnRevolverCard = 'Già Eliminato'; 
            } else if (!playerObject.revolverDeck || playerObject.revolverDeck.length === 0) {
                console.error(`[ERROR RR] Mazzo revolver vuoto o mancante per ${playerPlayingRRName}. Ricaricamento per prevenire blocco.`);
                playerObject.revolverDeck = shuffleDeck([...REVOLVER_DECK_CONFIG]);
                drawnRevolverCard = playerObject.revolverDeck.pop(); 
                if (drawnRevolverCard === 'Letale') { 
                    playerObject.isEliminated = true;
                    console.log(`[GAME RR] ...ELIMINATO! ${playerPlayingRRName}`);
                } else {
                    console.log(`[GAME RR] ...SALVO! ${playerPlayingRRName}`);
                }
            } else {
                drawnRevolverCard = playerObject.revolverDeck.pop(); 
                console.log(`[GAME RR] ${playerPlayingRRName} gioca alla Roulette Russa in ${lobbyCode}... Carta pescata: ${drawnRevolverCard}`);
                if (drawnRevolverCard === 'Letale') {
                    playerObject.isEliminated = true;
                    console.log(`[GAME RR] ...ELIMINATO! ${playerPlayingRRName}`);
                } else {
                    console.log(`[GAME RR] ...SALVO! ${playerPlayingRRName}`);
                }
            }

            gameState.rouletteOutcome = { player: playerPlayingRRName, card: drawnRevolverCard }; 
            sendGameStateUpdate(lobby);

            setTimeout(() => {
                const activePlayers = gameState.players.filter(p => !p.isEliminated);
                if (activePlayers.length <= 1) {
                    const winner = activePlayers.length === 1 ? activePlayers[0].name : null;
                    console.log(`[GAME OVER] Partita ${lobbyCode} terminata. Vincitore: ${winner || 'Nessuno (o pareggio)'}`);
                    io.to(lobbyCode).emit('game-over', { winner: winner, reason: winner ? 'Ultimo giocatore rimasto!' : 'Nessun vincitore.' });
                    delete lobbies[lobbyCode];
                    return; 
                }

                let playerForNextRoundStart;
                const accusedPlayer = gameState.players.find(p => p.name === gameState.challenge.accusedPlayer);
                const callingPlayer = gameState.players.find(p => p.name === gameState.challenge.callingPlayer);
                const wasLie = gameState.challenge.isLie; 
                
                if (wasLie) {
                    playerForNextRoundStart = accusedPlayer.name;
                    console.log(`[GAME RR] Bugia! confermata. Il prossimo round inizia con: ${playerForNextRoundStart}`);
                } else {
                    playerForNextRoundStart = callingPlayer.name;
                    console.log(`[GAME RR] Bugia! smentita. Il prossimo round inizia con: ${playerForNextRoundStart}`);
                }

                gameState.challenge = null;
                gameState.lastPlay = null;
                gameState.rouletteOutcome = null; 

                let newRoundStartIndex = gameState.players.findIndex(p => p.name === playerForNextRoundStart);
                
                let safetyBreakTurn = 0;
                const totalPlayersRR = gameState.players.length;
                while (safetyBreakTurn < totalPlayersRR && gameState.players[newRoundStartIndex].isEliminated) {
                    newRoundStartIndex = (newRoundStartIndex + 1) % totalPlayersRR;
                    safetyBreakTurn++;
                }

                if (safetyBreakTurn >= totalPlayersRR) {
                    console.warn(`[GAME RR] Impossibile trovare un giocatore attivo per il prossimo round in ${lobbyCode}. Potenziale stato di blocco.`);
                    io.to(lobbyCode).emit('game-over', { winner: null, reason: 'Nessun giocatore attivo rimanente.' });
                    delete lobbies[codice];
                    return;
                }

                gameState.players.forEach((p, idx) => p.isTurn = false); 
                gameState.turnIndex = newRoundStartIndex;
                gameState.players[gameState.turnIndex].isTurn = true;
                
                console.log(`[GAME RR] Dopo roulette, il prossimo round sarà avviato da: ${gameState.players[gameState.turnIndex].name}`);

                startNewRound(lobby); 

            }, 4000);
        } catch (error) { 
            console.error(`[ERROR] Errore catastrofico in 'play-russian-roulette':`, error.stack); 
            if(lobbyCode) io.to(lobbyCode).emit('error-message', 'Errore interno del server durante la Roulette Russa.');
        }
    });

    socket.on('disconnect', () => {
        const disconnectingSocketId = socket.id;
        console.log(`[SOCKET.IO] Client disconnesso: ${disconnectingSocketId}`);
        const socketInfo = socketToLobbyMap[disconnectingSocketId];
    
        if (socketInfo) { 
            const { lobbyCode, playerName } = socketInfo;
            const lobby = lobbies[lobbyCode]; 
    
            delete socketToLobbyMap[disconnectingSocketId]; 
            console.log(`[SOCKET.IO] Rimosso ${playerName} (${disconnectingSocketId}) da socketToLobbyMap.`);
    
            if (!lobby) {
                console.log(`[DISCONNECT] Lobby ${lobbyCode} per ${playerName} (da map) non trovata. Probabilmente già eliminata.`);
                return;
            }
            
            console.log(`[DISCONNECT] Gestione disconnessione per ${playerName} (da map) dalla lobby ${lobbyCode}. Stato: ${lobby.status}`);
            
            if (lobby.status === 'waiting') {
                const initialPlayerCount = lobby.players ? lobby.players.length : 0;
                lobby.players = lobby.players ? lobby.players.filter(p => p !== playerName) : [];
                
                if (lobby.playerSockets && lobby.playerSockets[playerName] === disconnectingSocketId) {
                    delete lobby.playerSockets[playerName];
                }

                if (lobby.ownerSocketId === null || !Object.values(lobby.playerSockets).includes(lobby.ownerSocketId)) {
                    if (lobby.players.length > 0) {
                        const newOwnerName = lobby.players[0];
                        lobby.ownerSocketId = lobby.playerSockets[newOwnerName] || null;
                        console.log(`[LOBBY] Nuovo proprietario per ${lobbyCode}: ${newOwnerName} (${lobby.ownerSocketId}).`);
                    }
                }
                io.to(codice).emit('update-players', lobby.players);
            } else if (lobby.status === 'in-game') {
                const playerInGame = lobby.gameState.players.find(p => p.name === playerName);
                if (playerInGame) {
                    playerInGame.socketId = null; 
                    console.log(`[DISCONNECT-GAME] ${playerName} (socket ${disconnectingSocketId}) disconnesso da ${lobbyCode}. Il giocatore rimane in gioco ma è offline.`);

                    const activePlayersInGame = lobby.gameState.players.filter(p => !p.isEliminated);
                    if (activePlayersInGame.length <= 1) {
                        const winner = activePlayersInGame.length === 1 ? activePlayersInGame[0].name : null;
                        console.log(`[GAME OVER] Partita in ${lobbyCode} terminata, giocatori attivi < 2 dopo disconnessione di ${playerName}. Vincitore: ${winner || 'Nessuno'}`);
                        io.to(lobbyCode).emit('game-over', { winner: winner, reason: `Giocatori insufficienti (disconnessione).`});
                        delete lobbies[codice]; 
                        return; 
                    }

                    if (playerInGame.isTurn) {
                        playerInGame.isTurn = false; 
                        let currentTurnIndex = lobby.gameState.players.findIndex(p => p.name === playerName);
                        let nextTurnIndexCandidate = (currentTurnIndex + 1) % lobby.gameState.players.length;
                        
                        let safetyBreak = 0;
                        const totalPlayersInGame = lobby.gameState.players.length;
                        while(safetyBreak < totalPlayersInGame && lobby.gameState.players[nextTurnIndexCandidate].isEliminated){
                            nextTurnIndexCandidate = (nextTurnIndexCandidate + 1) % totalPlayersInGame; 
                            safetyBreak++;
                        }

                        if (safetyBreak >= totalPlayersInGame) {
                            console.warn(`[GAME] Non trovato un prossimo giocatore attivo dopo disconnessione di ${playerName} in ${lobbyCode}.`);
                            io.to(lobbyCode).emit('game-over', { winner: null, reason: 'Nessun giocatore attivo rimanente.' });
                            delete lobbies[codice];
                            return;
                        }
                        
                        lobby.gameState.turnIndex = nextTurnIndexCandidate;
                        lobby.gameState.players[lobby.gameState.turnIndex].isTurn = true;
                        console.log(`[GAME] Turno passato a ${lobby.gameState.players[lobby.gameState.turnIndex].name} in ${lobbyCode} dopo disconnessione.`);
                    }
                    sendGameStateUpdate(lobby); 
                } else {
                    console.warn(`[WARN] Giocatore ${playerName} (socket ${disconnectingSocketId}) non trovato nel gameState di ${lobbyCode} durante la disconnessione in-game.`);
                }
            }
        } else { 
            console.log(`[DISCONNECT] Socket ${disconnectingSocketId} non era associato a nessuna lobby/giocatore noto.`);
        }
    }); 
}); 
console.log("Checkpoint 11: Handler per io.on('connection') definito");


// --- Gestori di Errori Globali ---
app.use((err, req, res, next) => {
    console.error("[EXPRESS ERROR STACK]:", err.stack);
    res.status(500).send('Errore interno del server Express!');
});
console.log("Checkpoint 12: Gestore errori Express definito");

process.on('uncaughtException', (err, origin) => {
    console.error(`ERRORE GLOBALE NON CATTURATO! Origin: ${origin}`, err.stack || err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('PROMISE REJECTION NON GESTITA!:', reason, 'Promise:', promise);
});
console.log("Checkpoint 13: Gestori errori globali di processo definiti");

// --- Avvio Server ---
const serverHttp = http.createServer(app);
serverHttp.on('error', (error) => {
    if (error.syscall !== 'listen') {
        console.error("Errore serverHttp non gestito:", error);
        throw error;
    }
    const bind = typeof port === 'string' ? 'Pipe ' + port : 'Porta ' + port;
    switch (error.code) {
        case 'EACCES':
            console.error(`ERRORE SERVER: ${bind} richiede privilegi elevati.`);
            process.exit(1);
            break;
        case 'EADDRINUSE':
            console.error(`ERRORE SERVER: ${bind} è già in uso! Assicurati che non ci siano altri server (o una vecchia istanza di questo server) attivi sulla stessa porta.`);
            process.exit(1);
            break;
        default:
            console.error("Errore serverHttp non riconosciuto:", error);
            throw error;
    }
});

serverHttp.listen(port, () => {
    console.log(`[INFO] Server avviato su http://localhost:${port} - Checkpoint 14: Server in ascolto!`);
});
console.log("Checkpoint 15: Chiamata a serverHttp.listen() effettuata");
