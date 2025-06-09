# README
Documentazione del Progetto "Il Bar del Paese": La Mia Creazione
Questo documento è il mio manuale operativo per il progetto "Il Bar del Paese", un'applicazione di gioco multiplayer che ho ideato e sviluppato. Qui, descriverò in dettaglio l'architettura, il funzionamento e le scelte tecnologiche che ho adottato, fornendoti una visione completa di come ho dato vita a questa esperienza interattiva.
1. Panoramica del Mio Progetto
"Il Bar del Paese" è più di un semplice gioco; è un ambiente digitale che ho creato per permettere ai giocatori di connettersi, formare lobby, e immergersi in partite dinamiche, con un focus sull'interazione in tempo reale.
Le Tecnologie che Ho Selezionato:
Per costruire questa applicazione, ho operato una scelta ponderata delle tecnologie, cercando il giusto equilibrio tra flessibilità, performance e familiarità:
Frontend (L'Applicazione che Vede l'Utente Finale sul Telefono):


Apache Cordova: Ho scelto Cordova come spina dorsale della mia applicazione mobile. Mi ha permesso di sfruttare le mie competenze in sviluppo web (HTML, CSS, JavaScript) per creare un'app che può essere deployata sia su Android che (potenzialmente) su iOS, risparmiando tempo e fatica rispetto allo sviluppo nativo separato. È il "browser" che incapsula la mia esperienza web.
HTML5, CSS3, JavaScript (ES6+): Questi sono i mattoni fondamentali della mia interfaccia utente. Ho utilizzato HTML per strutturare i contenuti, CSS per stilizzare l'aspetto e creare un'esperienza visivamente accattivante (con particolare attenzione al tema "medievale"), e JavaScript per implementare tutta la logica interattiva lato client, dalla gestione dei modali alle animazioni di gioco.
Socket.IO Client: Per la comunicazione in tempo reale, che è cruciale per un gioco multiplayer, ho integrato la libreria client di Socket.IO. Questa mi permette di mantenere una connessione persistente e bidirezionale con il mio server, essenziale per gli aggiornamenti istantanei di stato e le azioni di gioco.
Google Fonts ("MedievalSharp"): Ho selezionato questo font specifico per dare un tocco distintivo e coerente con il tema "Bar del Paese", contribuendo all'atmosfera desiderata.
Backend (Il Cervello del Gioco):


