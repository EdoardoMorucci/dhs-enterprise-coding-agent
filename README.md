# DSH Enterprise Coding Agent

Distribuzione aziendale di [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), con contesto di progetto, stato persistente del lavoro e verifica indipendente dei risultati.

Il progetto prevede un profilo per modelli ospitati internamente e un profilo ibrido con deleghe opzionali a Codex e Claude Code. È un prototipo per sviluppatori e IT: lo stato delle prove effettivamente eseguite verrà riportato nella documentazione.

## Progetto

- [Architettura, personalizzazioni e roadmap](docs/progetto-coding-agent-aziendale.md)
- [Ricerca e riferimenti tecnici](docs/research/2026-10-13-harness-research.md)

## Sviluppo

Richiede Node.js 24.13 o successivo nella serie 24 e pnpm 10.30.1.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm -r build
pnpm test
```

Per creare una copia nuova dell'applicazione di prova:

```sh
pnpm demo:reset
pnpm demo:start "<workspace restituito dal reset>"
```

La pagina si apre su `http://127.0.0.1:3000`. Invia una richiesta con il timeout simulato attivo, poi premi **Retry same request**: due ordini con lo stesso identificativo rendono visibile il bug che l'agente dovrà correggere. È il caso di lavoro della demo, non una simulazione dell'agente. Il reset crea una nuova copia e conserva le precedenti; gli ordini della pagina sono in memoria.

Il verificatore indipendente è in `packages/company-verification`. La modalità di sviluppo `process` non offre isolamento; il completamento verificato dell'agente richiederà la modalità Docker. La suite autorevole e la soluzione di riferimento non vengono copiate nel workspace dell'agente.

## Stato delle prove

- Demo e verificatore: test comportamentali, compilazione e controllo TypeScript verificati su Windows.
- DSH pubblicato `0.2.0-rc.2`: installazione e composizione del profilo web verificate; [dettagli e limiti](docs/runtime-qualification.md).
- Modello interno, worker autenticati e isolamento Docker: qualificazione sull'ambiente finale ancora necessaria.
- Il [workflow CI](distribution/ci.github-actions.yml) è pronto ma inattivo: l'accesso GitHub disponibile non include il permesso `workflow`. Non sono dichiarati risultati CI.

L'implementazione procede per incrementi verificati. Credenziali, directory dati del runtime, dipendenze installate e copie di lavoro della demo restano fuori da Git.
