# Qualificazione del runtime e della distribuzione

13 ottobre 2026. Questa scheda registra prove effettuate sul runtime pubblicato, separatamente dalle prove del nostro agente.

## Versioni selezionate

- Node.js: 24.13.0 su Windows.
- pnpm: 10.30.1.
- Famiglia di pacchetti DSH: **0.2.0-rc.2**, senza mescolare pacchetti alpha.
- Cordis: 4.0.4.
- npm del consumatore: 11.12.0; Codex worker 0.153.4 e Claude Agent SDK 0.3.263.

Il ramo master DSH esaminato è `d743267388641bc76f17c45ce8b4c231aed1d32c`, versione 0.2.1-alpha.2. Alcuni esempi di quel ramo usano interfacce diverse dalla release scelta. Per implementare il bundle sono stati controllati anche JavaScript, dichiarazioni TypeScript e README dei tarball pubblicati.

## Prove eseguite

| Prova | Esito osservato |
|---|---|
| Installazione isolata di DSH e dei provider nativi Codex e Claude Code | Riuscita: 628 pacchetti, payload Windows dei due worker presenti |
| CLI installata, help e versione | Riuscita: versione 0.2.0-rc.2 |
| Creazione di un profilo dal template web | Riuscita: manifest generato con bundle base e web-app |
| Composizione configurazione SDK minima | Riuscita |
| Composizione web con endpoint locale e provider DeepSeek predefiniti disabilitati | Riuscita |
| Bundle aziendale nel runtime SDK reale | Fixture SSE deterministica con strumenti di sessione, note persistenti, accesso fuori workspace rifiutato, due richieste di correzione e stato `needs_review`; il catalogo interno finale ha sette strumenti |
| Avvio ripetuto del profilo Web | Riuscito: composizione ripetuta e server HTTP autenticato; corretta l'opzione ammessa solo alla prima creazione del profilo |
| UI Web nel browser | Osservata: avviso preview, preset Company evidence workflow e modello esplicitamente configurato; nessun prompt di inferenza inviato |
| Installazione compilata fuori dal repository | Riuscita tramite vero `npm ci`: 543 pacchetti, cinque moduli compilati e subpath Docker, due composizioni DSH, verifica del seed senza isolamento e ripresa delle note |
| Lock e contenuti della distribuzione | Lock portabile mantenuto, lock worker con dipendenze opzionali Linux, manifest con schema/suite/versioni e hash; inventario controllato prima e dopo installazione e alterazione del seed rifiutata |
| Bootstrap worker DSH compilato senza credenziali | Restituisce `AUTH_UNAVAILABLE` attraverso la CLI reale; non è una richiesta autenticata o una prova di inferenza |
| Esportazione dello schema della configurazione web | Fallita su quattro righe native del runtime; non usata come criterio di riuscita del nostro bundle |
| Inferenza reale del modello interno | Non eseguita: endpoint e modello da configurare |
| Delega nativa autenticata | Non eseguita in questa qualificazione |
| Isolamento Docker | Da qualificare: avvio Docker Desktop tentato, ma il backend si arresta nell'inizializzazione del servizio di inferenza; il daemon non risponde entro il timeout |

La composizione di una configurazione valida non dimostra che un modello sia raggiungibile o che esegua correttamente gli strumenti.

Le richieste SSE controllate verificano il collegamento fra adapter, loop DSH e strumenti del prodotto. Non sono risposte di un modello e non entrano nei risultati di valutazione dell'agente. La verifica Web automatica e l'ispezione del browser sono prove del caricamento dell'interfaccia.

Al termine dell'integrazione iniziale: 56 test superati e una prova Docker live esplicitamente saltata; typecheck e build riusciti. Le due regressioni successive sui confini dei percorsi portano la suite del bundle da sei a otto test, tutti superati. La revisione indipendente ha verificato anche la correzione del riutilizzo di vecchie ricevute e delle varianti maiuscole di `.git` su Windows.

La diagnosi locale successiva mostra le distribuzioni WSL ferme e un errore del backend Docker relativo al listener `dockerInference` (`The file cannot be accessed by the system`). Non sono stati eseguiti reset di Docker, cancellazioni dei suoi dati o modifiche alle impostazioni globali. Questo impedimento riguarda l'ambiente di qualificazione; il percorso non isolato di sviluppo non lo sostituisce ai fini del completamento verificato.

