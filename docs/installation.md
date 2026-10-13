# Installazione e avvio

Questa guida riguarda il prototipo per il caso ordini. Il modello di inferenza viene predisposto separatamente. Consultare la [qualificazione](runtime-qualification.md) per sapere quali prove sono state eseguite sull'ambiente di sviluppo.

## Preparare il sorgente

Servono Node.js della serie 24, almeno 24.13.0, e pnpm 10.30.1. L'implementazione è sul ramo `feat/enterprise-agent` finché la PR resta in bozza.

```powershell
git clone --branch feat/enterprise-agent https://github.com/EdoardoMorucci/dhs-enterprise-coding-agent.git
cd dhs-enterprise-coding-agent
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
```

Per il completamento verificato serve un daemon Docker funzionante e l'immagine prevista dal verificatore, preparata prima della demo:

```powershell
docker pull node:24.13.0-alpine
```

L'installazione iniziale scarica dipendenze. La prova senza Internet richiede che dipendenze, immagine, asset e inferenza siano già disponibili nell'ambiente previsto.

## Installare il pacchetto compilato

Sul sorgente usare `pnpm package:runtime`. Il comando restituisce una directory nuova in `dist`, conservando gli artefatti precedenti. Trasferire l'intera directory su una macchina con Node.js 24.13.0; i pacchetti aziendali sono già compilati. All'interno eseguire:

```powershell
npm ci --omit=dev --include=optional --ignore-scripts
node scripts/audit-runtime.mjs .
node scripts/company-agent.mjs demo reset --root "$agentDataRoot" --profile internal
```

Definire prima `$agentDataRoot` come nella sezione seguente. Per tutti i comandi del resto della guida, nel pacchetto sostituire `pnpm company-agent` con `node scripts/company-agent.mjs`; per avviare la pagina usare `node scripts/demo.mjs start "<workspace configurato>"`. Non serve pnpm e non viene usato il checkout di sviluppo.

`package-lock.json` congela versioni, integrità e dipendenze locali relative. Non usare `npm install` per risolvere nuovamente una consegna. `release-manifest.json` registra commit sorgente, eventuali modifiche non committate, versioni, schema, suite, hash dei due lock e inventario dell'artefatto. L'audit verifica integrità e contenuti rispetto al manifest; non è una firma del produttore. `THIRD-PARTY-NOTICES.md` rimanda alle licenze mantenute nei pacchetti installati.

Per provare un'installazione indipendente dal sorgente usare `pnpm qualify:runtime`: crea una copia temporanea esterna, esegue davvero `npm ci`, carica i moduli compilati e compone il runtime DSH. Il risultato e `qualification.json` riportano percorso e hash. Sono prove di installazione e componenti, non una correzione eseguita da un modello o una qualificazione offline.

## Configurare il percorso interno

Usare sempre la stessa directory dati. I comandi seguenti scelgono una directory dedicata su Windows; su altri sistemi passare un percorso assoluto equivalente.

```powershell
$agentDataRoot = Join-Path $env:LOCALAPPDATA 'CompanyCodingAgent'
pnpm company-agent demo reset --root "$agentDataRoot" --profile internal
```

Il reset restituisce il percorso di una copia nuova dell'applicazione. Copiarlo nel comando di configurazione seguente. I valori fra parentesi angolari vanno sostituiti con quelli dell'ambiente reale.

```powershell
pnpm company-agent configure --root "$agentDataRoot" --profile internal --endpoint "<URL interno compatibile OpenAI, incluso /v1 se previsto>" --model "<ID esatto del modello>" --api-key-env DSH_LOCAL_API_KEY --workspace "<workspace restituito dal reset>"
```

Il modello deve supportare l'uso degli strumenti attraverso l'adattatore configurato. Se necessario specificare `--context-window` e `--max-tokens` coerenti con il deployment. La configurazione memorizza il nome `DSH_LOCAL_API_KEY`, senza il valore della credenziale.

Predisporre quella variabile nell'ambiente del processo usando il sistema di gestione dei segreti previsto dal team. Il file `.env.example` è un promemoria: il launcher non carica automaticamente un file `.env`. Per un server locale che non richiede autenticazione, un valore esplicito non segreto può soddisfare il requisito del client; non usare questo espediente per un servizio che richiede una vera credenziale.

