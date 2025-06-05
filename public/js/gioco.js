document.addEventListener('deviceready', () => { // Usiamo 'deviceready' per app Cordova
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
    const discardPileDiv = document.getElementById('discard-pile');
    const challengeInfoDiv = document.getElementById('challenge-info');
    const rouletteOutcomeDiv = document.getElementById('roulette-outcome-info'); 
    const gameNotificationsDiv = document.getElementById('game-notifications');

    const audioSigh = document.getElementById('audio-sigh');
    const audioRevolver = document.getElementById('audio-revolver');
    const audioShot = document.getElementById('audio-shot');
    const audioClick = document.getElementById('audio-click');
    const audioCardDeal = document.getElementById('audio-card-deal'); 

    let currentGameState = null; 
    let isAnimatingDeal = false; 
    let selectedCards = []; 

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

        const cardsToPlayValues = selectedCards.map(cardEl => cardEl.textContent);
        
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
        
        currentGameState = gameState; 
        
        const meInCurrentState = gameState.players.find(p => p.name === myPlayerName);
        const myCurrentCardCount = meInCurrentState && meInCurrentState.isEliminated === false ? gameState.myHand.length : 0;
        
        const isNewDeal = (gameState.roundNumber !== previousRound) || 
                               (gameState.roundNumber === previousRound && previousMyCardCount === 0 && myCurrentCardCount > 0 && !gameState.challenge);
        
        if (isNewDeal && !isAnimatingDeal) {
            console.log(`[${myPlayerName}] Rilevato nuovo deal (Round ${gameState.roundNumber}). Avvio animazione distribuzione.`);
            isAnimatingDeal = true;
            // Rimuovi le carte esistenti prima dell'animazione
            document.querySelectorAll('.player-hand').forEach(ph => ph.innerHTML = ''); 
            document.querySelectorAll('.player-hand').forEach(ph => ph.style.opacity = '0'); 
            document.querySelectorAll('.player-hand p').forEach(p => p.remove());

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
        const cardWidth = tempDivForStyle.offsetWidth;
        const cardHeight = tempDivForStyle.offsetHeight;
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
                const dynamicOverlap = calculateCardOverlap(numCardsThisPlayerHas, cardWidth, handRect.width);
                
                const totalVisibleWidthInHand = cardWidth + (numCardsThisPlayerHas - 1) * (cardWidth - dynamicOverlap);
                const startXInHand = (handRect.width - totalVisibleWidthInHand) / 2; 
                
                const targetCardAbsX = handRect.left - gameBoardRect.left + startXInHand + (cardIdx * (cardWidth - dynamicOverlap));
                const targetCardAbsY = handRect.top - gameBoardRect.top + (handRect.height / 2) - (cardHeight / 2);
                
                const translateX = targetCardAbsX - parseFloat(flyingCard.style.left); 
                const translateY = targetCardAbsY - parseFloat(flyingCard.style.top); 

                const delay = (cardIdx * state.players.length + playerOrderIdx) * 60; 

                setTimeout(() => {
                    void flyingCard.offsetWidth; 
                    flyingCard.style.transform = `translate(${translateX}px, ${translateY}px) scale(1) rotate(${Math.random() * 6 - 3}deg)`;
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

    function animatePlayedCard(cardElement) {
        return new Promise(resolve => {
            if (!animationLayer || !gameBoard || !discardPileDiv || !cardElement) {
                console.error("[ANIM CARD] Elementi necessari per animazione carta giocata mancanti o cardElement nullo.");
                if (cardElement && cardElement.parentNode) cardElement.remove(); 
                resolve(); 
                return;
            }

            const flyingCard = cardElement.cloneNode(true);
            const cardRect = cardElement.getBoundingClientRect(); 
            const gameBoardRect = gameBoard.getBoundingClientRect();
            const discardRect = discardPileDiv.getBoundingClientRect(); 

            flyingCard.classList.remove('static-in-hand', 'playable', 'selected'); 
            flyingCard.classList.add('flying-card'); 
            
            flyingCard.style.left = `${cardRect.left - gameBoardRect.left}px`;
            flyingCard.style.top = `${cardRect.top - gameBoardRect.top}px`;
            flyingCard.style.opacity = '1';
            flyingCard.style.transform = 'scale(1)'; 
            animationLayer.appendChild(flyingCard);
            
            cardElement.remove();

            const targetX = discardRect.left + discardRect.width / 2 - gameBoardRect.left - (flyingCard.offsetWidth / 2);
            const targetY = discardRect.top + discardRect.height / 2 - gameBoardRect.top - (flyingCard.offsetHeight / 2);

            void flyingCard.offsetWidth; 
            
            flyingCard.style.transition = 'transform 0.5s ease-out, opacity 0.5s ease-out';
            flyingCard.style.transform = `translate(${targetX - parseFloat(flyingCard.style.left)}px, ${targetY - parseFloat(flyingCard.style.top)}px) scale(0.8) rotate(${Math.random() * 10 - 5}deg)`;
            flyingCard.style.opacity = '0.7'; 

            flyingCard.addEventListener('transitionend', function handler() {
                if (flyingCard.parentNode) flyingCard.remove();
                resolve(); 
                this.removeEventListener('transitionend', handler);
            }, { once: true });
        });
    }

    function animateGunShot(targetPlayerAreaElement) {
        return new Promise(resolve => {
            if (!animationLayer || !gameBoard || !targetPlayerAreaElement) {
                console.error("[ANIM GUN] Elementi necessari per animazione pistola mancanti.");
                resolve(); 
                return;
            }
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
                        
                        // Qui viene riprodotto il suono di sparo/click, basato sull'esito reale della roulette
                        // che arriva con il game-state-update, non qui durante l'animazione.
                        // L'audio è gestito dalla funzione `renderStaticGameBoard` al ricevere l'esito della roulette.

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
                        const cardWidth = tempDivForStyle.offsetWidth;
                        document.body.removeChild(tempDivForStyle);
                        
                        const handRect = myHandUiDiv.getBoundingClientRect();
                        const dynamicOverlap = calculateCardOverlap(state.myHand.length, cardWidth, handRect.width);
                        
                        selectedCards = []; 

                        state.myHand.forEach((cardValue, cardIndex) => {
                            const cardDiv = document.createElement('div');
                            cardDiv.className = 'card static-in-hand';
                            cardDiv.textContent = cardValue;
                            
                            if (cardIndex > 0) {
                                cardDiv.style.marginLeft = `-${dynamicOverlap}px`;
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
            } else {
                console.warn(`[RENDER STATIC] Giocatore ${myPlayerName} non trovato nello stato. Nascondo la sua area.`);
                myPlayerAreaDOM.style.visibility = 'hidden';
            }
        } else {
            console.error("[RENDER STATIC] myPlayerAreaDOM non trovato!");
        }

        if (discardPileDiv) {
            discardPileDiv.innerHTML = ''; 
            if (state.discardPile && state.discardPile.length > 0) {
                discardPileDiv.classList.remove('empty-placeholder');
                discardPileDiv.className = 'card back'; 
                
                const lastPlayedCardDeclaredValue = state.lastPlay ? state.lastPlay.declaredValue : 'N/A';
                
                const labelSpan = document.createElement('span');
                labelSpan.className = 'discard-label';
                labelSpan.textContent = `SCARTI (${state.discardPile.length})`;
                discardPileDiv.appendChild(labelSpan);

                if (lastPlayedCardDeclaredValue && lastPlayedCardDeclaredValue !== 'N/A') { 
                    const valueSpan = document.createElement('span');
                    valueSpan.className = 'declared-value';
                    valueSpan.textContent = `(Dichiarato: ${lastPlayedCardDeclaredValue})`;
                    discardPileDiv.appendChild(valueSpan);
                }
                
                discardPileDiv.style.opacity = '1'; 
            } else {
                discardPileDiv.classList.add('empty-placeholder');
                discardPileDiv.className = 'card back empty-placeholder';
                
                const labelSpan = document.createElement('span');
                labelSpan.className = 'discard-label';
                labelSpan.textContent = 'SCARTI (0)';
                discardPileDiv.appendChild(labelSpan);

                discardPileDiv.style.opacity = '0.7';
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