Node.js: Ho optato per Node.js come ambiente di runtime per il mio server. La sua natura single-threaded e non bloccante lo rende particolarmente adatto per applicazioni in tempo reale e con molte connessioni simultanee, come un server di gioco.
Express.js: Per strutturare le mie API REST e per servire i file statici della mia applicazione web, ho scelto Express.js. È un framework minimalista e flessibile che mi ha permesso di definire facilmente le rotte e gestire le richieste HTTP.
Socket.IO Server: Questa è la controparte server della libreria client. Mi consente di gestire le connessioni WebSocket, inviare e ricevere eventi in tempo reale da e verso tutti i client connessi, abilitando così la logica multiplayer del gioco.
cors Middleware: Ho incluso il middleware cors (Cross-Origin Resource Sharing) per Express. Questo è fondamentale per permettere al mio frontend (ospitato dall'app Cordova o direttamente da un browser) di fare richieste al mio server, che risiede su un dominio diverso (onrender.com). Senza di esso, le richieste verrebbero bloccate per motivi di sicurezza del browser.
path Modulo: Ho utilizzato il modulo path di Node.js per costruire percorsi di file e directory in modo affidabile, indipendentemente dal sistema operativo del server. Questo è cruciale per servire correttamente i file statici dalla cartella public.
2. L'Architettura che Ho Progettato
Ho adottato un'architettura Client-Server che mette al centro la comunicazione in tempo reale per un'esperienza di gioco fluida e reattiva.
Il Client (La Mia App Cordova): Questa è l'interfaccia utente che i giocatori scaricano sui loro dispositivi. È un'applicazione mobile ibrida, il che significa che, sebbene sia installata come un'app nativa, il suo contenuto principale è una pagina web. Ho progettato questa pagina web per essere leggera e reattiva, focalizzandomi sulla visualizzazione dello stato del gioco e sulla raccolta degli input dell'utente. Ogni interazione significativa, specialmente quelle legate al multiplayer e alla logica di gioco, viene delegata al server.


Il Server (Il Mio Backend Node.js): Questo è il motore nascosto dietro l'esperienza di gioco. L'ho deployato su Render.com, un servizio cloud, rendendolo accessibile via Internet. Il mio server ha diverse responsabilità chiave:


Gestione delle API REST: Ho creato endpoint RESTful (come /crea-lobby, /unisciti-lobby, /avvia-partita) per gestire le operazioni di setup della lobby e le richieste iniziali. Queste API sono utili per azioni che non richiedono una comunicazione costante.
Logica di Gioco Centrale: Tutte le regole del gioco (distribuzione delle carte, gestione dei turni, risoluzione delle sfide "Bugia!", simulazione della Roulette Russa, eliminazioni) sono implementate qui. Questo approccio centralizzato previene i cheat e garantisce che tutti i client abbiano la stessa visione coerente dello stato del gioco.
Comunicazione in Tempo Reale con Socket.IO: Questa è la parte più entusiasmante. Socket.IO mi permette di avere canali di comunicazione aperti e persistenti con ogni client connesso. In questo modo, quando un giocatore fa una mossa, o lo stato del gioco cambia, posso inviare aggiornamenti istantanei a tutti i partecipanti, creando un'esperienza multiplayer davvero dinamica.
Servizio di File Statici: Ho configurato Express per servire tutti i file frontend (HTML, CSS, JS, immagini, audio) dalla cartella public. Questo è fondamentale non solo per i client web che accedono al mio server direttamente via browser, ma anche per la struttura interna del deployment.
3. Il Flusso di Funzionamento Dettagliato
Ho progettato un flusso preciso per garantire che l'applicazione funzioni in modo armonioso dal momento dell'avvio fino alla fine della partita.
3.1 Avvio dell'Applicazione Client (La Mia App Cordova)
Quando un utente lancia la mia app Cordova sul proprio telefono, ecco cosa succede:
Caricamento Iniziale: L'app carica index.html (la pagina della lobby). Questo file è il punto di ingresso visivo dell'app.
Preparazione delle Risorse: index.html fa riferimento a tutte le risorse necessarie:
I miei stili personalizzati in css/styleottimizzato.css (che ora gestisce anche direttive specifiche per Cordova).
La libreria socket.io.min.js da un CDN per la connettività in tempo reale.
Il mio JavaScript della lobby, js/scriptottimizzato.js, che contiene la logica dell'interfaccia utente e l'interazione con il server.
E, crucialmente, cordova.js. Questo file non è creato da me, ma è "iniettato" magicamente da Cordova stesso durante il processo di build dell'APK. È la "colla" che permette al mio codice web di parlare con le funzionalità native del telefono.
Il Segnale "Deviceready": Ho imparato che in un'app Cordova, non si può semplicemente iniziare a eseguire codice JavaScript che dipende da Cordova appena il DOM è pronto. Bisogna aspettare l'evento deviceready. Per questo, nel mio scriptottimizzato.js, ho avvolto tutta la logica di inizializzazione all'interno di un listener per document.addEventListener('deviceready', initializeApp, false);. Questo mi garantisce che l'ambiente nativo del dispositivo sia completamente caricato e che le API di Cordova siano disponibili.
Connessione al Mio Server Remoto: Solo dopo che deviceready è stato scatenato, scriptottimizzato.js avvia la connessione a Socket.IO e comincia a effettuare richieste API REST al mio server backend, utilizzando l'URL pubblico di Render: https://cordova-ie4q.onrender.com/. Questo passaggio è vitale perché tutte le interazioni multiplayer dipendono da questa connessione.
3.2 Funzionalità della Lobby: Il Punto d'Incontro
Ho implementato un robusto sistema di lobby per permettere ai giocatori di organizzarsi prima di iniziare una partita. Il frontend (index.html/scriptottimizzato.js) interagisce con il backend tramite API REST e Socket.IO:
Creazione di una Nuova Lobby:
L'utente inserisce un nome tramite un prompt (interfaccia client).
Il client genera un codice lobby casuale (es. "ABC123").
Una richiesta POST viene inviata all'endpoint /crea-lobby sul server.
Il server registra la nuova lobby nel suo stato in-memory (lobbies), associandola a un ownerSocketId (che sarà il socket del creatore della lobby).
Immediatamente dopo, il client si unisce a una stanza Socket.IO specifica per quel codice lobby, preparando il terreno per le comunicazioni in tempo reale.
Unione a una Lobby Esistente:
L'utente inserisce un codice lobby e un nome.
Una richiesta POST a /unisciti-lobby viene inviata al server.
Il server esegue una serie di controlli: verifica se la lobby esiste, se è già in gioco, se è piena (massimo 4 giocatori) e se il nome del giocatore è già in uso all'interno di quella lobby.
Se tutti i controlli passano, il server aggiunge il nuovo giocatore alla lista della lobby e, tramite Socket.IO, emette un evento update-players a tutti i client connessi a quella lobby. Questo aggiorna le liste dei giocatori in tempo reale.
Chiusura Forzata della Lobby (dal Proprietario):
Quando il proprietario della lobby (il creatore) chiude il modale di creazione lobby, viene inviata una richiesta POST a /chiudi-lobby.
Il server rimuove la lobby dal suo stato in-memory e, tramite Socket.IO, invia un evento lobby-closed a tutti i client nella stanza della lobby, informandoli che la lobby non esiste più.
Abbandono della Lobby (da un Giocatore):
Se un giocatore si disconnette o decide di lasciare la lobby, viene inviata una richiesta POST a /lascia-lobby.
Il server filtra il giocatore dalla lista della lobby. Se il proprietario si disconnette, il server può riassegnare la proprietà al giocatore successivo nella lista. Se la lobby si svuota completamente, viene chiusa. Gli altri client vengono notificati con un update-players aggiornato.
Avvio della Partita:
Una volta che la lobby ha esattamente 4 giocatori, il pulsante "Avvia Partita" viene abilitato per il proprietario.
Cliccando, il client invia una richiesta POST a /avvia-partita.
Il server cambia lo stato della lobby a 'in-game', inizializza il gameState (distribuzione dei mazzi, assegnazione del turno iniziale, ecc.).
Il server emette un evento game-started a tutti i client della lobby.
Al ricevimento di questo evento, ogni client reindirizza la propria window.location.href alla pagina gioco.html, passando parametri cruciali come il codice della lobby (code) e il nome del giocatore (player) nell'URL.
3.3 Funzionalità di Gioco: Il Campo di Battaglia
Una volta che i giocatori vengono reindirizzati a gioco.html, la vera esperienza di gioco prende vita.
Caricamento della Pagina di Gioco:
gioco.html carica i suoi stili (css/gioco.css) e script (js/gioco.js). Ho incluso qui anche i riferimenti agli elementi audio per gli effetti sonori del gioco.
gioco.js recupera il code e il player dall'URL per identificare il giocatore e la partita in corso.
Si connette anch'esso al server tramite Socket.IO, e una volta connesso, emette un evento player-ready-in-game al server, segnalando la sua presenza nella partita.
Sincronizzazione dello Stato (game-state-update):
Questo è l'evento Socket.IO più importante. Il server invia un game-state-update a tutti i client ogni volta che lo stato del gioco cambia.
Ogni client riceve una versione personalizzata dello stato (ad esempio, solo la propria mano è visibile, mentre degli avversari si vede solo il conteggio delle carte).
gioco.js analizza questo stato e aggiorna dinamicamente l'interfaccia utente: carte in mano, pila degli scarti, tipo di tavolo, indicatore del giocatore di turno, e lo stato dei pulsanti di azione.
Vengono gestite animazioni come la distribuzione delle carte o l'esito della Roulette Russa.
Azioni Interattive del Giocatore:
Giocare Carte (play-cards): Durante il proprio turno, i giocatori selezionano le carte dalla loro mano cliccandole. Una volta selezionate, il pulsante "GIOCA CARTE" si abilita. Cliccando, il client invia un evento play-cards al server con le carte scelte. Il server verifica la validità della mossa, aggiorna lo stato del gioco, e passa il turno al giocatore successivo.
Chiamare "BUGIA!" (call-liar): Se non è il proprio turno e c'è stata una giocata precedente (non la propria), il pulsante "BUGIA!" si abilita. Cliccando, il client invia un evento call-liar. Il server verifica se l'ultima giocata era effettivamente una bugia. L'esito della sfida determina chi dovrà affrontare la Roulette Russa.
Giocare alla Roulette Russa (play-russian-roulette): Se un giocatore è designato per la Roulette Russa (a seguito di una sfida "Bugia!"), il pulsante "SPARA!" si abilita per lui. Cliccando, il client invia play-russian-roulette. Il server simula la pesca di una carta dal mazzo revolver personale del giocatore: se è "Letale", il giocatore viene eliminato; altrimenti, è "A Salve". L'esito viene mostrato a tutti.
Fine Round (round-over): Quando un giocatore finisce le carte in mano o una sfida "Bugia!" viene risolta, il server emette un evento round-over. Questo indica il vincitore del round e avvia un breve conto alla rovescia prima di iniziare un nuovo round con una nuova distribuzione di carte.
Fine Partita (game-over): Se, a seguito di un'eliminazione o di una disconnessione, il numero di giocatori attivi scende a uno o meno, il server emette un evento game-over. Questo comunica il vincitore (se presente) e il motivo della fine. Il client, al ricevimento, reindirizza l'utente alla pagina della lobby.
Gestione Disconnessioni (disconnect): Il server monitora costantemente le connessioni Socket.IO. Se un client si disconnette inaspettatamente, il server gestisce la situazione rimuovendo il giocatore dalla lobby (se in attesa) o segnandolo come "offline" (se in gioco) e controllando se la disconnessione porta alla fine della partita.
4. La Mia Struttura dei File
Ho organizzato i file in due progetti distinti per una chiara separazione delle responsabilità.
4.1 Il Mio Progetto Cordova (L'App Mobile che Compilo Localmente)
Questa è la struttura della mia applicazione web che Cordova "impacchetta" in un'app nativa.
myFirstApp/                   <-- La cartella radice del mio progetto Cordova
├── platforms/                <-- Qui Cordova genera il codice nativo (Android Studio project). Io non la tocco manualmente, tranne per 'gradle-wrapper.properties'.
│   ├── android/              
│   │   └── gradle/           
│   │       └── wrapper/      
│   │           └── gradle-wrapper.properties  <-- Ho modificato questo file per specificare la versione di Gradle (es. 8.14.1) compatibile con il mio JDK.
│   └── (altre piattaforme come ios/)
├── plugins/                  <-- Qui Cordova gestisce i plugin nativi. Io non la tocco manualmente.
├── www/                      <-- IL CUORE DELLA MIA APP CORDOVA. Qui risiede il mio codice web.
│   ├── index.html            <-- La pagina principale della lobby. L'ho modificata per includere le meta tag di Cordova e la Content Security Policy (CSP) per permettere le connessioni al mio server Render e i font di Google.
│   ├── gioco.html            <-- La pagina di gioco. Anche questa ha le meta tag di Cordova e la CSP aggiornata.
│   ├── cordova.js            <-- Questo file NON è creato da me, ma è "iniettato" da Cordova durante la build dell'APK. Il mio HTML lo linka come se fosse nella root di www.
│   ├── css/                  <-- Qui tengo tutti i miei fogli di stile.
│   │   ├── styleottimizzato.css <-- Il CSS per la lobby. Ho integrato qui le direttive CSS di Cordova per la responsività su mobile (`env(safe-area-inset)`).
│   │   └── gioco.css         <-- Il CSS per la pagina di gioco. Ho fatto la stessa integrazione delle direttive Cordova e mi sono assicurato che i percorsi delle immagini (`url()`) fossero corretti rispetto a questa sottocartella.
│   ├── js/                   <-- Qui organizzo i miei script JavaScript.
│   │   ├── scriptottimizzato.js <-- Il JS per la lobby. Ho modificato gli URL delle chiamate fetch e Socket.IO per puntare al mio server Render, e ho incapsulato la logica in una funzione `initializeApp()` chiamata al `deviceready`.
│   │   ├── gioco.js          <-- Il JS per la pagina di gioco. Anche qui ho aggiornato gli URL del server e ho usato `deviceready`.
│   │   └── index.js          <-- Questo è il file JS di Cordova auto-generato. L'ho mantenuto come richiesto, ma nel mio codice non lo uso attivamente, e potrei anche commentarlo nel mio HTML per evitare potenziali conflitti.
│   ├── img/                  <-- Immagini di sfondo della lobby e placeholder degli avatar.
│   │   ├── 20250531_1853_Bar Medievale Realistico_simple_compose_01jwkm26dqenr8zq8b73yjxhdv.png
│   │   └── avatar-placeholder.png
│   ├── immagini/             <-- Immagini specifiche del gioco, come il revolver e il dorso delle carte. Ho dovuto creare questa sottocartella per organizzare meglio le risorse.
│   │   ├── revolver.png
│   │   └── card-back.png
│   ├── audio/                <-- Tutti i file audio del gioco.
│   │   ├── carica.mp3
│   │   ├── panic.mp3
│   │   ├── boom.mp3
│   │   ├── vuoto.mp3
│   │   └── card_deal.mp3
│   └── ... (altri file auto-generati da Cordova, es. icone, splash screen)
├── config.xml                <-- Il file di configurazione principale di Cordova. Contiene metadati dell'app, plugin installati e impostazioni di build.
├── package.json              <-- Il package.json del progetto Cordova. Gestito da Cordova CLI, non lo modifico manualmente per le dipendenze.
├── package-lock.json         <-- Generato da npm per le dipendenze di Cordova.
└── .gitignore                <-- Fondamentale! Questo file mi dice quali cartelle e file NON caricare su Git (es. `node_modules/`, `platforms/`).


4.2 Il Mio Progetto Server (Il Backend Deployato su Render.com)
Questa è la struttura del codice del mio server Node.js che carico su GitHub e che Render.com utilizza per eseguire il deployment.
myGameServer/                 <-- La cartella radice del mio repository Git per il server
├── index.js                  <-- Il mio file server principale (che prima si chiamava `server.js`). L'ho rinominato `index.js` perché Render e Node.js lo cercano come default. Ho modificato la porta per usarla dinamicamente da Render (`process.env.PORT`).
├── package.json              <-- Questo file DICHIARA tutte le dipendenze del mio server (`express`, `cors`, `socket.io`). L'ho creato/aggiornato con le versioni corrette e gli script di avvio (`"main": "index.js"`, `"start": "node index.js"`).
├── yarn.lock                 <-- O `package-lock.json` se uso npm. Questo file è generato da `yarn install` (o `npm install`) localmente e assicura che Render installi le versioni esatte delle dipendenze.
├── public/                   <-- Questa cartella CONTIENE TUTTI i file frontend che il server deve servire via HTTP/HTTPS. È una COPIA strutturata della mia cartella `www` di Cordova.
│   ├── index.html            <-- Copia del `www/index.html` del progetto Cordova. Contiene gli URL aggiornati del server Render e la CSP corretta.
│   ├── gioco.html            <-- Copia del `www/gioco.html` del progetto Cordova. Anche questo con URL server e CSP aggiornati.
│   ├── cordova.js            <-- **Cruciale:** Ho copiato questo file generato da Cordova (dopo una `cordova build`) direttamente qui. È necessario per il testing dell'app web nel browser e per evitare errori 404/MIME type.
│   ├── css/
│   │   ├── styleottimizzato.css <-- Copia del mio CSS.
│   │   └── gioco.css         <-- Copia del mio CSS. Ho corretto i percorsi delle immagini (`url('../immagini/...')` o `url('../img/...')`) qui, perché sono relativi alla posizione del CSS.
│   ├── js/
│   │   ├── scriptottimizzato.js <-- Copia del mio JS della lobby.
│   │   ├── gioco.js          <-- Copia del mio JS di gioco. Ho corretto i percorsi delle immagini/audio qui (`../immagini/...`, `../audio/...`) e gli URL del server Socket.IO/fetch.
│   │   └── index.js          <-- Copia del JS di Cordova.
│   ├── img/                  <-- Copia della mia cartella `www/img/`.
│   │   ├── 20250531_1853_Bar Medievale Realistico_simple_compose_01jwkm26dqenr8zq8b73yjxhdv.png
│   │   └── avatar-placeholder.png
│   ├── immagini/             <-- Copia della mia cartella `www/immagini/`.
│   │   ├── revolver.png
│   │   ├── card-back.png
│   │   └── tavolo_non_pixelato.png
│   ├── audio/                <-- Copia della mia cartella `www/audio/`.
│   │   ├── carica.mp3
│   │   ├── panic.mp3
│   │   ├── boom.mp3
│   │   ├── vuoto.mp3
│   │   └── card_deal.mp3
│   └── ... (altri file statici come robots.txt, favicon.ico)
└── .gitignore                  <-- **Essenziale:** Contiene `node_modules/` per evitare di caricarla su Git.


5. Configurazione e Deployment: I Passi che Ho Seguito
Ho imparato che il successo di un progetto così complesso risiede nella meticolosità della configurazione.
5.1 Configurazione del Mio Ambiente Locale (per Sviluppo e Build Cordova)
Preparazione degli Strumenti: Ho installato Node.js (con npm/Yarn), Cordova CLI, e Android Studio. Mi sono assicurato che Android Studio avesse tutte le versioni necessarie dell'SDK Android e un JDK Java compatibile.
Variabili d'Ambiente: Ho dedicato tempo a configurare correttamente le variabili d'ambiente di sistema (ANDROID_HOME, JAVA_HOME) e ad aggiungerle al Path. Ho verificato la loro corretta impostazione con echo e where dal terminale.
Gestione di Gradle: Il punto più ostico! Ho capito che il progetto Cordova usa un "Gradle Wrapper" la cui versione è specificata in platforms/android/gradle/wrapper/gradle-wrapper.properties. Ho modificato questo file per puntare a Gradle 8.14.1, sapendo che questa versione è compatibile con il mio JDK Java 24. Ho anche imparato a pulire la cache di Gradle (.gradle/caches e .gradle/wrapper/dists) per forzare un nuovo download del wrapper.
5.2 Il Deployment del Mio Server su Render.com
Dopo aver configurato il backend e il frontend, ho preparato il mio server per il cloud:
Preparazione del File Server (index.js):


Ho modificato la riga della porta in const port = process.env.PORT || 3000;. Questo permette a Render di assegnare dinamicamente una porta al mio server, mentre 3000 è la porta di fallback per i miei test locali.
Ho riorganizzato l'ordine delle rotte Express: Ho spostato app.use(express.static(path.join(__dirname, 'public'))); prima di app.get('/', ...) per garantire che tutte le richieste di file statici (come cordova.js, CSS, JS) vengano gestite correttamente da express.static prima che la rotta generica per la homepage possa intercettarle e servirle con il tipo MIME sbagliato.
Organizzazione della Cartella public/: Questa è stata cruciale. Ho copiato manualmente tutto il contenuto della mia cartella www del progetto Cordova (HTML, CSS, JS, immagini, audio, e cordova.js stesso) nella cartella public/ del mio progetto server. Mi sono assicurato che la struttura delle sottocartelle (es. public/css/, public/js/, public/img/, public/immagini/, public/audio/) fosse coerente.


Aggiornamento del package.json: Ho verificato che il package.json nel mio progetto server includesse tutte le dipendenze essenziali (express, cors, socket.io) nella sezione "dependencies" e che gli script di avvio ("main": "index.js", "start": "node index.js") fossero corretti. Ho eseguito yarn install localmente per generare un yarn.lock (o package-lock.json) aggiornato, che è vitale per Render per installare le dipendenze correttamente.


Versionamento con Git & GitHub:


Ho creato un repository Git per il mio progetto server.
Ho usato .gitignore per escludere la cartella node_modules/ (e altri file non necessari) dal versionamento, mantenendo il repository pulito e leggero.
Ho fatto un commit e un push di tutte le modifiche (specialmente i file nella cartella public/ e il yarn.lock) al mio repository GitHub.
Configurazione su Render:


Ho creato un nuovo servizio web su Render.com, collegandolo al mio repository GitHub.
Render ha rilevato il mio ambiente Node.js e le dipendenze, eseguendo automaticamente il comando di build (yarn install).
Render mi ha fornito l'URL pubblico per il mio server (es. https://cordova-ie4q.onrender.com/).
Aggiornamento del Codice Client (di nuovo!):


Nel mio index.html e gioco.html (che si trovano nella cartella www del mio progetto Cordova), ho aggiornato tutti i riferimenti al server da http://localhost:3000 al nuovo URL pubblico di Render (https://cordova-ie4q.onrender.com/), usando HTTPS per la sicurezza.
Ho modificato la Content Security Policy (CSP) in questi file HTML per includere il nuovo dominio Render (sia HTTP che WebSocket wss://) e https://fonts.gstatic.com per i font di Google.
Build Finale dell'APK:


Dopo aver completato tutte le modifiche e gli aggiornamenti al codice client, ho eseguito cordova build android nel mio progetto Cordova per generare un nuovo APK.
Questo percorso, sebbene a volte impegnativo, mi ha permesso di creare un'applicazione di gioco multiplayer funzionale e deployata. Ogni passaggio, ogni errore, mi ha insegnato un dettaglio cruciale sulla gestione di un'architettura client-server ibrida.


