# DSH Enterprise Coding Agent

Distribuzione aziendale di [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), con contesto di progetto, stato persistente del lavoro e verifica indipendente dei risultati.

Il profilo interno collega un endpoint esplicito compatibile OpenAI, espone strumenti limitati alla copia di lavoro e conserva lo stato del task. La prima applicazione è una demo ordini con un bug di duplicazione su retry. L'estensione ibrida con Codex e Claude Code è in implementazione nella stessa PR.

È un prototipo per sviluppatori e IT. Runtime, strumenti e installazione indipendente sono stati provati; una correzione con un modello reale richiede ancora la qualificazione dell'ambiente.

## Progetto

- [Architettura, personalizzazioni e roadmap](docs/progetto-coding-agent-aziendale.md)
- [Installazione e avvio](docs/installation.md)
- [Dove personalizzare il prodotto](docs/customization.md)
- [Runbook del webinar](docs/webinar.md)
- [Protocollo di valutazione](evaluations/README.md)
- [Ricerca e riferimenti tecnici](docs/research/2026-10-13-harness-research.md)

## Sviluppo

Richiede Node.js 24.13 o successivo nella serie 24 e pnpm 10.30.1.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm test
```

Per creare una copia nuova dell'applicazione di prova per l'agente:

```sh
pnpm company-agent demo reset
pnpm demo:start "<workspace restituito dal reset>"
```

La pagina si apre su `http://127.0.0.1:3000`. Invia una richiesta con il timeout simulato attivo, poi premi **Retry same request**: due ordini con lo stesso identificativo rendono visibile il bug che l'agente dovrà correggere. È il caso di lavoro della demo, non una simulazione dell'agente. Il reset crea una nuova copia e conserva le precedenti; gli ordini della pagina sono in memoria.

Configurare poi endpoint, modello e nome della variabile credenziale come descritto nella [guida](docs/installation.md), quindi usare `pnpm company-agent doctor` e `pnpm company-agent start`. Aprire l'URL di accesso stampato dal runtime: nella UI DSH compare il preset **Company evidence workflow**.

Il verificatore indipendente è in `packages/company-verification`. La modalità di sviluppo `process` non offre isolamento; il completamento verificato dell'agente richiede la modalità Docker. La suite autorevole e la soluzione di riferimento non vengono copiate nel workspace dell'agente.

## Stato delle prove

- Demo e verificatore: test comportamentali, compilazione e controllo TypeScript verificati su Windows.
- DSH pubblicato `0.2.0-rc.2`: strumenti eseguiti tramite runtime reale con risposte di protocollo controllate, avvio web autenticato e preset osservato nel browser; [dettagli e limiti](docs/runtime-qualification.md).
- Pacchetto compilato: installato ed eseguito in una directory temporanea esterna al repository. Congelamento del lock e audit finale della distribuzione ancora in corso.
- Modello interno, worker autenticati e isolamento Docker: qualificazione sull'ambiente finale ancora necessaria.
- Il [workflow CI](distribution/ci.github-actions.yml) è pronto ma inattivo: l'accesso GitHub disponibile non include il permesso `workflow`. Non sono dichiarati risultati CI.

L'implementazione procede per incrementi verificati. Credenziali, directory dati del runtime, dipendenze installate e copie di lavoro della demo restano fuori da Git.