## Distribuzione e controlli finali

`pnpm qualify:runtime` costruisce l'artefatto, lo copia fuori dal checkout e installa dal lock mediante `npm ci --omit=dev --include=optional --ignore-scripts`. Mantiene `qualification.json` accanto al runtime con percorso effettivo, hash dell'inventario e dei lock, commit e indicazione di sorgente modificato. Il manifest non è una firma: conservarlo insieme al rapporto dell'artefatto verificato. La prova è su Windows; l'immagine worker Linux non è stata costruita o eseguita su questo host.

La qualificazione verifica import di moduli compilati, configurazione DSH reale, rifiuto comportamentale del seed in modalità process e note dopo reload. Non esegue un modello, una delega autenticata o l'accettazione Docker. Non prova l'installazione senza rete; dipendenze e payload vengono scaricati prima del possibile deployment offline.

Durante le prove finali due controlli del verificatore hanno passato tutte le aspettative applicative ma fallito la conferma di cleanup Windows. `taskkill` su processi sintetici pronti ha impiegato 1,7–3,0 secondi in prove separate; il vecchio limite di tre secondi era troppo vicino al costo osservato. I file di test sono ora serializzati e il comando di cleanup ha un budget finito di dieci secondi, richiedendo ancora un exit zero osservato. Una regressione reale con successo ritardato oltre tre secondi passa; timeout ed exit nonzero restano fallimenti. Il timeout del candidato, i limiti di output e il drenaggio finale di tre secondi restano invariati.

Il workflow in `distribution/ci.github-actions.yml` include controlli Windows/Linux e una vera installazione portabile. Rimane un template inattivo perché l'accesso GitHub disponibile non ha scope `workflow`; nessuna esecuzione CI viene dichiarata. Il protocollo di valutazione resta privo di risultati di modelli reali e la PR resta in bozza fino alla qualificazione del deployment.

Al termine dell'integrazione finale, dopo le correzioni dei confini in `a864f5a`, `pnpm test` passa con **93 test riusciti, zero fallimenti e due prove Docker live esplicitamente saltate**. Le due prove non eseguite riguardano il verificatore Docker sul riferimento/seed e il percorso completo da scrittura di file privati a completamento verificato. Typecheck e build dei cinque pacchetti passano, eseguiti senza sovrapporre installazione o typecheck alla suite. Il runtime SDK esegue sette richieste deterministiche per il task (quattro strumenti e tre arresti), conserva la nota d'indagine e pubblicizza soltanto i sette strumenti interni. La prova Web compone due volte il profilo e verifica il server autenticato. Questi risultati non sono inseriti come tentativi nel benchmark dei modelli.

L'artefatto precedente da `f6bb893` resta una prova storica di installazione e non contiene le ultime correzioni ai confini. Per la consegna usare una ricostruzione dal commit pulito corretto; il rapporto esterno deve indicare `sourceDirty=false`, revisione esatta, inventario e hash del manifest, separatamente dall'artefatto.

## Prova live cloud del 13 ottobre 2026

Alle 17:25–17:26 Europe/Rome è stata eseguita dalla UI Web una correzione reale con `deepseek/deepseek-v4-flash` tramite l'endpoint OpenRouter, usando una credenziale già presente nell'ambiente senza salvarne il valore. È stato usato un profilo `hybrid` dedicato, senza delega nativa configurata. La prima prova con Claude Sonnet 4.6 si era fermata prima degli strumenti per HTTP 402 (limite di credito); una breve richiesta preliminare aveva invece ricevuto risposta. Il passaggio a DeepSeek è stato esplicito.

Il modello ha chiamato gli strumenti aziendali per avviare il task, leggere `orders.mjs`, salvare un'ipotesi, scrivere la correzione e richiedere la verifica. Il codice generato usa una mappa per `requestId`, restituisce l'ordine esistente per retry identici e rifiuta conflitti. Dopo il riavvio del server della stessa copia, la sequenza timeout dopo commit → retry ha mostrato un solo ordine nel browser. Il seed nel repository è rimasto difettoso per le prove successive.

