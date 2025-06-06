// MODIFICATO: Usiamo 'DOMContentLoaded' per applicazioni web standard.
// Il codice si avvia quando il DOM è completamente caricato.
document.addEventListener('DOMContentLoaded', () => { 
    // ****** AGGIORNATO CON L'URL DEL TUO SERVER RENDER ******
    const socket = io("https://cordova-ie4q.onrender.com/"); 

    const params = new URLSearchParams(window.location.search);
    const lobbyCode = params.get('code');
    const myPlayerName = params.get('player');

    const gameBoard = document.getElementById('game-board');
    const animationLayer = document.getElementById('animation-layer');
    
    const myPlayerAreaDOM = document.querySelector('#player-bottom-left'); 
    const opponentAreaDOMElements = {
        slot1: document.querySelector('#player-bottom-right'), 
        slot2: document.querySelector('#player-top-right'),     
        slot3: document.querySelector('#player-top-left')       
    };
    const opponentVisualSlotOrder = [opponentAreaDOMElements.slot1, opponentAreaDOMElements.slot2, opponentAreaDOMElements.slot3];

    const callLiarBtn = document.getElementById('call-liar-btn');
    const playSelectedCardsBtn = document.getElementById('play-selected-cards-btn');
    const playRouletteBtn = document.getElementById('play-roulette-btn'); 
    const tableTypeDisplay = document.getElementById('table-type-display');
    
    // RIFERIMENTI AI NUOVI ELEMENTI DELLA PILA DEGLI SCARTI (dal tuo gioco.html precedente)
    // Nota: Ho modificato gioco.html per includere la nuova struttura con container e info.
    const discardPileContainer = document.getElementById('discard-pile-container'); 
    const discardPileInfo = document.getElementById('discard-pile-info'); 
    const discardLabelSpan = discardPileInfo ? discardPileInfo.querySelector('.discard-label') : null;
    const discardDeclaredValueSpan = discardPileInfo ? discardPileInfo.querySelector('.declared-value') : null;

    const challengeInfoDiv = document.getElementById('challenge-info');
    const rouletteOutcomeDiv = document.getElementById('roulette-outcome-info'); 
    const gameNotificationsDiv = document.getElementById('game-notifications');

    const audioSigh = document.getElementById('audio-sigh');
    const audioRevolver = document.getElementById('audio-revolver');
    const audioShot = document.getElementById('audio-shot');
    const audioClick = document.getElementById('audio-click');
    const audioCardDeal = document.getElementById('audio-card-deal'); 

    // NUOVO: Aggiungi il riferimento a turnArrow
    const turnArrow = document.getElementById('turn-arrow');


    let currentGameState = null; 
    let isAnimatingDeal = false; 
    let selectedCards = []; 

    // NUOVO: Mappa per memorizzare le posizioni casuali delle carte nella pila degli scarti
    let discardPileCardPositions = {}; // { cardValue_index: { x, y, rotate, zIndex } }


    if (!lobbyCode || !myPlayerName) {
        showNotification("Errore: Informazioni sulla lobby o sul giocatore mancanti nell'URL. Verrai reindirizzato.", 5000);
        setTimeout(() => window.location.href = 'index.html', 5000);
        return;
    }
    
    if (myPlayerAreaDOM && myPlayerAreaDOM.querySelector('.player-name')) {
        myPlayerAreaDOM.querySelector('.player-name').textContent = myPlayerName;
    } else {
        console.error("Errore critico: Impossibile trovare l'area DOM per il giocatore principale (#player-bottom-left) o il suo span per il nome.");
    }

    function showNotification(message, duration = 3000) {
        if (gameNotificationsDiv) {
            gameNotificationsDiv.innerHTML = message;
            gameNotificationsDiv.style.display = 'block';
            gameNotificationsDiv.style.opacity = '1';
            void gameNotificationsDiv.offsetWidth; 
            gameNotificationsDiv.style.transition = 'opacity 0.5s ease-out';

            setTimeout(() => {
                gameNotificationsDiv.style.opacity = '0';
                gameNotificationsDiv.addEventListener('transitionend', function handler() {
                    gameNotificationsDiv.style.display = 'none';
                    gameNotificationsDiv.removeEventListener('transitionend', handler);
                }, { once: true });
            }, duration);
        } else {
            console.warn("Elemento notifiche non trovato, usando alert():", message);
            alert(message); 
        }
    }

    function unlockAudio() {
        if (audioCardDeal) {
            audioCardDeal.play().then(() => {
                audioCardDeal.pause();
                audioCardDeal.currentTime = 0;
                document.removeEventListener('click', unlockAudio);
                document.removeEventListener('touchend', unlockAudio);
                console.log("[AUDIO] Audio sbloccato.");
            }).catch(error => {
                console.warn("[AUDIO] Impossibile sbloccare l'audio. L'utente deve interagire.", error);
            });
        }
    }
    document.addEventListener('click', unlockAudio, { once: true });
    document.addEventListener('touchend', unlockAudio, { once: true });

    // Funzione per aggiornare lo stato dei pulsanti azione
    function updateActionButtons() {
        const meInCurrentState = currentGameState ? currentGameState.players.find(p => p.name === myPlayerName) : null;
        
        // Disabilita e nascondi tutti i pulsanti per iniziare
        callLiarBtn.style.display = 'none';
        callLiarBtn.disabled = true;
        playSelectedCardsBtn.style.display = 'none';
        playSelectedCardsBtn.disabled = true;
        playRouletteBtn.style.display = 'none';
        playRouletteBtn.disabled = true;

        if (!meInCurrentState || meInCurrentState.isEliminated) {
            // Se il giocatore non è trovato o è eliminato, non può fare azioni
            return;
        }

        let showCallLiar = false;
        let showPlayRoulette = false;
        let showPlayCards = false;

        // PRIORITÀ AL PULSANTE "SPARA!" SE C'È UNA SFIDA DI ROULETTE PENDENTE PER ME
        if (currentGameState.challenge && currentGameState.challenge.playerFacingRR === myPlayerName) {
            showPlayRoulette = true;
            // Nessun'altra azione possibile se devo sparare
        } 
        // ALTRIMENTI, se è il mio turno
        else if (currentGameState.isMyTurn) {
            // Posso sempre giocare carte se è il mio turno e non sono bloccato da una sfida
            showPlayCards = true; 
            
            // Posso chiamare BUGIA! solo se c'è stata una giocata precedente e non sono stato io a giocare
            if (currentGameState.lastPlay && currentGameState.lastPlay.playedBy !== myPlayerName) {
                showCallLiar = true; 
            }
        }

        callLiarBtn.style.display = showCallLiar ? 'block' : 'none';
        callLiarBtn.disabled = !showCallLiar;

        playRouletteBtn.style.display = showPlayRoulette ? 'block' : 'none';
        playRouletteBtn.disabled = !showPlayRoulette;

        playSelectedCardsBtn.style.display = showPlayCards ? 'block' : 'none';
        playSelectedCardsBtn.disabled = !showPlayCards || selectedCards.length === 0; 
    }

    // --- FUNZIONI HANDLER PER I PULSANTI ---
    function handlePlayRouletteClick() {
        if (playRouletteBtn.disabled) {
            console.log("[CLIENT] Tentativo di cliccare SPARA! ma il pulsante è disabilitato.");
            return;
        }

        // Disabilita tutti i pulsanti per prevenire azioni multiple durante l'animazione e la chiamata al server
        callLiarBtn.disabled = true;
        playSelectedCardsBtn.disabled = true;
        playRouletteBtn.disabled = true;
        
        // Nascondi i messaggi della sfida e roulette mentre parte l'animazione e si attende l'esito
        challengeInfoDiv.style.display = 'none';
        rouletteOutcomeDiv.style.display = 'none';

        animateGunShot(myPlayerAreaDOM).then(() => {
            console.log("[CLIENT] Animazione 'sparo' completata. Invio richiesta al server per l'esito.");
            socket.emit('play-russian-roulette', { lobbyCode });
        }).catch(err => {
            console.error("Errore durante animazione pistola:", err);
            socket.emit('play-russian-roulette', { lobbyCode }); 
        });
    }

    function handleCallLiarClick() {
        if (callLiarBtn.disabled) {
            console.log("[CLIENT] Tentativo di cliccare BUGIA! ma il pulsante è disabilitato.");
            return;
        }
        // Disabilita tutti i pulsanti
        callLiarBtn.disabled = true; 
        playSelectedCardsBtn.disabled = true;
        playRouletteBtn.disabled = true;
        
        socket.emit('call-liar', { lobbyCode });
    }

    function handlePlaySelectedCardsClick() {
        if (playSelectedCardsBtn.disabled || selectedCards.length === 0) {
            console.log("[CLIENT] Tentativo di cliccare GIOCA CARTE ma il pulsante è disabilitato o nessuna carta selezionata.");
            return;
        }

        const cardsToPlayValues = selectedCards.map(cardEl => cardEl.getAttribute('data-value'));
        
        // Disabilita immediatamente tutte le carte giocabili e i pulsanti dopo la giocata
        const myHandUiDiv = myPlayerAreaDOM.querySelector('.player-hand');
        if (myHandUiDiv) {
            Array.from(myHandUiDiv.children).forEach(c => {
                c.classList.remove('playable', 'selected'); 
                c.onclick = null; 
            });
        }
        callLiarBtn.disabled = true;
        playSelectedCardsBtn.disabled = true;
        playRouletteBtn.disabled = true;

        let animationPromises = [];
        selectedCards.forEach((cardElement, index) => {
            animationPromises.push(
                new Promise(resolve => {
                    setTimeout(() => {
                        animatePlayedCard(cardElement).then(resolve);
                    }, index * 100); 
                })
            );
        });

        Promise.all(animationPromises).then(() => {
            console.log(`[CLIENT] Animazione 'giocata carte' completata per ${cardsToPlayValues.join(', ')}. Invio richiesta al server.`);
            socket.emit('play-cards', { lobbyCode, cards: cardsToPlayValues }); 
            selectedCards = []; 
        }).catch(err => {
            console.error("Errore durante animazione carte giocate:", err);
            socket.emit('play-cards', { lobbyCode, cards: cardsToPlayValues });
            selectedCards = [];
        });
    }

    if (playRouletteBtn) {
        playRouletteBtn.addEventListener('click', handlePlayRouletteClick);
    }
    if (callLiarBtn) {
        callLiarBtn.addEventListener('click', handleCallLiarClick);
    }
    if (playSelectedCardsBtn) {
        playSelectedCardsBtn.addEventListener('click', handlePlaySelectedCardsClick);
    }

    // --- GESTIONE EVENTI SOCKET ---
    socket.on('connect', () => {
        console.log(`Connesso al server di gioco. ID: ${socket.id}. Giocatore: ${myPlayerName}, Lobby: ${lobbyCode}`);
        // Quando ci si connette alla pagina del gioco, si emette player-ready-in-game
        socket.emit('player-ready-in-game', { lobbyCode, playerName: myPlayerName });
    });
    
    socket.on('game-state-update', (gameState) => {
        const previousRound = currentGameState ? currentGameState.roundNumber : -1;
        const previousMyCardCount = currentGameState && currentGameState.myHand ? currentGameState.myHand.length : -1;
        const previousDiscardPileLength = currentGameState && currentGameState.discardPile ? currentGameState.discardPile.length : 0; // NUOVO

        currentGameState = gameState; 
        
        const meInCurrentState = gameState.players.find(p => p.name === myPlayerName);
        const myCurrentCardCount = meInCurrentState && meInCurrentState.isEliminated === false ? gameState.myHand.length : 0;
        const currentDiscardPileLength = gameState.discardPile ? gameState.discardPile.length : 0; // NUOVO
        
        const isNewDeal = (gameState.roundNumber !== previousRound) || 
                               (gameState.roundNumber === previousRound && previousMyCardCount === 0 && myCurrentCardCount > 0 && !gameState.challenge);
        
        // NUOVO: Reset delle posizioni delle carte nella pila degli scarti se è un nuovo deal o la pila è stata azzerata
        if (isNewDeal || (currentDiscardPileLength === 0 && previousDiscardPileLength > 0)) {
            discardPileCardPositions = {};
            console.log("[DEBUG] discardPileCardPositions resettato.");
        }

        if (isNewDeal && !isAnimatingDeal) {
            console.log(`[${myPlayerName}] Rilevato nuovo deal (Round ${gameState.roundNumber}). Avvio animazione distribuzione.`);
            isAnimatingDeal = true;
            // Rimuovi le carte esistenti prima dell'animazione
            document.querySelectorAll('.player-hand').forEach(ph => ph.innerHTML = ''); 
            document.querySelectorAll('.player-hand').forEach(ph => ph.style.opacity = '0'); 
            document.querySelectorAll('.player-hand p').forEach(p => p.remove());
            if (discardPileContainer) discardPileContainer.innerHTML = ''; // Pulisci la pila durante il deal

            // Disabilita i pulsanti durante l'animazione di deal per prevenire interazioni premature
            if (callLiarBtn) callLiarBtn.disabled = true;
            if (playSelectedCardsBtn) playSelectedCardsBtn.disabled = true; 
            if (playRouletteBtn) playRouletteBtn.disabled = true;

            // Nascondi anche i messaggi di sfida/roulette all'inizio di un nuovo deal
            challengeInfoDiv.style.display = 'none';
            rouletteOutcomeDiv.style.display = 'none';

            animateCardDealing(gameState, () => {
                isAnimatingDeal = false;
                console.log(`[${myPlayerName}] Animazione distribuzione FINITA. Render statico.`);
                renderStaticGameBoard(currentGameState); 
                document.querySelectorAll('.player-hand').forEach(ph => ph.style.opacity = '1'); 
            });
        } else {
            console.log(`[${myPlayerName}] Aggiornamento normale. Render statico.`);
            renderStaticGameBoard(gameState);
        }
        updateActionButtons(); 
    });

    socket.on('disconnect', () => {
        showNotification("Disconnesso dal server di gioco. Verrai reindirizzato alla lobby.", 5000);
        setTimeout(() => window.location.href = 'index.html', 5000); 
    });

    socket.on('error-message', (message) => {
        showNotification(`<strong>Errore dal server:</strong> ${message}`, 4000);
    });

    socket.on('game-over', (data) => {
        let message = "Partita Terminata!";
        if (data.winner) {
            message += `<br><strong>${data.winner}</strong> ha vinto!`;
        } else if (data.reason) {
            message += `<br>Motivo: ${data.reason}`;
        }
        showNotification(message, 6000);
        setTimeout(() => window.location.href = 'index.html', 6000);
    });
    
    socket.on('round-over', (data) => { 
        let message = `Fine Round! ${data.message}`;
        if (data.winner) {
            message = `Fine Round! <strong>${data.winner}</strong> ha finito le carte!`;
        }
        message += `<br>Si prepara un nuovo round...`;
        showNotification(message, 5000);

        // Disabilita tutti i pulsanti al termine del round
        if (callLiarBtn) callLiarBtn.disabled = true;
        if (callLiarBtn) callLiarBtn.style.display = 'none';
        if (playSelectedCardsBtn) playSelectedCardsBtn.disabled = true;
        if (playSelectedCardsBtn) playSelectedCardsBtn.style.display = 'none';
        if (playRouletteBtn) playRouletteBtn.disabled = true;
        if (playRouletteBtn) playRouletteBtn.style.display = 'none';
        
        // Pulisci la mano del giocatore per visualizzare il messaggio di attesa
        const myHandUiDiv = myPlayerAreaDOM.querySelector('.player-hand');
        if (myHandUiDiv) { 
            myHandUiDiv.innerHTML = '<p class="awaiting-round">Attendendo nuovo round...</p>'; 
        }
        if (discardPileContainer) discardPileContainer.innerHTML = ''; // Pulisci la pila alla fine del round
        discardPileCardPositions = {}; // Resetta le posizioni per il prossimo round
    });

    socket.on('play-liar-sounds', () => {
        if (audioSigh && audioRevolver) {
            audioSigh.currentTime = 0;
            audioSigh.play().then(() => {
                setTimeout(() => {
                    audioRevolver.currentTime = 0;
                    audioRevolver.play();
                }, 1000); 
            }).catch(e => console.error("Errore riproduzione audio 'sigh' o 'revolver':", e));
        }
    });

    // NUOVO: Funzione per calcolare l'angolo di rotazione della freccia di turno
    function calculateTurnArrowRotation(playerAreaElement, gameBoardRect, centerRect) {
        if (!playerAreaElement || !gameBoardRect || !centerRect) {
            console.warn("Elementi per il calcolo della rotazione della freccia non trovati.");
            return 0; // Ritorna un angolo di default
        }

        const playerRect = playerAreaElement.getBoundingClientRect();

        // Calcola il centro del giocatore
        const playerCenterX = playerRect.left + playerRect.width / 2;
        const playerCenterY = playerRect.top + playerRect.height / 2;

        // Calcola il centro dell'area centrale (o del tabellone di gioco come fallback)
        const boardCenterX = centerRect.left + centerRect.width / 2;
        const boardCenterY = centerRect.top + centerRect.height / 2;

        // Calcola il vettore dal centro del tavolo al centro del giocatore
        const deltaX = playerCenterX - boardCenterX;
        const deltaY = playerCenterY - boardCenterY;

        // Calcola l'angolo in radianti e poi converti in gradi
        // Aggiungi 90 gradi per compensare l'orientamento di default di una freccia "verticale"
        const angleRad = Math.atan2(deltaY, deltaX);
        let angleDeg = angleRad * (180 / Math.PI) + 90; 

        // Normalizza l'angolo tra 0 e 360
        if (angleDeg < 0) {
            angleDeg += 360;
        }
        return angleDeg;
    }


    // --- FUNZIONI DI ANIMAZIONE ---
    function getPlayerHandDomElement(playerName, state) {
        if (playerName === myPlayerName) {
            return myPlayerAreaDOM.querySelector('.player-hand');
        }
        const myIdx = state.players.findIndex(p => p.name === myPlayerName);
        const playerIdx = state.players.findIndex(p => p.name === playerName);

        if (myIdx === -1 || playerIdx === -1 || myIdx === playerIdx) return null;

        let relativeVisualSlotIndex = (playerIdx - myIdx + state.players.length) % state.players.length;
        
        if (state.players.length === 2) {
            return opponentAreaDOMElements.slot1.querySelector('.player-hand'); 
        }
        if (state.players.length === 3) {
            if (relativeVisualSlotIndex === 1) return opponentAreaDOMElements.slot1.querySelector('.player-hand');
            if (relativeVisualSlotIndex === 2) return opponentAreaDOMElements.slot2.querySelector('.player-hand');
        }
        if (state.players.length === 4 && relativeVisualSlotIndex > 0 && relativeVisualSlotIndex <= opponentVisualSlotOrder.length) {
            const slotElement = opponentVisualSlotOrder[relativeVisualSlotIndex - 1]; 
            return slotElement ? slotElement.querySelector('.player-hand') : null;
        }
        return null;
    }

    // Calcola dinamicamente la sovrapposizione delle carte in una mano
    function calculateCardOverlap(numCards, cardWidth, handWidth) {
        const maxOverlap = 0.5 * cardWidth; 
        if (numCards <= 1) return 0; 

        const totalIdealWidth = numCards * cardWidth;

        if (totalIdealWidth > handWidth) {
            const spaceToFill = handWidth - cardWidth; 
            const overlapPerGap = (cardWidth * (numCards - 1) - spaceToFill) / (numCards - 1);
            return Math.max(0, Math.min(maxOverlap, overlapPerGap)); 
        }
        return Math.min(maxOverlap, cardWidth * 0.45); 
    }

    // NUOVO: Funzione per calcolare lo scostamento delle carte per l'effetto "a ventaglio" per la mano del giocatore locale
    function calculateFanPositions(numCards, cardWidth, cardHeight, handContainerWidth) {
        if (numCards === 0) return [];
        const positions = [];
        const fanSpreadAngle = 30; // Angolo totale del ventaglio (es. 30 gradi)
        const maxTranslationY = 15; // Massimo spostamento verso il basso al centro
        const baseOverlap = cardWidth * 0.4; // Sovrapposizione base per tutte le carte

        const totalWidthNeeded = (numCards * cardWidth) - ((numCards - 1) * baseOverlap);
        // Calcola l'offset X iniziale per centrare il "ventaglio" all'interno del contenitore della mano
        const initialXOffset = (handContainerWidth / 2) - (totalWidthNeeded / 2);

        for (let i = 0; i < numCards; i++) {
            // Calcola l'angolo di rotazione per ogni carta. Centrato su 0 gradi.
            const angle = (numCards > 1) ? ((i / (numCards - 1)) - 0.5) * fanSpreadAngle : 0; 
            const rotation = angle; 

            // Calcolo del dislivello a parabola: le carte ai lati sono più basse
            // normalizedPosition: 0 al centro del range, 0.5 ai bordi
            const normalizedPosition = (numCards > 1) ? Math.abs((i / (numCards - 1)) - 0.5) : 0; 
            const translateY = maxTranslationY * (1 - Math.cos(normalizedPosition * Math.PI)); // Funzione coseno per curva

            // Posizionamento orizzontale con sovrapposizione
            // L'offset X è la posizione base + lo scostamento per l'accavallamento
            const translateX = initialXOffset + (i * (cardWidth - baseOverlap)); 
            
            positions.push({
                x: translateX,
                y: translateY,
                rotate: rotation
            });
        }
        return positions;
    }

    // NUOVO: Funzione per generare posizioni casuali per le carte nella pila degli scarti
    function generateRandomDiscardPosition(cardWidth, cardHeight, pileContainerWidth, pileContainerHeight, existingCardsCount) {
        // Range di scostamento X e Y dal centro della pila
        const maxXOffset = (pileContainerWidth - cardWidth) / 2;
        const maxYOffset = (pileContainerHeight - cardHeight) / 2;
        const maxRotation = 10; // Rotazione massima in gradi (+/- 10 gradi)

        // Genera posizioni e rotazioni leggermente casuali
        // Moltiplica per un fattore (es. 0.5) per mantenere le carte più raggruppate
        const x = (Math.random() * 2 - 1) * maxXOffset * 0.5; // Random tra -X e +X
        const y = (Math.random() * 2 - 1) * maxYOffset * 0.5; // Random tra -Y e +Y
        const rotate = (Math.random() * 2 - 1) * maxRotation; // Random tra -maxRotation e +maxRotation
        const zIndex = existingCardsCount; // L'ultima carta aggiunta è sopra le altre

        return { x, y, rotate, zIndex };
    }


    function animateCardDealing(state, onAnimationsComplete) {
        console.log(`[ANIM] Inizio animazione distribuzione carte per round ${state.roundNumber}`);
        if (!animationLayer || !gameBoard) { 
            console.error("[ANIM] Elemento gameBoard o layer animazione mancante!"); 
            if (onAnimationsComplete) onAnimationsComplete();
            return; 
        }
        animationLayer.innerHTML = ''; 

        const gameBoardRect = gameBoard.getBoundingClientRect();
        const centerAreaEl = document.querySelector('.center-area');
        let sourceX, sourceY;
        if (centerAreaEl) { 
            const centerRect = centerAreaEl.getBoundingClientRect(); 
            sourceX = centerRect.left + centerRect.width / 2 - gameBoardRect.left; 
            sourceY = centerRect.top + centerRect.height / 2 - gameBoardRect.top; 
        } else { 
            sourceX = gameBoardRect.width / 2; 
            sourceY = gameBoardRect.height / 2; 
        }

        let animationsPending = 0;
        const maxCardsToDealThisRound = Math.max(...state.players.map(p => p.hand ? p.hand.length : 0));
        
        if (audioCardDeal) { 
            audioCardDeal.currentTime = 0; 
            audioCardDeal.play().catch(e => console.warn("Errore riproduzione audio 'card deal':", e)); 
        }

        const tempDivForStyle = document.createElement('div');
        tempDivForStyle.className = 'card'; 
        document.body.appendChild(tempDivForStyle);
        const cardWidth = parseFloat(getComputedStyle(tempDivForStyle).getPropertyValue('--card-width'));
        const cardHeight = parseFloat(getComputedStyle(tempDivForStyle).getPropertyValue('--card-height'));
        document.body.removeChild(tempDivForStyle);

        for (let cardIdx = 0; cardIdx < maxCardsToDealThisRound; cardIdx++) {
            state.players.forEach((player, playerOrderIdx) => {
                if (player.isEliminated) return; 
                
                const numCardsThisPlayerHas = (player.name === myPlayerName) ? (state.myHand ? state.myHand.length : 0) : player.cardCount;
                if (cardIdx >= numCardsThisPlayerHas) return; 

                animationsPending++;
                const flyingCard = document.createElement('div');
                flyingCard.className = 'card back flying-card'; 
                
                flyingCard.style.left = `${sourceX - (cardWidth / 2)}px`;
                flyingCard.style.top = `${sourceY - (cardHeight / 2)}px`;
                flyingCard.style.transform = 'scale(0.4)'; 
                flyingCard.style.opacity = '0'; 
                
                animationLayer.appendChild(flyingCard);

                const targetHandEl = getPlayerHandDomElement(player.name, state);
                if (!targetHandEl) { 
                    console.warn(`[ANIM] Elemento mano DOM non trovato per ${player.name}. Saltando animazione carta.`); 
                    animationsPending--; 
                    if (flyingCard.parentNode) flyingCard.remove(); 
                    return; 
                }

                const handRect = targetHandEl.getBoundingClientRect();
                
                // CALCOLO DELLE POSIZIONI FINALI IN BASE AL TIPO DI MANO (Ventaglio o Accavallamento Semplice)
                let targetCardAbsX, targetCardAbsY, targetRotation;
                if (player.name === myPlayerName) { // Giocatore locale: effetto ventaglio
                    const positions = calculateFanPositions(numCardsThisPlayerHas, cardWidth, cardHeight, handRect.width);
                    const cardPos = positions[cardIdx];
                    targetCardAbsX = handRect.left - gameBoardRect.left + cardPos.x;
                    targetCardAbsY = handRect.top - gameBoardRect.top + cardPos.y;
                    targetRotation = cardPos.rotate;
                    // Anche se le carte volanti hanno un z-index fisso qui, la logica di z-index per la mano statica è nel renderStaticGameBoard
                } else { // Avversari: accavallamento semplice
                    const dynamicOverlap = calculateCardOverlap(numCardsThisPlayerHas, cardWidth, handRect.width);
                    const totalVisibleWidthInHand = cardWidth + (numCardsThisPlayerHas - 1) * (cardWidth - dynamicOverlap);
                    const startXInHand = (handRect.width - totalVisibleWidthInHand) / 2; 
                    targetCardAbsX = handRect.left - gameBoardRect.left + startXInHand + (cardIdx * (cardWidth - dynamicOverlap));
                    targetCardAbsY = handRect.top - gameBoardRect.top + (handRect.height / 2) - (cardHeight / 2);
                    targetRotation = 0; // Nessuna rotazione per gli avversari
                }
                
                const translateX = targetCardAbsX - parseFloat(flyingCard.style.left); 
                const translateY = targetCardAbsY - parseFloat(flyingCard.style.top); 

                const delay = (cardIdx * state.players.length + playerOrderIdx) * 60; 

                setTimeout(() => {
                    void flyingCard.offsetWidth; 
                    flyingCard.style.transform = `translate(${translateX}px, ${translateY}px) scale(1) rotate(${targetRotation}deg)`;
                    flyingCard.style.opacity = '1'; 

                    flyingCard.addEventListener('transitionend', function handler() {
                        if (flyingCard.parentNode) flyingCard.remove(); 
                        animationsPending--;
                        if (animationsPending === 0) { 
                            console.log("[ANIM] Animazioni distribuzione carte completate.");
                            if (onAnimationsComplete) onAnimationsComplete();
                        }
                        this.removeEventListener('transitionend', handler); 
                    }, { once: true });
                }, 50 + delay); 
            });
        }
        if (animationsPending === 0 && onAnimationsComplete) { 
            console.log("[ANIM] Nessuna carta da animare, risoluzione immediata."); 
            onAnimationsComplete(); 
        }
    }

    // MODIFICATO: animatePlayedCard per far atterrare le carte casualmente sulla pila
    function animatePlayedCard(cardElement) {
        return new Promise(resolve => {
            // Nota: qui discardPileDiv è ancora usato come riferimento, ma in realtà
            // le carte andranno nel discardPileContainer.
            // Questa funzione si occupa dell'animazione dalla mano alla pila,
            // il posizionamento finale è nel renderStaticGameBoard
            if (!animationLayer || !gameBoard || !discardPileContainer || !cardElement) { 
                console.error("[ANIM CARD] Elementi necessari per animazione carta giocata mancanti o cardElement nullo."); 
                if (cardElement && cardElement.parentNode) cardElement.remove(); 
                resolve(); 
                return; 
            }

            const flyingCard = cardElement.cloneNode(true);
            const cardRect = cardElement.getBoundingClientRect(); 
            const gameBoardRect = gameBoard.getBoundingClientRect();
            const discardPileContainerRect = discardPileContainer.getBoundingClientRect(); 

            // Le carte sulla pila degli scarti sono sempre coperte e non sono più "selezionabili"
            flyingCard.classList.remove('static-in-hand', 'playable', 'selected'); 
            flyingCard.classList.add('flying-card', 'back'); 
            
            // Imposta la posizione iniziale della carta volante (dalla mano del giocatore)
            flyingCard.style.left = `${cardRect.left - gameBoardRect.left}px`;
            flyingCard.style.top = `${cardRect.top - gameBoardRect.top}px`;
            flyingCard.style.opacity = '1';
            flyingCard.style.transform = 'scale(1)'; 
            animationLayer.appendChild(flyingCard);
            
            cardElement.remove(); // Rimuovi la carta originale dalla mano del giocatore

            // Ottieni dimensioni della carta per il calcolo delle posizioni casuali
            const cardWidth = parseFloat(getComputedStyle(flyingCard).getPropertyValue('--card-width'));
            const cardHeight = parseFloat(getComputedStyle(flyingCard).getPropertyValue('--card-height'));

            // Genera la posizione casuale per questa carta sulla pila degli scarti
            const pilePositions = generateRandomDiscardPosition(
                cardWidth, cardHeight, 
                discardPileContainerRect.width, discardPileContainerRect.height, 
                currentGameState.discardPile.length // Usa la lunghezza attuale della pila per il zIndex
            );

            // Calcola la posizione target assoluta rispetto al gameBoard per l'animazione
            // pilePositions.x e y sono scostamenti dal centro di discardPileContainer
            const targetX = discardPileContainerRect.left - gameBoardRect.left + pilePositions.x + (discardPileContainerRect.width / 2) - (cardWidth / 2);
            const targetY = discardPileContainerRect.top - gameBoardRect.top + pilePositions.y + (discardPileContainerRect.height / 2) - (cardHeight / 2);

            void flyingCard.offsetWidth; // Forza il reflow per applicare le posizioni iniziali prima della transizione
            
            // Applica la transizione e le trasformazioni finali per l'animazione
            flyingCard.style.transition = 'transform 0.5s ease-out, opacity 0.5s ease-out';
            flyingCard.style.transform = `translate(${targetX - parseFloat(flyingCard.style.left)}px, ${targetY - parseFloat(flyingCard.style.top)}px) scale(1) rotate(${pilePositions.rotate}deg)`;
            flyingCard.style.opacity = '1'; 
            flyingCard.style.zIndex = pilePositions.zIndex; // Imposta lo z-index durante l'animazione

            flyingCard.addEventListener('transitionend', function handler() {
                // Dopo l'animazione, la carta si sposta dal layer di animazione alla pila degli scarti
                if (discardPileContainer) {
                    if (flyingCard.parentNode === animationLayer) { // Assicurati che sia ancora nel layer di animazione
                         animationLayer.removeChild(flyingCard);
                    }
                    // Reimposta le proprietà per la visualizzazione statica nella pila
                    // Le posizioni x/y qui sono relative al `discardPileContainer`
                    flyingCard.style.position = 'absolute';
                    flyingCard.style.left = `${pilePositions.x + (discardPileContainerRect.width / 2) - (cardWidth / 2)}px`;
                    flyingCard.style.top = `${pilePositions.y + (discardPileContainerRect.height / 2) - (cardHeight / 2)}px`;
                    flyingCard.style.transform = `rotate(${pilePositions.rotate}deg)`;
                    flyingCard.style.transition = 'none'; // Nessuna transizione per future modifiche una volta che è statica
                    flyingCard.style.opacity = '1'; // Mantiene l'opacità
                    flyingCard.style.zIndex = pilePositions.zIndex;
                    flyingCard.classList.remove('flying-card'); // Non è più una carta volante

                    discardPileContainer.appendChild(flyingCard);
                    
                    // Memorizza la posizione generata per questa carta per i render futuri
                    // NOTA: l'indice 'currentGameState.discardPile.length' sarà la dimensione della pila DOPO questa carta.
                    // Quindi usiamo `currentGameState.discardPile.length - 1` per l'indice della carta appena aggiunta.
                    const cardIdInPile = `${flyingCard.getAttribute('data-value')}_${currentGameState.discardPile.length -1}`; 
                    discardPileCardPositions[cardIdInPile] = pilePositions;

                } else {
                    console.warn("[ANIM CARD] discardPileContainer non trovato alla fine dell'animazione.");
                    if (flyingCard.parentNode) flyingCard.remove();
                }
                resolve(); 
                this.removeEventListener('transitionend', handler);
            }, { once: true });
        });
    }

    function animateGunShot(targetPlayerAreaElement) {
        if (!animationLayer || !gameBoard || !targetPlayerAreaElement) {
            console.error("[ANIM GUN] Elementi necessari per animazione pistola mancanti.");
            return Promise.resolve(); // Return a resolved promise to avoid blocking
        }
        return new Promise(resolve => {
            animationLayer.innerHTML = ''; 

            const gunImg = new Image();
            gunImg.src = 'immagini/revolver.png'; 
            gunImg.className = 'flying-gun';
            gunImg.style.opacity = '0';

            const gameBoardRect = gameBoard.getBoundingClientRect();
            const centerAreaEl = document.querySelector('.center-area');
            let sourceX, sourceY;
            if (centerAreaEl) {
                const centerRect = centerAreaEl.getBoundingClientRect();
                sourceX = centerRect.left + centerRect.width / 2 - gameBoardRect.left;
                sourceY = centerRect.top + centerRect.height / 2 - gameBoardRect.top;
            } else {
                sourceX = gameBoardRect.width / 2;
                sourceY = gameBoardRect.height / 2;
            }

            gunImg.onload = () => {
                gunImg.style.left = `${sourceX - (gunImg.width / 2)}px`;
                gunImg.style.top = `${sourceY - (gunImg.height / 2)}px`;
                gunImg.style.transform = 'scale(0.5) rotate(-90deg)'; 
                animationLayer.appendChild(gunImg);

                const targetRect = targetPlayerAreaElement.getBoundingClientRect();
                const targetGunX = targetRect.left + targetRect.width / 2 - gameBoardRect.left - (gunImg.width / 2);
                const targetGunY = targetRect.top + targetRect.height / 2 - gameBoardRect.top - (gunImg.height / 2);

                void gunImg.offsetWidth; 

                setTimeout(() => {
                    gunImg.style.opacity = '1';
                    gunImg.style.transform = `translate(${targetGunX - parseFloat(gunImg.style.left)}px, ${targetGunY - parseFloat(gunImg.style.top)}px) scale(1) rotate(0deg)`;

                    gunImg.addEventListener('transitionend', function handler() {
                        targetPlayerAreaElement.classList.add('shake-animation'); 
                        
                        setTimeout(() => {
                            targetPlayerAreaElement.classList.remove('shake-animation'); 
                            if(gunImg.parentNode) gunImg.remove(); 
                            resolve(); 
                        }, 500); 
                        this.removeEventListener('transitionend', handler); 
                    }, { once: true });
                }, 50); 
            };
            gunImg.onerror = () => { 
                console.error("Errore caricamento immagine pistola. Assicurati che 'immagini/revolver.png' sia nel posto giusto.");
                resolve(); 
            }
        });
    }

    // --- FUNZIONE DI RENDERING STATICO DEL TAVOLO ---
    function renderStaticGameBoard(state) {
        console.log(`[RENDER STATIC] Inizio render per ${myPlayerName}. Round: ${state.roundNumber}, Turno: ${state.players.find(p => p.isTurn)?.name || 'N/A'}`); 

        if (!state || !state.players || state.tableType === undefined) { 
            console.error("[RENDER STATIC] Stato gioco incompleto o non valido ricevuto:", state);
            return;
        }
        
        if (tableTypeDisplay) {
            tableTypeDisplay.textContent = state.tableType ? `TAVOLO: ${state.tableType.toUpperCase()}` : 'TAVOLO: IN ATTESA...';
        }

        // AGGIUNTA: Aggiorna lo stato della sfida (BUGIA!)
        if (challengeInfoDiv) {
            if (state.challenge) {
                const { callingPlayer, accusedPlayer, revealedCards, isLie } = state.challenge;
                let message = `<strong>${callingPlayer}</strong> ha chiamato BUGIA! su <strong>${accusedPlayer}</strong>.<br>`;
                message += `Carte rivelate: ${revealedCards.join(', ')}. `;
                message += isLie ? `<strong>ERA UNA BUGIA!</strong>` : `<strong>NON ERA UNA BUGIA!</strong>`;
                challengeInfoDiv.innerHTML = message;
                challengeInfoDiv.style.display = 'block';
                console.log("[RENDER STATIC] Visualizzato messaggio di sfida:", message);
            } else {
                challengeInfoDiv.style.display = 'none';
                challengeInfoDiv.innerHTML = '';
            }
        }

        // AGGIUNTA: Aggiorna l'esito della Roulette Russa
        if (rouletteOutcomeDiv) {
            if (state.rouletteOutcome) {
                const { player, card } = state.rouletteOutcome;
                let message = `<strong>${player}</strong> ha sparato: <strong>${card}!</strong>`;
                rouletteOutcomeDiv.innerHTML = message;
                rouletteOutcomeDiv.style.display = 'block';
                console.log("[RENDER STATIC] Visualizzato esito roulette:", message);

                // Riproduci l'audio appropriato per l'esito della roulette
                if (card === 'Letale' && audioShot) {
                    audioShot.currentTime = 0;
                    audioShot.play().catch(e => console.error("Errore riproduzione audio 'boom':", e));
                } else if (card === 'A Salve' && audioClick) {
                    audioClick.currentTime = 0;
                    audioClick.play().catch(e => console.error("Errore riproduzione audio 'click':", e));
                }
            } else {
                rouletteOutcomeDiv.style.display = 'none';
                rouletteOutcomeDiv.innerHTML = '';
                // Se l'esito della roulette è stato resettato, assicurati che i suoni non vengano riprodotti nuovamente
                // e che la musica di tensione (panic) finisca se presente.
                if (audioRevolver) audioRevolver.pause(); 
            }
        }

        // NUOVO: Gestione dell'indicatore di turno con la freccia
        const turnArrow = document.getElementById('turn-arrow'); // Riferimento locale a turnArrow se non è globale
        if (turnArrow) {
            const playerInTurn = state.players.find(p => p.isTurn);
            if (playerInTurn && !playerInTurn.isEliminated) {
                // Trova l'elemento DOM del giocatore di turno
                let playerTurnElement = null;
                if (playerInTurn.name === myPlayerName) {
                    playerTurnElement = myPlayerAreaDOM;
                } else {
                    const myIdx = state.players.findIndex(p => p.name === myPlayerName);
                    const playerIdx = state.players.findIndex(p => p.name === playerInTurn.name);
                    
                    let relativeVisualSlotIndex = (playerIdx - myIdx + state.players.length) % state.players.length;

                    if (state.players.length === 2) {
                        playerTurnElement = opponentAreaDOMElements.slot1;
                    } else if (state.players.length === 3) {
                        if (relativeVisualSlotIndex === 1) playerTurnElement = opponentAreaDOMElements.slot1;
                        if (relativeVisualSlotIndex === 2) playerTurnElement = opponentAreaDOMElements.slot2;
                    } else if (state.players.length === 4) {
                       // Assegna in base all'ordine degli slot visivi definiti
                       if (relativeVisualSlotIndex === 1) playerTurnElement = opponentAreaDOMElements.slot1; // bottom-right
                       if (relativeVisualSlotIndex === 2) playerTurnElement = opponentAreaDOMElements.slot2; // top-right
                       if (relativeVisualSlotIndex === 3) playerTurnElement = opponentAreaDOMElements.slot3; // top-left
                    }
                }

                if (playerTurnElement) {
                    const gameBoardRect = gameBoard.getBoundingClientRect();
                    // Usiamo center-area come punto di riferimento per il calcolo della rotazione
                    const centerAreaEl = document.querySelector('.center-area'); 
                    const centerRect = centerAreaEl ? centerAreaEl.getBoundingClientRect() : gameBoardRect; 

                    const rotation = calculateTurnArrowRotation(playerTurnElement, gameBoardRect, centerRect);
                    turnArrow.style.transform = `rotate(${rotation}deg)`;
                    turnArrow.style.opacity = '1'; // Rendi visibile
                } else {
                    turnArrow.style.opacity = '0'; // Nascondi se non trovi l'elemento del giocatore di turno
                }
            } else {
                turnArrow.style.opacity = '0'; // Nascondi se non c'è un giocatore di turno o è eliminato
            }
        }


        const me = state.players.find(p => p.name === myPlayerName);
        if (myPlayerAreaDOM) {
            const myNameEl = myPlayerAreaDOM.querySelector('.player-name');
            const myHandUiDiv = myPlayerAreaDOM.querySelector('.player-hand');

            if (me) {
                myPlayerAreaDOM.style.visibility = 'visible';
                if (myNameEl) myNameEl.textContent = me.name; 

                if (myHandUiDiv) {
                    myHandUiDiv.classList.remove('awaiting-round');
                    myHandUiDiv.innerHTML = ''; 
                }

                if (me.isEliminated) {
                    myPlayerAreaDOM.classList.add('eliminated');
                    myPlayerAreaDOM.classList.remove('is-turn');
                    if (myHandUiDiv) myHandUiDiv.innerHTML = '<p style="color:grey; font-size: 0.8em;">ELIMINATO</p>';
                } else {
                    myPlayerAreaDOM.classList.remove('eliminated');
                    myPlayerAreaDOM.classList.toggle('is-turn', state.isMyTurn);

                    if (state.myHand && Array.isArray(state.myHand) && myHandUiDiv) {
                        const tempDivForStyle = document.createElement('div');
                        tempDivForStyle.className = 'card'; 
                        document.body.appendChild(tempDivForStyle);
                        const cardWidth = parseFloat(getComputedStyle(tempDivForStyle).getPropertyValue('--card-width'));
                        const cardHeight = parseFloat(getComputedStyle(tempDivForStyle).getPropertyValue('--card-height'));
                        document.body.removeChild(tempDivForStyle);
                        
                        const handRect = myHandUiDiv.getBoundingClientRect();
                        
                        selectedCards = []; 

                        // Calcola le posizioni per l'effetto ventaglio per la mano del giocatore locale
                        const fanPositions = calculateFanPositions(state.myHand.length, cardWidth, cardHeight, handRect.width);

                        state.myHand.forEach((cardValue, cardIndex) => {
                            const cardDiv = document.createElement('div');
                            cardDiv.className = 'card static-in-hand';
                            cardDiv.textContent = cardValue; // Manteniamo il testo per aria-label o debug
                            cardDiv.setAttribute('aria-label', `Carta: ${cardValue}`); // Accessibilità
                            cardDiv.setAttribute('data-value', cardValue); // Usiamo un attributo data- per recuperare il valore

                            // Aggiungi la classe CSS specifica per il valore della carta
                            cardDiv.classList.add(cardValue.toLowerCase()); 
                            
                            // Applica le trasformazioni calcolate per l'effetto ventaglio
                            if (fanPositions[cardIndex]) {
                                const pos = fanPositions[cardIndex];
                                cardDiv.style.position = 'absolute'; // Importante per posizionamento preciso
                                cardDiv.style.left = `${pos.x}px`;
                                cardDiv.style.top = `${pos.y}px`;
                                cardDiv.style.transform = `rotate(${pos.rotate}deg)`;
                                cardDiv.style.zIndex = cardIndex; // Z-index per sovrapposizione corretta
                                cardDiv.style.transformOrigin = `center ${cardHeight * 0.8}px`; // Pivot più in basso per rotazione naturale
                            }

                            if (state.isMyTurn) { 
                                cardDiv.classList.add('playable');
                                cardDiv.onclick = () => {
                                    console.log(`[CLIENT] Cliccata carta: ${cardValue}.`);
                                    if (cardDiv.classList.contains('selected')) {
                                        cardDiv.classList.remove('selected');
                                        selectedCards = selectedCards.filter(c => c !== cardDiv); 
                                    } else {
                                        cardDiv.classList.add('selected');
                                        selectedCards.push(cardDiv); 
                                    }
                                    updateActionButtons(); 
                                };
                            }
                            myHandUiDiv.appendChild(cardDiv);
                        });
                        if (state.myHand.length === 0 && !me.isEliminated && myHandUiDiv.children.length === 0) {
                            myHandUiDiv.innerHTML = '<p class="awaiting-round">Attendendo nuovo round...</p>';
                        }
                    }
                }
            } else { console.warn(`[RENDER STATIC] Giocatore ${myPlayerName} non trovato nello stato. Nascondo la sua area.`); myPlayerAreaDOM.style.visibility = 'hidden'; }
        } else { console.error("[RENDER STATIC] myPlayerAreaDOM non trovato!"); }

        // --- GESTIONE DELLA PILA DEGLI SCARTI ---
        // Ho ripristinato il tuo HTML originale per discardPileDiv, ma ti avevo suggerito di dividerlo in discard-pile-container e discard-pile-info
        // Se non hai ancora fatto quella modifica HTML, questa parte di codice userà ancora discardPileDiv come riferimento unico.
        // Se hai fatto la modifica HTML, assicurati che i riferimenti (discardPileContainer, discardPileInfo, etc.) siano globali nel tuo JS.
        if (discardPileContainer && discardPileInfo) { // Usa i riferimenti corretti
            discardPileContainer.innerHTML = ''; // Pulisci il contenitore delle carte scartate
            
            // Ottieni dimensioni della carta per il calcolo
            const tempDivForStyle = document.createElement('div');
            tempDivForStyle.className = 'card'; 
            document.body.appendChild(tempDivForStyle);
            const cardWidth = parseFloat(getComputedStyle(tempDivForStyle).getPropertyValue('--card-width'));
            const cardHeight = parseFloat(getComputedStyle(tempDivForStyle).getPropertyValue('--card-height'));
            document.body.removeChild(tempDivForStyle);

            const discardPileContainerRect = discardPileContainer.getBoundingClientRect();

            if (state.discardPile && state.discardPile.length > 0) {
                // Renderizza ogni carta nella pila degli scarti
                state.discardPile.forEach((cardValue, index) => {
                    const cardDiv = document.createElement('div');
                    cardDiv.className = 'card back'; // Tutte le carte scartate sono sul retro
                    cardDiv.setAttribute('aria-label', `Carta scartata`);
                    cardDiv.setAttribute('data-value', cardValue); // Mantiene il valore per riferimento

                    // Recupera la posizione casuale memorizzata, o generane una nuova se non esiste
                    const cardIdInPile = `${cardValue}_${index}`; // ID basato su valore e posizione nella pila
                    let pos = discardPileCardPositions[cardIdInPile];
                    if (!pos) {
                        pos = generateRandomDiscardPosition(
                            cardWidth, cardHeight, 
                            discardPileContainerRect.width, discardPileContainerRect.height, 
                            index // zIndex è l'indice attuale
                        );
                        discardPileCardPositions[cardIdInPile] = pos; // Memorizza per i prossimi render
                    }

                    // Applica le posizioni e rotazioni
                    cardDiv.style.position = 'absolute';
                    // Le posizioni x/y sono relative al centro del discardPileContainer.
                    // Quindi dobbiamo aggiungere (pileContainerWidth / 2) - (cardWidth / 2) per centrarle.
                    cardDiv.style.left = `${pos.x + (discardPileContainerRect.width / 2) - (cardWidth / 2)}px`;
                    cardDiv.style.top = `${pos.y + (discardPileContainerRect.height / 2) - (cardHeight / 2)}px`;
                    cardDiv.style.transform = `rotate(${pos.rotate}deg)`;
                    cardDiv.style.zIndex = pos.zIndex; // Z-index per l'ordine di sovrapposizione

                    discardPileContainer.appendChild(cardDiv);
                });

                if (discardLabelSpan) discardLabelSpan.textContent = `SCARTI (${state.discardPile.length})`;
                if (discardDeclaredValueSpan) {
                    const lastPlayedCardDeclaredValue = state.lastPlay ? state.lastPlay.declaredValue : 'N/A';
                    if (lastPlayedCardDeclaredValue && lastPlayedCardDeclaredValue !== 'N/A') { 
                        discardDeclaredValueSpan.textContent = `(Dichiarato: ${lastPlayedCardDeclaredValue})`;
                        discardDeclaredValueSpan.style.display = 'block';
                    } else { discardDeclaredValueSpan.style.display = 'none'; }
                }
                discardPileInfo.style.opacity = '1';

            } else { // Pila degli scarti vuota
                if (discardLabelSpan) discardLabelSpan.textContent = 'SCARTI (0)';
                if (discardDeclaredValueSpan) discardDeclaredValueSpan.style.display = 'none';
                discardPileInfo.style.opacity = '0.7';

                // Se la pila è vuota, aggiungi un placeholder visivo (ad es. il bordo tratteggiato)
                const placeholderDiv = document.createElement('div');
                placeholderDiv.className = 'card back empty-placeholder';
                placeholderDiv.style.width = '100%'; 
                placeholderDiv.style.height = '100%';
                placeholderDiv.style.position = 'absolute';
                placeholderDiv.style.left = '0';
                placeholderDiv.style.top = '0';
                discardPileContainer.appendChild(placeholderDiv);
            }
        } else { // Fallback se i nuovi elementi della pila non sono stati trovati (per compatibilità con HTML vecchio)
            const discardPileDivOld = document.getElementById('discard-pile');
            if (discardPileDivOld) {
                discardPileDivOld.innerHTML = ''; 
                if (state.discardPile && state.discardPile.length > 0) {
                    discardPileDivOld.classList.remove('empty-placeholder');
                    discardPileDivOld.className = 'card back'; 
                    
                    const lastPlayedCardDeclaredValue = state.lastPlay ? state.lastPlay.declaredValue : 'N/A';
                    
                    const labelSpan = document.createElement('span');
                    labelSpan.className = 'discard-label';
                    labelSpan.textContent = `SCARTI (${state.discardPile.length})`;
                    discardPileDivOld.appendChild(labelSpan);

                    let valueSpan = discardPileDivOld.querySelector('.declared-value');
                    if (!valueSpan) { 
                        valueSpan = document.createElement('span');
                        valueSpan.className = 'declared-value';
                    }
                    if (lastPlayedCardDeclaredValue && lastPlayedCardDeclaredValue !== 'N/A') { 
                        valueSpan.textContent = `(Dichiarato: ${lastPlayedCardDeclaredValue})`;
                        valueSpan.style.display = 'block';
                    } else {
                        valueSpan.style.display = 'none';
                    }
                    discardPileDivOld.appendChild(valueSpan);
                    
                    discardPileDivOld.style.opacity = '1'; 
                } else {
                    discardPileDivOld.classList.add('empty-placeholder');
                    discardPileDivOld.className = 'card back empty-placeholder';
                    
                    const labelSpan = document.createElement('span');
                    labelSpan.className = 'discard-label';
                    labelSpan.textContent = 'SCARTI (0)';
                    discardPileDivOld.appendChild(labelSpan);

                    let valueSpan = discardPileDivOld.querySelector('.declared-value');
                    if (valueSpan) { 
                        valueSpan.style.display = 'none';
                    }

                    discardPileDivOld.style.opacity = '0.7';
                }
            }
        }

        const myIdx = me ? state.players.indexOf(me) : -1; 

        opponentVisualSlotOrder.forEach(slotEl => { 
            if (slotEl) {
                slotEl.style.visibility = 'hidden';
                slotEl.classList.remove('eliminated', 'is-turn');
                const nameEl = slotEl.querySelector('.player-name');
                const handEl = slotEl.querySelector('.player-hand');
                if(nameEl) nameEl.textContent = 'In attesa...';
                if(handEl) {
                    handEl.innerHTML = '';
                    handEl.classList.remove('awaiting-round');
                }
            }
        });
        
        if (myIdx !== -1 && state.players.length > 1) { 
            const playersToDisplayInOpponentSlots = [];
            let tempIndex = (myIdx + 1) % state.players.length;
            while (playersToDisplayInOpponentSlots.length < (state.players.length - 1)) {
                if (tempIndex === myIdx) { 
                    tempIndex = (tempIndex + 1) % state.players.length;
                    continue;
                }
                playersToDisplayInOpponentSlots.push(state.players[tempIndex]);
                tempIndex = (tempIndex + 1) % state.players.length;
            }

            playersToDisplayInOpponentSlots.forEach((opponentData, i) => {
                const opponentAreaElement = opponentVisualSlotOrder[i]; 
                if (!opponentAreaElement) {
                    console.warn(`[RENDER STATIC] Nessuno slot visivo disponibile per l'avversario ${opponentData.name} all'indice ${i}.`);
                    return;
                }

                opponentAreaElement.style.visibility = 'visible';
                const nameEl = opponentAreaElement.querySelector('.player-name');
                const handUiDivOpponent = opponentAreaElement.querySelector('.player-hand');

                if (nameEl) nameEl.textContent = opponentData.name;
                if (handUiDivOpponent) {
                    handUiDivOpponent.innerHTML = ''; 
                    handUiDivOpponent.classList.remove('awaiting-round');
                }

                if (opponentData.isEliminated) {
                    opponentAreaElement.classList.add('eliminated');
                    opponentAreaElement.classList.remove('is-turn');
                    if (handUiDivOpponent) handUiDivOpponent.innerHTML = '<p style="color:grey; font-size:0.8em;">ELIMINATO</p>';
                } else {
                    opponentAreaElement.classList.remove('eliminated');
                    opponentAreaElement.classList.toggle('is-turn', opponentData.isTurn);
                    
                    if (handUiDivOpponent) {
                        const tempDivForStyle = document.createElement('div');
                        tempDivForStyle.className = 'card'; 
                        document.body.appendChild(tempDivForStyle);
                        const cardWidth = tempDivForStyle.offsetWidth;
                        document.body.removeChild(tempDivForStyle);

                        const handRect = handUiDivOpponent.getBoundingClientRect();
                        const dynamicOverlap = calculateCardOverlap(opponentData.cardCount, cardWidth, handRect.width);
                        
                        for (let j = 0; j < opponentData.cardCount; j++) {
                            const cardDiv = document.createElement('div');
                            cardDiv.className = 'card back static-in-hand'; 
                            if (j > 0) { 
                                cardDiv.style.marginLeft = `-${dynamicOverlap}px`;
                            }
                            handUiDivOpponent.appendChild(cardDiv);
                        }
                        if (opponentData.cardCount === 0 && !opponentData.isEliminated && !opponentData.isTurn && handUiDivOpponent.children.length === 0) {
                            handUiDivOpponent.innerHTML = '<p class="awaiting-round">Attendendo nuovo round...</p>';
                        }
                    }
                }
            });
        } else if (myIdx === -1) {
            console.warn("[RENDER STATIC] Giocatore corrente non trovato, impossibile renderizzare avversari relativi.");
        }
    } 
});