```powershell
pnpm company-agent doctor --root "$agentDataRoot" --profile internal
pnpm company-agent start --root "$agentDataRoot" --profile internal
```

Aprire l'URL stampato dal runtime, che contiene il token iniziale necessario per autenticare il browser. Dopo l'accesso la UI usa `http://127.0.0.1:3080`, salvo una porta diversa scelta con `--port`. Il listener è locale. Alla prima apertura confermare l'avviso sulla versione preview; il preset selezionato deve essere **Company evidence workflow**.

`doctor` controlla configurazione, elenco dei modelli, runtime, bundle compilato e disponibilità dell'immagine Docker. La presenza del modello nell'elenco non dimostra che sappia completare un task: serve la prova descritta nel [webinar](webinar.md).

Per ispezionare la configurazione composta senza invocare il modello:

```powershell
pnpm company-agent start --root "$agentDataRoot" --profile internal --dump-config
```

## Mostrare l'applicazione e lavorare sul task

In un secondo terminale avviare la stessa copia selezionata nella configurazione:

```powershell
pnpm demo:start "<workspace configurato>"
```

La pagina ordini è su `http://127.0.0.1:3000`. Creare un ordine con timeout simulato e usare **Retry same request**. Il duplicato è il difetto iniziale. Nell'interfaccia DSH aprire una nuova conversazione e usare il prompt del [runbook](webinar.md).

Gli strumenti aziendali avviano il task, mostrano lo stato, leggono e scrivono file, richiedono la verifica e tentano il completamento. Lo stato è legato alla sessione. Il verificatore opera su uno snapshot del candidato; il rapporto ha un digest e un'identità di esecuzione. La consegna richiede evidenza isolata, positiva e attuale.

`company_task_note` aggiunge un'ipotesi (`hypothesis`) o un controllo pendente (`pending_check`), fino a 500 caratteri per nota e 20 elementi per elenco, inclusi i motivi inseriti dall'host. Il contesto viene controllato prima del salvataggio: un overflow viene rifiutato. Le note riappaiono alla ripresa; non sostituiscono elenchi, ricevute, fasi o motivi di arresto.

## Profilo ibrido

Il profilo `hybrid` conserva configurazione, `dsh-home` e stato separati da `internal`. Il modello padre usa comunque l'endpoint esplicito; i worker nativi usano servizi esterni e credenziali selezionate. Il profilo interno non carica questi provider.

Preparare l'immagine worker da base immutabile, senza copiare dipendenze Windows nel contesto Linux:

```powershell
node packages/company-delegation/runtime/build-image.mjs "node:24.13.0-bookworm-slim@sha256:<digest verificato della base>"
docker image inspect company-native-worker:rc2 --format '{{.Id}}'
node scripts/company-agent.mjs demo reset --root "$agentDataRoot" --profile hybrid
node scripts/company-agent.mjs configure --root "$agentDataRoot" --profile hybrid --endpoint "<endpoint padre>" --model "<modello padre>" --api-key-env DSH_LOCAL_API_KEY --workspace "<workspace ibrido>" --native-image "sha256:<ID immagine worker>" --writer-credential "<file assoluto Codex>" --reviewer-credential "<file assoluto Claude>"
```

I file credenziali espliciti restano fuori dal candidato e dalla distribuzione. La configurazione ne conserva soltanto il percorso; la [guida nativa](../packages/company-delegation/README.md) descrive formato, permessi e limiti. Nel pacchetto compilato la stessa guida è `docs/native-delegation.md`.

Su Linux il percorso supportato richiede utente e gruppo primario non root, daemon Docker locale rootful senza user namespace remapping, accesso effettivo al candidato e file credenziale privato del proprietario (0600 o 0400). Il worker usa UID/GID dell'host. Rootless, daemon remoti e identità non supportate vengono rifiutati; i permessi non vengono modificati automaticamente. Windows Desktop usa il backend Linux via named pipe e UID/GID 10001; ACL e mapping dei bind devono essere qualificati nell'ambiente reale. Non rendere pubbliche le credenziali per aggirare un errore di accesso.

