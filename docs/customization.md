# Personalizzare la distribuzione

La prima versione lavora sul caso sintetico degli ordini. Per applicarla a un repository aziendale bisogna adattare soprattutto il contratto di verifica e i documenti di progetto. I plugin restano separati dai sorgenti upstream DSH.

| Esigenza | Punto da modificare | Prova richiesta |
|---|---|---|
| Collegare il modello aziendale | Configurazione del launcher: endpoint, identificativo modello, nome della variabile credenziale | Task completo con lettura, modifica, errore e uso degli strumenti |
| Applicare convenzioni del team | Documenti curati in `company-knowledge` | Il contesto contiene le regole pertinenti e rispetta il budget |
| Cambiare le informazioni ricordate | Schema in `company-task-state` e selezione in `company-context` | Reload, dati mancanti, versione dello schema e isolamento fra task |
| Aggiungere uno strumento | Registro e guardia di `company-bundle` | Argomenti validati, accesso limitato e fallimento esplicito |
| Lavorare su un'altra applicazione | Suite e bridge in `company-verification` | Candidato difettoso rifiutato e riferimento corretto accettato dalla stessa suite |
| Usare lavoratori esterni | Controller e adapter in `company-delegation`, profilo ibrido | Sequenza, autenticazione, isolamento effettivo e recupero dopo interruzione |

## Esempio: passare dal caso ordini a un servizio del team

Scegliere inizialmente un singolo problema riproducibile: per esempio un mapping errato di stati in un servizio. Preparare un workspace piccolo e dati sintetici, con la riproduzione del difetto. Definire gli input e gli output osservabili che devono cambiare e le regressioni da impedire.

Realizzare poi un bridge che esponga solo le operazioni necessarie alla suite. Il verificatore host deve possedere le aspettative; l'applicazione candidata restituisce risultati da controllare. Preparare una soluzione corretta di riferimento per qualificare la suite e conservarla fuori dal workspace del lavoratore. Fissare una nuova versione della suite.

Infine aggiungere la mappa del servizio, i comandi pertinenti e le convenzioni curate del team. Eseguire una prova completa con il modello scelto, mantenendo invariati prompt e suite durante le ripetizioni valutate. Un successo nel caso ordini non qualifica automaticamente il nuovo servizio.

## Aggiungere informazioni senza perdere il controllo

Il contesto dà priorità a obiettivo, criteri, fase, tentativi, evidenze e verifiche pendenti. Documenti e cronologia usano lo spazio restante. Una modifica al formato deve mantenere questo ordine e gestire esplicitamente dati obbligatori che superano il budget.

Le convenzioni fornite sono esempi della demo. Il team deve assegnare un responsabile e una versione ai documenti usati realmente. Per il primo pilot conviene selezionare pochi documenti attendibili e aggiornati; una ricerca documentale più ampia potrà essere aggiunta quando esiste un problema concreto di selezione.

Per la memoria scrivibile usare il percorso ristretto `company_task_note`: ipotesi e controlli vengono aggiunti, con limiti e controllo del contesto prima del salvataggio. `TaskStore.updateInvestigation` è un'API host più ampia e non va esposta direttamente al modello. Note, identità della sessione e autorità di verifica devono restare separate.

## Modificare strumenti e verifica

Ogni nuovo strumento amplia ciò che il modello può chiedere al prodotto di fare. La sua implementazione deve ricevere dal runtime l'identità della sessione e il workspace autorizzato; il modello fornisce soltanto gli argomenti dell'operazione. Le operazioni che producono attestazioni rimangono di proprietà dell'host.

Per introdurre terminale o comandi di build di un repository generico, definire prima l'ambiente di esecuzione, le risorse accessibili e la raccolta dell'esito. Il prototipo usa strumenti per file e un verificatore specifico per mantenere questo confine verificabile.

Cambiare la suite richiede una nuova qualificazione del difetto e della soluzione di riferimento. Dopo ogni modifica del candidato serve un rapporto attuale: una ricevuta precedente o il testo finale di un lavoratore non autorizzano la nuova consegna.

## Aggiornare DSH

La versione iniziale è fissata a `0.2.0-rc.2`. Prima di un aggiornamento controllare API dei plugin, comportamento dei preset, middleware, provider e formato delle sessioni. Eseguire caricamento del runtime reale, prove degli strumenti e installazione pulita dell'artefatto. Le API dei sorgenti master possono differire da quelle pubblicate: mantenere coerente la famiglia di pacchetti scelta.

Separare l'aggiornamento del programma da quello dei dati. Conservare backup e versione della distribuzione precedente; quando cambia uno schema, fornire una migrazione esplicita oppure mantenere separati i vecchi dati. Non correggere a mano i flag di un task per far apparire riuscita una verifica.

## Aggiornare il lock portabile

`distribution/runtime-package-lock.json` è il lock mantenuto del consumatore; il worker Linux ha un lock distinto in `packages/company-delegation/runtime`. Dopo un cambiamento intenzionale delle dipendenze compilare e usare `node distribution/build.mjs --prepare-lock`: il risultato è una directory preparatoria, senza manifest di consegna. In quella directory eseguire `npm install --package-lock-only --include=optional --ignore-scripts --no-audit --no-fund`, quindi riportare il solo `package-lock.json` nel lock mantenuto. Esaminare versioni, URL e integrità prima del commit. Il normale builder non risolve nuove dipendenze.

Aggiornare separatamente il lock worker, conservando le dipendenze native opzionali Linux. Eseguire poi `pnpm test` e `pnpm qualify:runtime`; per qualificare il worker serve anche l'effettivo build/run Linux nell'ambiente previsto. La generazione di un lock su Windows non dimostra quest'ultima prova.