Le tre verifiche Docker hanno fallito sul controllo dell'identità del daemon. I due giri di riparazione del middleware hanno ripetuto la verifica benché il prompt chiedesse di fermarsi al blocco infrastrutturale; questo comportamento è osservato, non presentato come recupero riuscito. `company_finish` ha rifiutato la consegna e lo stato persistito finale è `needs_review`, con tre tentativi. La scritta UI «Completed» indica la fine della generazione e non l'accettazione aziendale del task. Le affermazioni del modello sulla correttezza non sono ricevute del verificatore.

Una successiva diagnostica host separata in modalità `process` ha accettato il candidato sugli otto controlli, inclusi retry, richieste distinte, validazione e conflitti. È esplicitamente priva di isolamento e non è stata associata al task né usata per sbloccare la consegna. Digest candidato: `6d6aab14fc1f999302c3f4a8f65234e008c253b2a289bceedbd5a607b3a0577d`; ricevuta diagnostica: `843b7575-d949-483d-8c45-0a411e6964a2`.

La prova ha anche riprodotto un limite del launcher: il catalogo OpenRouter di 770.930 byte superava il vecchio limite di 256 KiB. La correzione `c8cae8a` legge il corpo in streaming, accetta fino a 2 MiB e cancella risposte eccedenti; conserva timeout, rifiuto dei redirect e corrispondenza esatta del modello. Sette regressioni HTTP locali passano, il controllo sul catalogo reale ora riesce e la suite completa successiva passa con **100 test riusciti, zero fallimenti e due prove Docker saltate**; build e typecheck passano. Il pacchetto precedente qualificato da `20eef89` precede questa correzione; il nuovo test di packaging passa, ma l'installazione consumer completa non è stata ripetuta per questo solo cambiamento.

Questa prova documenta inferenza cloud e strumenti reali. Non qualifica inferenza interna, isolamento Docker, funzionamento offline o worker nativi autenticati; non costituisce un benchmark comparativo.

## Decisioni di integrazione

L'avvio usa la CLI DSH e profili dedicati. Il bundle aziendale esporta un plugin ESM compilato e una patch dichiarata nel manifest. Le informazioni di sessione vengono ricaricate prima del passo dell'agente; il fornitore sincrono di contesto usa una copia già caricata dello stato.

Il profilo interno disabilita anche i servizi DeepSeek ausiliari, oltre al modello principale. L'adattatore `llm-pi-ai` seleziona esplicitamente l'endpoint compatibile con OpenAI e il modello configurati dall'operatore. Le credenziali vengono lette da variabili d'ambiente.

In **rc.2** i provider nativi ricevono la cartella dalla sessione del padre: non esiste l'override `cwd` per singolo incarico presente in versioni successive. Il controller deve creare una sessione padre con la cartella corretta prima di chiamare `ctx.subagents.start`. Questa API consente di avviare il worker direttamente, senza un ulteriore modello che decida di delegare.

Una cartella di lavoro non impone permessi al processo. Il revisore richiede un ambiente qualificato con snapshot montato in sola lettura; fino a quel momento la capacità resta non qualificata. I risultati dei worker vengono controllati anche quando la loro Promise termina senza eccezioni, perché lo stato restituito può segnalare un errore.

La revisione finale ha corretto due confini: verificatore e worker condividono ora l'identità non root, così i file 0600 e le directory 0700 rimangono privati e leggibili dal proprietario; la cattura/fingerprint e il preflight nativo rifiutano i file con più hardlink prima del dispatch. Su Linux serve un utente host non root con daemon locale rootful senza user namespace remapping; su Windows Desktop resta UID/GID 10001 con mapping dei bind da qualificare. Le regressioni di metadati e identità sono riuscite; la nuova prova completa da scrittura aziendale privata a `verified` richiede Linux/Docker ed è esplicitamente opt-in. Non è stata eseguita su questo host. Nessun controllo qualifica un host ostile che muta il filesystem durante la verifica.

## Fonti

- [Pacchetto DSH 0.2.0-rc.2](https://www.npmjs.com/package/@deepseek-ai/dsh/v/0.2.0-rc.2)
- [Provider Codex](https://www.npmjs.com/package/@deepseek-ai/dsh-subagent-codex/v/0.2.0-rc.2)
- [Provider Claude Code](https://www.npmjs.com/package/@deepseek-ai/dsh-subagent-claude-code/v/0.2.0-rc.2)
- [Sorgenti DSH alla revisione esaminata](https://github.com/deepseek-ai/deepseek-harness/tree/d743267388641bc76f17c45ce8b4c231aed1d32c)