`company_delegate` richiede due verifiche ancora disponibili ed esegue writer, verifica host, reviewer su snapshot e verifica finale. Il reviewer controlla che il mount sia davvero in sola lettura prima di invocare Claude. Il testo dei worker è un risultato da esaminare; il completamento richiede ancora `company_finish`. La rete bridge consente inferenza nativa e non rappresenta una lista di destinazioni autorizzate. Esecuzione Linux, permessi del mount e autenticazione restano da qualificare sul deployment.

Per osservare i dati salvati dall'esterno:

```powershell
pnpm company-agent status --root "$agentDataRoot" --profile internal
```

Questo comando legge una fotografia persistita e non rivalida il digest. Usare `company_task_state` nella UI in esecuzione per ottenere lo stato aggiornato. Un campo `verified` in una vecchia fotografia non certifica file modificati successivamente.

Una verifica indipendente da terminale è disponibile con:

```powershell
pnpm company-agent verify --root "$agentDataRoot" --profile internal
```

Il rapporto standalone non viene associato automaticamente a un task di sessione. `--development-process` esegue una diagnostica senza isolamento ed è adatto soltanto al codice sintetico controllato dallo sviluppatore; il suo successo non consente lo stato `verified`.

## Dati, reset e ripresa

Ogni profilo ha una directory `dsh-home`, configurazione, stato autorevole e file di proprietà del processo separati. La configurazione personale DSH non viene incorporata. Arrestare il runtime prima di riconfigurare un profilo o usare operazioni CLI che ne richiedono la proprietà esclusiva.

`demo reset` crea una copia nuova e conserva le precedenti. Per usarla bisogna riconfigurare il workspace e iniziare una conversazione nuova. Non selezionare come candidato la directory della distribuzione o quella contenente stato e attestazioni.

Dopo un arresto anomalo il file `owner.json` può rimanere. Verificare che il vecchio runtime e gli eventuali lavoratori siano terminati, ispezionare il workspace e riconciliare le operazioni dall'esito ignoto prima di rimuovere un file di proprietà obsoleto. Non automatizzare questa rimozione sulla sola base di un PID mancante.

Un task recuperato durante una verifica rimane da riesaminare. Non modificare a mano ricevute, tentativi o flag per sbloccarlo. Per una nuova dimostrazione è possibile conservare i dati interrotti e creare un workspace e una conversazione nuovi.

Una sessione ripristinata deve riferirsi allo stesso candidato canonico della configurazione. Se il profilo viene riconfigurato su un'altra cartella, ripristinare la cartella originale o aprire una sessione nuova; riconfigurare non migra i vecchi task.

L'ammissione persistente accanto al candidato impedisce scritture concorrenti anche fra directory dati diverse. Se l'esito nativo è ignoto, arrestare il runtime, ispezionare le modifiche e usare l'operazione host:

```powershell
node scripts/company-agent.mjs native-reconcile --root "$agentDataRoot" --profile hybrid --acknowledge-partial-changes
```

Usare il root originale registrato nell'ammissione. Il comando converge i container noti prima di rilasciare il blocco; la conferma riconosce che le modifiche parziali restano presenti. Non approva il candidato, non rigioca il lavoro e non annulla scritture. Dopo un writer dall'esito ignoto serve una nuova ricevuta positiva; le note dell'agente non possono cancellare questo requisito. Se il comando si interrompe, ripeterlo dopo la riconciliazione operativa.

## Backup e aggiornamento

Con runtime fermo, conservare insieme directory dati, copie di lavoro e versione del programma. I dati e le credenziali locali restano esclusi da Git. Un aggiornamento dello schema richiede migrazione qualificata oppure dati separati; gli stati privi dei campi obbligatori, incluso l'indice delle ricevute, vengono rifiutati.

Per tornare a una versione precedente usare il programma e il backup dei dati corrispondenti. Il rollback tra formati diversi non è stato qualificato. Conservare anche manifest e lock dell'artefatto utilizzato. Le credenziali richiedono backup separato secondo la gestione dei segreti del team.
