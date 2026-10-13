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

## Backup e aggiornamento

Con runtime fermo, conservare insieme directory dati, copie di lavoro e versione del programma. I dati e le credenziali locali restano esclusi da Git. Un aggiornamento dello schema richiede migrazione qualificata oppure dati separati; gli stati privi dei campi obbligatori, incluso l'indice delle ricevute, vengono rifiutati.

Per tornare a una versione precedente usare il programma e il backup dei dati corrispondenti. Il rollback tra formati diversi non è stato qualificato. Le istruzioni per produrre e installare l'artefatto portabile verranno affiancate al rapporto della sua installazione pulita.
