# Qualificazione iniziale del runtime

13 ottobre 2026. Questa scheda registra prove effettuate sul runtime pubblicato, separatamente dalle prove del nostro agente.

## Versioni selezionate

- Node.js: 24.13.0 su Windows.
- pnpm: 10.30.1.
- Famiglia di pacchetti DSH: **0.2.0-rc.2**, senza mescolare pacchetti alpha.
- Cordis: 4.0.4.

Il ramo master DSH esaminato è `d743267388641bc76f17c45ce8b4c231aed1d32c`, versione 0.2.1-alpha.2. Alcuni esempi di quel ramo usano interfacce diverse dalla release scelta. Per implementare il bundle sono stati controllati anche JavaScript, dichiarazioni TypeScript e README dei tarball pubblicati.

## Prove eseguite

| Prova | Esito osservato |
|---|---|
| Installazione isolata di DSH e dei provider nativi Codex e Claude Code | Riuscita: 628 pacchetti, payload Windows dei due worker presenti |
| CLI installata, help e versione | Riuscita: versione 0.2.0-rc.2 |
| Creazione di un profilo dal template web | Riuscita: manifest generato con bundle base e web-app |
| Composizione configurazione SDK minima | Riuscita |
| Composizione web con endpoint locale e provider DeepSeek predefiniti disabilitati | Riuscita |
| Esportazione dello schema della configurazione web | Fallita su quattro righe native del runtime; non usata come criterio di riuscita del nostro bundle |
| Inferenza reale del modello interno | Non eseguita: endpoint e modello da configurare |
| Delega nativa autenticata | Non eseguita in questa qualificazione |
| Isolamento Docker | Da qualificare: Docker Desktop avviato, daemon non disponibile alla prima prova con timeout |

La composizione di una configurazione valida non dimostra che un modello sia raggiungibile o che esegua correttamente gli strumenti.

## Decisioni di integrazione

L'avvio usa la CLI DSH e profili dedicati. Il bundle aziendale esporta un plugin ESM compilato e una patch dichiarata nel manifest. Le informazioni di sessione vengono ricaricate prima del passo dell'agente; il fornitore sincrono di contesto usa una copia già caricata dello stato.

Il profilo interno disabilita anche i servizi DeepSeek ausiliari, oltre al modello principale. L'adattatore `llm-pi-ai` seleziona esplicitamente l'endpoint compatibile con OpenAI e il modello configurati dall'operatore. Le credenziali vengono lette da variabili d'ambiente.

In **rc.2** i provider nativi ricevono la cartella dalla sessione del padre: non esiste l'override `cwd` per singolo incarico presente in versioni successive. Il controller deve creare una sessione padre con la cartella corretta prima di chiamare `ctx.subagents.start`. Questa API consente di avviare il worker direttamente, senza un ulteriore modello che decida di delegare.

Una cartella di lavoro non impone permessi al processo. Il revisore richiede un ambiente qualificato con snapshot montato in sola lettura; fino a quel momento la capacità resta non qualificata. I risultati dei worker vengono controllati anche quando la loro Promise termina senza eccezioni, perché lo stato restituito può segnalare un errore.

## Fonti

- [Pacchetto DSH 0.2.0-rc.2](https://www.npmjs.com/package/@deepseek-ai/dsh/v/0.2.0-rc.2)
- [Provider Codex](https://www.npmjs.com/package/@deepseek-ai/dsh-subagent-codex/v/0.2.0-rc.2)
- [Provider Claude Code](https://www.npmjs.com/package/@deepseek-ai/dsh-subagent-claude-code/v/0.2.0-rc.2)
- [Sorgenti DSH alla revisione esaminata](https://github.com/deepseek-ai/deepseek-harness/tree/d743267388641bc76f17c45ce8b4c231aed1d32c)
