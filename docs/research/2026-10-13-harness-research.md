# DeepSeek Harness: cosa possiamo costruire davvero

Ricerca del 13 ottobre 2026. Fonti primarie: documentazione e codice DSH e Codex, casi pubblicati da Stripe, Shopify e Ramp, esperimenti e indicazioni di Anthropic e LangChain. Riferimento del ramo `master` DSH rilevato durante la ricerca: [`d743267388641bc76f17c45ce8b4c231aed1d32c`](https://github.com/deepseek-ai/deepseek-harness/commit/d743267388641bc76f17c45ce8b4c231aed1d32c). I link sotto puntano ai documenti leggibili; le API sono in evoluzione. Non abbiamo installato o provato DSH in questa ricerca. I risultati delle aziende sono auto-riferiti; le proposte per il webinar sono nostre inferenze progettuali.

## Risposta alla domanda del webinar

Il risultato «modificare codice, eseguire test, preparare una PR» da solo non dimostra perché costruire un harness. La differenza da mostrare è **chi controlla il processo**: selezione del contesto e degli strumenti, condizioni di conclusione, validatori, stato, recupero dagli errori e integrazione nell'interfaccia.

DSH è interessante perché espone questi punti come plugin: il loop standard, i provider dei modelli, gli strumenti e le sessioni sono sostituibili. Profili e bundle compongono il prodotto; una patch può cambiare un componente senza mantenere un fork completo. Questo è un vantaggio architetturale da verificare sul nostro caso, non una prova di superiorità rispetto a Codex. [Architettura ufficiale](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)

Inoltre DSH include un plugin ufficiale che **delega a una vera sessione Codex**. Ogni chiamata crea un processo/thread/turno effimero, usa configurazione e autenticazione native e restituisce il risultato finale. Non offre continuazione o resume del lavoratore esterno; attività interne e diff non vengono copiati nel log del padre. DSH e Codex possono quindi essere livelli dello stesso sistema. [Provider Codex](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/subagent/subagent-codex/README.md)

## Sì: anche Codex può farlo

Non c'è un'esclusiva DSH su migrazioni, generazione di connettori, strumenti aziendali, interfacce proprie o validazione automatica.

| Livello | Capacità documentata di Codex | Fonte primaria |
|---|---|---|
| Configurazione | MCP locali/HTTP; plugin che combinano skill, MCP, hook e UI opzionale. | [MCP](https://learn.chatgpt.com/docs/extend/mcp), [plugin](https://developers.openai.com/plugins/concepts/plugins) |
| Controlli eseguibili | Hook prima/dopo i tool e alla conclusione; `Stop` può impedire la chiusura e richiedere altro lavoro. | [Hooks](https://learn.chatgpt.com/docs/hooks) |
| Prodotto aziendale | SDK TypeScript per avviare, continuare e riprendere thread in applicazioni, CI e automazioni. | [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk) |
| Interfaccia personalizzata | App Server espone sessioni, autenticazione, eventi e approvazioni; alcuni trasporti e tool dinamici sono sperimentali. | [App Server](https://learn.chatgpt.com/docs/app-server) |
| Agenti specializzati | Subagent con istruzioni e configurazioni dedicate. | [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) |
| Modifica del motore | CLI, SDK e App Server sono open source. Non implica che IDE extension e servizio cloud lo siano. | [Open source](https://learn.chatgpt.com/docs/open-source) |
| Provider | Endpoint e protocolli configurabili, incluse opzioni locali; la compatibilità del modello scelto richiede una prova. | [Configurazione avanzata](https://learn.chatgpt.com/docs/config-file/config-advanced) |

Esistono anche API per usare l'harness Codex gestito con strumenti e ambiente propri. Non confondere **Codex SDK**, **Agents SDK** e **Agents API**: hanno responsabilità diverse. [Agents API](https://developers.openai.com/api/docs/guides/agents-api/overview), [scelta del runtime](https://developers.openai.com/api/docs/guides/agents)

Tre decisioni possibili: configurare Codex; costruire il nostro prodotto sopra il suo SDK; comporre o modificare un runtime come DSH. Anche la seconda è harness engineering. DSH è interessante per studiare e sostituire componenti, non perché renda impossibili agli altri determinati risultati. Un motore completamente nuovo va giustificato rispetto a questi riusi.

## Obiezione successiva: perché DSH invece di Claude Code?

La fabbrica di connettori resta un esempio di processo ripetibile, ma **non basta come demo principale se deve motivare specificamente DSH**. Questo aggiorna la raccomandazione più avanti: l'esempio funzionale va subordinato a un requisito del runtime.

Claude Code espone già [hook](https://code.claude.com/docs/en/hooks), [Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview) e [mods ufficiali](https://code.claude.com/docs/en/plugins/mods/overview). Le mods intervengono nel processo e nell'interfaccia. La [reference](https://code.claude.com/docs/en/plugins/mods/reference) comprende composizione del prompt, richieste del modello e compattazione. Non presentare pannelli, verifiche, routing o contesto personalizzato come esclusive DSH. Non aver trovato una API per sostituire tutto il loop non prova un'impossibilità assoluta.

Il confine documentato è più concreto: DSH pubblica il runtime con [licenza MIT](https://github.com/deepseek-ai/deepseek-harness/blob/master/LICENSE) e componenti sostituibili da configurazione; Claude Code ha [licenza proprietaria](https://github.com/anthropics/claude-code/blob/main/LICENSE.md). Anthropic dichiara esplicitamente che l'uso di [gateway verso modelli non-Claude non è supportato](https://code.claude.com/docs/en/llm-gateway). Non supportato non significa tecnicamente impossibile. DSH documenta [provider multipli e server self-hosted](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm-pi-ai/README.md).

**Direzione più difendibile per il webinar:** costruire una distribuzione aziendale del coding agent, con motore modificabile, modello su infrastruttura propria e un componente del runtime sostituito da noi. Possibile prova: diagnosi di un errore in un'applicazione di test usando codice e log interni, patch e test; mostrare il funzionamento senza accesso a Internet, poi comparare due gestioni del contesto sullo stesso modello. Richiede prima qualificare modello, hardware e tutte le dipendenze; installare DSH da solo non rende il sistema offline.

L'obiettivo del confronto sarebbe misurare come cambia il comportamento sostituendo quel componente. Un miglioramento di qualità o costo è un'ipotesi da provare. La licenza aperta e l'indipendenza del runtime motivano la scelta rispetto a Claude Code; non dimostrano che DSH sia l'unico framework adatto o superiore agli altri harness aperti. Se questi requisiti non servono, la ricerca non giustifica preferirlo a un agente esistente ben configurato.

## Confronto con OpenCode: la motivazione deve reggere anche qui

**Aggiornamento alla raccomandazione:** i motivi di apertura e indipendenza indicati contro Claude Code non distinguono DSH da OpenCode. Il repository ufficiale OpenCode è [MIT](https://github.com/anomalyco/opencode/blob/dev/LICENSE); la documentazione descrive [modelli locali con Ollama](https://opencode.ai/docs/providers/#ollama) e provider personalizzati. Sono disponibili plugin e SDK. Quindi distribuire un agente nostro, usare un modello interno e personalizzare strumenti non costituisce di per sé una preferenza motivata per DSH.

Sono state controllate sia le pagine [V1](https://opencode.ai/docs/) sia quelle [V2](https://opencode.ai/v2/docs/): non bisogna usare i limiti delle vecchie estensioni per descrivere il prodotto nuovo. La documentazione [plugin V2](https://opencode.ai/v2/docs/build/plugins/) espone trasformazioni dei registri, contesto per richiesta e hook di compattazione che può fornire un riepilogo proprio, saltando la chiamata standard al modello. L'[SDK V2](https://opencode.ai/v2/docs/build/sdk/) incorpora il server nel processo; i [provider V2](https://opencode.ai/v2/docs/providers) comprendono implementazioni configurabili. Anche la personalizzazione della memoria non è un'esclusiva DSH.

Resta un'ipotesi architetturale da verificare: per una particolare sostituzione del loop o dello storage, la composizione di componenti DSH potrebbe richiedere meno modifiche interne e manutenzione. Le fonti non provano che OpenCode richieda necessariamente un fork, né che DSH sia più semplice o più veloce.

La verifica utile è realizzare la stessa modifica, con gli stessi criteri di accettazione, sui due runtime; registrare quali API pubbliche bastano, quali file interni cambiano, tempi di implementazione, comportamento e lavoro necessario a un aggiornamento di versione. Il numero di righe da solo non misura la manutenibilità.

Per il webinar, un posizionamento sostenibile è **«Costruiamo e misuriamo un harness specializzato con DSH»**, presentando OpenCode come alternativa concreta. Per sostenere «per il nostro caso DSH conviene più di OpenCode» occorre prima il confronto implementato. Al momento abbiamo ricerca documentale, non quel risultato sperimentale. L'obiettivo originario è capire le potenzialità di DSH; non richiede dimostrare un'esclusività non documentata.

## Casi reali: che cosa stanno costruendo le aziende

### Stripe: fabbrica di integrazioni

Il caso più vicino al webinar è [Payment Method Factory](https://stripe.dev/blog/stripes-payment-method-factory-orchestrating-agents-for-repeated-custom-integrations), pubblicato il 30 settembre 2026.

Stripe riutilizza conoscenza e prompt, divide il lavoro in piccoli PR e verifica richieste, risposte, stato ed eventi nei sandbox dei provider. Ha sostituito un orchestratore LLM con codice. Riferisce tre nuove integrazioni e dieci migrazioni, con tempi passati da fino a sei mesi a 2–6 settimane. Sono risultati interni, con contributo e revisione degli ingegneri, non un confronto DSH/Codex.

La lezione applicabile: un investimento nel processo si ripaga quando cambia il fornitore ma si ripetono contratto interno, convenzioni e criteri di accettazione.

### Stripe: passaggi agentici e deterministici

[Minions, parte 2](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents-part-2), 19 febbraio 2026: blueprint alternano operazioni fisse come lint/push e passaggi agentici come implementazione/correzione. Workspace isolati e sottoinsiemi di strumenti limitano il contesto operativo. Il contributo del runtime comprende quindi operazioni che il software esegue direttamente, senza demandare ogni decisione al modello.

### Shopify: problemi di sicurezza dimostrati, poi risolti

[Harness AppSec](https://shopify.engineering/building-an-agentic-harness-that-outlasts-the-model), 29 luglio 2026: preparazione ambiente, analisi, verifica distinta e deduplicazione. Per un problema fra tenant richiede identità separate e test che attraversino lo stack pubblico. Una segnalazione plausibile diventa risultato solo dopo una prova concreta.

[River](https://shopify.engineering/river-vulnerability-remediation), 2 settembre 2026: riconcilia registro del lavoro, repository, PR e tracker, tiene conto delle decisioni umane e verifica nuovamente il risultato dopo il merge. Per il nostro progetto suggerisce di distinguere patch prodotta, test superati e problema effettivamente chiuso.

### Ramp: ambiente completo e regole operative

[Inspect](https://engineering.ramp.com/post/why-we-built-our-background-agent), 12 gennaio 2026: ambienti applicativi completi, telemetria, CI, browser e preview. Il vantaggio progettuale è dare all'agente ciò che serve a verificare il cambiamento nello stesso contesto in cui lavorano gli sviluppatori.

[Agentic Risk Operations](https://engineering.ramp.com/post/agentic-risk-operations), 30 giugno 2026: l'agente raccoglie e interpreta informazioni; policy approvate e strumenti auditabili governano decisioni ed effetti. Usa valutazioni separate dell'agente e delle policy. Possibile applicazione nostra: gestione di richieste IT, con le regole di accesso possedute dal software.

### Evidenza misurata e limite della complessità

LangChain riferisce **52,8 → 66,5 su Terminal Bench 2.0**, mantenendo `gpt-5.2-codex` e modificando prompt, strumenti e middleware del proprio harness. È un esempio di miglioramento misurato con modello fisso; **il nome del modello non significa che abbiano confrontato il prodotto Codex con DSH**. [Harness engineering](https://www.langchain.com/blog/improving-deep-agents-with-harness-engineering), 17 febbraio 2026.

Non segue che più componenti diano risultati migliori: Deep Agents 0.7 ha ridotto di circa il 65% i token delle istruzioni di base, con differenze di qualità non significative nei test descritti. Non è un risparmio del 65% sul costo totale. [Versione 0.7](https://www.langchain.com/blog/deep-agents-v0-7), 29 luglio 2026.

Anthropic descrive inizializzazione, registro dei progressi e verifiche per lavori lunghi, ma racconta anche di aver rimosso parti del processo diventate superflue con modelli migliori. Il runtime va rivalutato, non accumulato indefinitamente. [Primo harness](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents), [evoluzione](https://www.anthropic.com/engineering/harness-design-long-running-apps). Per gli esperimenti occorre misurare lo stato finale e ripetere le prove, non valutare soltanto la risposta dell'agente. [Valutazioni](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

## Punti di estensione verificati

| Parte dell'harness | Cosa offre oggi DSH | Cosa sarebbe nostro |
|---|---|---|
| Decisione di continuare | `agent/turn-stopping` viene atteso prima di chiudere. Un listener può accodare input al passo successivo, facendo continuare l'agente. | Validatore che legge evidenze reali e rilancia una correzione, con limite di tentativi. |
| Instradamento del modello | `agent/request` può sostituire la configurazione della chiamata, inclusi provider e modello. Non modifica i messaggi. | Regola di escalation o scelta per fase, da valutare su qualità e costi. |
| Input di ogni passo | `agent/pre-step` può accettare, riscrivere o rifiutare l'input proposto. `agent.inject()` accoda contesto senza svegliare da solo l'agente. | Documentazione pertinente alla fase, casi falliti e stato verificato. |

Le tre righe sono contratti nel [codice runtime dell'agente](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent/src/runtime-types.ts). Il [loop concreto](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/src/agent.ts) ricontrolla l'inbox dopo `agent/turn-stopping` prima di uscire. Questi hook consentono una policy; non forniscono già la logica aziendale del validatore.

| Parte dell'harness | Meccanismo verificato | Implicazione pratica |
|---|---|---|
| Strumenti e azioni consentite | `ctx.tools.register`, `restrict` e `guard`; la guardia finale restituisce un diniego che listener successivi non possono annullare. | Esporre solo gli strumenti della fase corrente; negare una pubblicazione se mancano attestazioni valide. |
| Esecuzione e risultati | `tools/execute` avvolge la chiamata; `tools/post-execute` trasforma risultati; `tools/result` osserva il risultato finale immutabile. | Misurare, validare e salvare gli esiti; i controlli devono stare sul percorso effettivamente usato. |
| Chiamate programmatiche | Modalità native oppure PTC: un `run_code` con SDK generato compone più chiamate; gli intermedi restano locali all'esecuzione. | Aggregare risposte API prima di passare al modello il dato utile. PTC non promette risparmio universale di token. |

Fonte delle tre righe: [registro strumenti](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/tools/README.md). Una policy su un singolo tool non impedisce un percorso alternativo attraverso shell o rete lasciato disponibile: progettare il catalogo dei poteri fa parte del lavoro.

Il [plugin di presentazione](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-tool-presentation/README.md) sceglie native/PTC per preset; agenti diversi possono usare modalità diverse nello stesso processo. PTC richiede un runtime compatibile già montato. È una configurazione del comportamento dell'agente, non una modifica del modello.

Il [system prompt](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/system-prompt/README.md) è assemblato con sezioni ordinate e contributi specifici per agente. I context provider dinamici vengono aggiornati prima dell'ammissione della richiesta. Applicazione proposta: mantenere istruzioni stabili e aggiungere solo contratto, documentazione e fallimenti utili alla fase corrente, senza riversare ogni documento nel prompt.

La [compaction di base](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/compaction/compaction-basic/README.md) condensa storia vecchia, conserva la coda recente e recupera alcuni overflow. Supporta soglie per modello e un summarizer sostituibile; non riduce prompt di sistema, strumenti o unità indivisibili. Una memoria di dominio affidabile richiede quindi uno stato esplicito oltre al riassunto della conversazione.

L'interfaccia è estendibile attraverso [slot tipizzati](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-slots/README.md): regioni singole, liste, selezione per chiave e catene. Possiamo mostrare un componente aziendale dentro DSH; il contenuto e i collegamenti ai nostri eventi sarebbero codice nostro. Creator mode è una modalità di authoring di plugin, non una garanzia di generazione corretta al primo tentativo. [Presentazione ufficiale](https://www.deepseek.com/en/harness/)

## Proposta concreta: fabbrica di connettori API verificati

**Ipotesi progettuale, non funzione già pronta di DSH.** Input: documentazione/OpenAPI di un servizio e contratto del connettore aziendale. Output: adapter compilabile, sincronizzazione dimostrabile su dati di prova, rapporto dei contract test e modifica revisionabile.

Un caso dimostrativo circoscritto: collegare un gestionale ordini a un CRM. Preparare due servizi sandbox con record veri nella demo, paginazione, limiti API ed errori controllabili. Chiedere di creare il connettore. La parte visibile è un ordine che compare nel sistema destinazione, con la corretta mappatura; ripetere lo stesso evento e mostrare che non crea duplicati; simulare `429` e timeout e mostrare il recupero.

L'harness nostro potrebbe possedere queste fasi:

1. **Comprendere il contratto:** espone documentazione pertinente, schema destinazione e strumenti di ispezione.
2. **Implementare:** concede scrittura all'adapter e lancia i controlli del progetto.
3. **Validare:** un runner controllato da noi verifica paginazione, mapping, retry, duplicati e stato finale nel sandbox.
4. **Correggere:** i fallimenti diventano input mirato; si ripete entro un budget.
5. **Consegnare:** il tool di consegna accetta solo evidenze relative allo stesso hash del codice e alla versione corrente della suite.

La suite e la condizione di completamento devono essere possedute dall'harness: se il modello può indebolire il validatore per ottenere un risultato verde, la demo perde valore. Il modello può proporre nuovi test, ma non rimuovere il criterio di accettazione del processo.

Mappatura: stop hook per richiedere verifiche mancanti; registry/guard per autorizzare la consegna; context provider per documentazione per fase; eventi o storage di dominio per risultati; slot UI per mostrare le prove. Questi agganci sono disponibili, mentre controller, suite, hash, budget ed eventuali compensazioni sono da realizzare.

**La prova interessante non è «Codex non riesce a scrivere questo codice».** È «il nostro sistema tratta una risposta dell'agente come proposta, e dichiara riuscita l'integrazione soltanto quando un processo eseguibile ne conferma il comportamento». Lo stesso controller potrebbe impiegare Codex come lavoratore.

## Cosa implementeremmo per il webinar

Il primo prototipo potrebbe riutilizzare loop, provider e interfaccia di DSH e aggiungere quattro componenti nostri:

| Componente proposto | Responsabilità verificabile |
|---|---|
| `integration-context` | Carica contratto interno, documenti del fornitore e feedback pertinenti alla fase. |
| `integration-workflow` | Governa le fasi, il budget, i tentativi e i passaggi deterministici; salva lo stato del lavoro. |
| `contract-runner` | Avvia la suite esterna al workspace modificabile dal lavoratore; controlla dati ed effetti nel sandbox; registra hash e risultati. |
| `delivery-gate` | Consente la consegna solo con un esito valido sulla versione corrente; chiede correzioni oppure chiude con fallimento esplicito al limite di tentativi. |

Sono nomi progettuali nostri, non pacchetti esistenti. La verifica deve eseguire codice in un ambiente distinto con permessi definiti. La sola guardia sul tool di consegna non basta se altri strumenti possono aggirarla.

Sequenza dimostrativa: primo fornitore → connettore → ordini visibili nel CRM → duplicazione intenzionale di un evento e timeout controllato → verifica dei dati → secondo fornitore con schema diverso, stesso contratto e stessa suite. I servizi sandbox sono sistemi di prova eseguibili; se simulano provider, lo si dichiara. La riuscita deve risultare da dati e test, non da un'animazione della UI. Non serve costruire una dashboard complessa prima che questo percorso funzioni.

Il controllo dei retry delle API generato nel connettore e il controllo dei tentativi dell'agente sono due meccanismi diversi: entrambi vanno provati. Anche il ripristino dopo un crash dell'orchestratore sarebbe una funzionalità separata da implementare, non una proprietà da promettere nella prima demo.

Due alternative concrete se le integrazioni non sono centrali per l'azienda:

- **Verificatore di isolamento dei tenant:** applicazione locale, due utenti, prova riproducibile di accesso indebito, patch, nuova verifica dei casi consentiti e vietati. Il runtime governa sospetto → prova → correzione → regressione. Ispirazione: Shopify AppSec.
- **Operatore IT per richieste di accesso:** ticket, directory di prova e policy esplicite. Il modello interpreta; strumenti vincolati applicano le regole. Si dimostrano richiesta duplicata, utente già esistente e autorizzazione mancante verificando lo stato della directory. Ispirazione: Ramp, adattata da noi al dominio IT.

La fabbrica di connettori è adatta a parlare di processi ripetibili a sviluppatori e IT insieme. Alla luce dell'obiezione su Claude Code, non è però sufficiente a motivare specificamente DSH: vedere la sezione dedicata sopra. Per una singola integrazione occasionale, configurare un agente esistente potrebbe richiedere meno lavoro; la specializzazione ha senso quando il processo si ripete.

## Stato e orchestrazione: confini importanti

DSH ha una persistenza reale delle sessioni: il backend JSONL registra eventi, supporta lettura/resume e riparazione della coda interrotta. Al recupero distingue chiamate non iniziate da chiamate con esito ignoto; in quest'ultimo caso non può sapere da solo se il sistema esterno è già stato modificato. [Backend JSONL](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/session/session-persistence-jsonl/README.md)

Per dati diversi dalla conversazione esistono storage JSON/SQLite e domini tipizzati. Il dominio serializza le proprie scritture e aggiorna memoria/eventi dopo la persistenza. Questo offre mattoni per salvare fase, prove e checkpoint; le semantiche del nostro lavoro, del retry e degli effetti esterni restano a nostro carico. [Storage](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/storage.md)

Il motore workflow esegue JavaScript con `agent`, `parallel`, `pipeline`, `phase` e `log` tramite un processo Node PTC. Una fase è anche vocabolario di visualizzazione: non definisce da sola una macchina a stati persistente. Un consumer specializzato può possedere uno script fisso e impostare provider e limiti, invece di lasciare il programma al modello. [Contratto workflow](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/workflow.md)

La [implementazione PTC](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/workflow/workflow-ptc/README.md) non ha deadline complessiva e richiede cancellazione del chiamante. I limiti dei combinatori sono cooperativi; il processo e il sandbox hanno limiti propri. Non c'è qui prova di un motore di job riprendibili equivalente a un orchestratore durevole. Per riavvio e idempotenza end-to-end occorre progettare controller persistente, chiavi delle operazioni e riconciliazione, oppure integrare un sistema che li fornisca.

La distinzione è esplicita nei [webhook](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/experimental/webhook/README.md): niente coda, replay, retry, deduplica o risultato di completamento. La consegna ripetuta può creare sessioni ripetute. Non presentare quindi «riavvio senza doppie scritture» come proprietà nativa di DSH.

Il [loop standard](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/README.md) documenta anche l'assenza di un budget intrinseco del turno. Una policy deve fermare le iterazioni. È inoltre dichiarato un limite di shutdown per cui un ultimo evento di fine turno può restare solo in memoria: conservare la conversazione e garantire un workflow aziendale sono contratti diversi.

## Tre plugin reali da studiare

1. **Ralph:** plugin sperimentale con script fisso, un agente nuovo per round, obiettivo immutabile e passaggio di un rapporto strutturato limitato. Dimostra che la strategia del loop può essere proprietà del runtime e non del prompt. Tuttavia il completamento è riferito dal lavoratore e **non verificato indipendentemente**. Usarlo come esempio architetturale, non come certificatore automatico. [README e codice](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/experimental/tool-ralph/README.md)

2. **Tool-call timeout policy:** wrapper reale su `tools/execute`, incluso nel bundle base. Applica i timeout dichiarati dai tool usando cancellazione cooperativa e restituisce un errore dopo l'arresto. Non può interrompere forzatamente un tool che ignora il segnale. Esempio piccolo e leggibile di comportamento dell'harness indipendente dalla capacità del modello. [README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/guard/timeout-policy/README.md)

3. **GitHub review da webhook:** overlay ufficiale che verifica l'evento e avvia una sessione read-only per una PR diventata pronta per la revisione. Include workspace, preset, SHA preciso e trattamento dei metadati come dati non fidati. È un esempio reale di ingresso aziendale guidato da eventi. HTTP `202` significa accettazione in memoria, non successo del lavoro. [Guida e overlay](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/github-review.md)

Due altri riferimenti utili: [Auto review](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/experimental/auto-review/README.md), sperimentale e disabilitato di default, aggiunge una chiamata di valutazione per ogni tool e può sbagliare; [memoria via MCP](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/mcp-memory.md) fornisce configurazioni di interoperabilità per provider terzi, non memoria semantica già attiva nel prodotto.

## Modelli, piattaforma e maturità

Il [provider pi-ai](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm-pi-ai/README.md) supporta cataloghi di vari provider e gateway/self-hosted compatibili configurati esplicitamente. Questo consente di sperimentare il nostro harness con più modelli; non implica stessa qualità, identiche capacità o un risparmio garantito. La scelta dinamica per fase sarebbe una nostra policy.

La guida sviluppo supporta Node 22.19+ e 24+, pnpm fissato dal progetto e Windows nativo oppure WSL 2. WSL è opzionale; checkout e dipendenze vanno mantenuti nello stesso ambiente. Le dipendenze native e i provider scelti richiedono verifiche sulla macchina del webinar. [Sviluppo](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/development.md)

DSH resta developer preview con cambiamenti incompatibili annunciati. La [nota ufficiale di sicurezza](https://github.com/deepseek-ai/deepseek-harness/blob/master/SAFETY.md) lo dichiara non auditato e non pronto per essere trattato come infrastruttura sicura di produzione. Per il webinar usare una versione fissata e un ambiente di prova è una scelta operativa, non una conclusione sulle prestazioni.

## Come dimostrare il valore senza trucchi

Il file ufficiale [BENCHMARK.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/BENCHMARK.md) contiene soltanto istruzioni di avvio: rimanda al Python SDK e alla variante minima `jsonrpc-agent`, raccomandando workspace e ID sessione separati. **Non contiene punteggi o un confronto riproducibile pubblicato DSH contro Codex.** Questo riscontro riguarda quel documento e le fonti esaminate, non prova l'inesistenza assoluta di altri benchmark.

Questa è una proposta sperimentale, non un risultato già misurato:

- Stesso modello, stesso contratto, stessi dati e stesso budget: DSH standard contro configurazione specializzata.
- Stessa suite esterna di accettazione per entrambe le configurazioni; casi aggiuntivi non usati per rifinire le istruzioni.
- Registrare integrazioni corrette, falsi completamenti, interventi umani, latenza e costo per integrazione riuscita.
- Mostrare più prove preeseguite oltre alla singola demo live. Un errore intercettato è una dimostrazione del controllo; non è una prova che l'altro agente fallirebbe sempre.
- Confrontare separatamente con Codex ben configurato. Se Codex raggiunge gli stessi risultati a minor costo totale, è un risultato utile: il vantaggio possibile del nostro harness è possedere e integrare il processo, non una superiorità automatica del modello.

## Verifiche per il documento operativo

Verifica documentale aggiuntiva del 13 ottobre 2026 per un coding agent aziendale distribuibile. Nessuna installazione o esecuzione del prodotto effettuata. I nomi `azienda` e `nostro-bundle` qui sotto sono scelte progettuali, non pacchetti esistenti.

**Avvio e build.** Il [manifest del repository](https://github.com/deepseek-ai/deepseek-harness/blob/master/package.json) dichiara Node `^22.19.0 || >=24.0.0` e `pnpm@11.28.5`. Per una nuova copia sorgente il [README](https://github.com/deepseek-ai/deepseek-harness/blob/master/README.md#run-from-source) prescrive:

```powershell
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

Il percorso rapido documentato è `npx @deepseek-ai/dsh web`. Windows nativo e WSL 2 sono entrambi contemplati; WSL non è un prerequisito. [Guida sviluppo](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/development.md). Per la distribuzione aziendale servirà fissare la versione realmente collaudata.

**Profilo e bundle esterno.** Per inizializzare una nuova composizione con interfaccia Web senza avviarla, la sintassi verificata è:

```powershell
pnpm dsh --profile azienda --from-default-profile web --dump-config
pnpm dsh plugin --profile azienda add ./packages/nostro-bundle
pnpm dsh --profile azienda --dump-config
pnpm dsh --profile azienda
```

Il bundle deve esistere prima del secondo comando. `--from-default-profile` funziona solo per una destinazione nuova e va omesso negli avvii successivi. Usare direttamente `plugin add` su un nome sconosciuto crea un profilo con il solo base: non aggiunge automaticamente l'interfaccia Web. La configurazione effettiva include anche patch personali della macchina, con precedenza superiore al bundle. [Riferimento CLI](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/reference/README.md)

Il pacchetto distribuito dichiara `dsh.bundle.patch` nel proprio `package.json` e include JavaScript compilato e patch YAML. Sono documentate distribuzione npm oppure tarball generato da `pnpm pack`, installabile con `dsh plugin --profile azienda add ./nome-versione.tgz`. Da checkout sorgente si usa il prefisso `pnpm dsh`. I pacchetti DSH condivisi richiedono corretta gestione dei peer; installare sorgenti Git richiede anche build/allowlist. Questo verifica un percorso di distribuzione del bundle, non un generatore automatico di installer desktop con marchio aziendale. [Packaging](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)

**Modello aziendale.** La configurazione Custom model API accetta endpoint aziendali con protocollo OpenAI Chat Completions, OpenAI Responses o Anthropic Messages. Servono ID modello, capacità e credenziale coerenti; impostazioni di compatibilità come `supportsDeveloperRole` e `maxTokensField` dipendono dal gateway. Una risposta testuale corretta non prova il funzionamento dell'agente. [Guida provider](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/providers.md)

Vanno verificati chiamata tool, argomenti strutturati, lettura del risultato e prosecuzione. Per esempio, vLLM documenta opzioni di avvio, parser e template specifici per le chiamate automatiche; un output parsabile non garantisce una decisione corretta. [Tool calling vLLM](https://docs.vllm.ai/en/latest/features/tool_calling/). Il modello/server interno non è ancora identificato: nessuna compatibilità specifica è stata provata. PTC continua a richiedere la chiamata `run_code`, quindi non elimina tale requisito. [Presentazione PTC](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-tool-presentation/README.md)

**Mini-demo opzionale con prodotti esterni.** I bundle ufficiali aggiungono `subagent_codex` e `subagent_claude_code`. Ogni chiamata avvia un lavoratore nuovo per un compito testuale; non rappresenta una chat persistente con follow-up. Il tool condiviso espone un parametro `cwd` per incarico: se omesso eredita la directory del chiamante, mentre un percorso relativo è risolto rispetto a essa. Entrambi i provider ricevono la directory così selezionata. Possiamo quindi assegnare direttamente al revisore la copia dello snapshot senza creare obbligatoriamente una sessione DSH dedicata. [Schema del tool](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/subagent/tool-subagent/src/index.ts), [provider Codex](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/subagent/subagent-codex/src/index.ts), [provider Claude](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/subagent/subagent-claude-code/src/index.ts). Selezionare una directory non crea isolamento né permessi read-only: nel progetto predisporremo copie o worktree e restrizioni dell'ambiente, con esecuzione sequenziale.

- **Codex:** il codice avvia un nuovo app-server e passa il cwd al thread effimero. `never` non cambia il sandbox nativo; `approve-for-me` imposta `workspace-write` e automatic review; il bypass è esplicito. Sono policy del prodotto figlio, non prompt di approvazione gestiti dalla UI DSH. [Avvio](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/subagent/subagent-codex/src/run.ts), [protocollo e permessi](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/subagent/subagent-codex/src/wire.ts).
- **Claude Code:** autenticazione e impostazioni restano native; default `dontAsk`. `acceptEdits` autorizza modifiche ai file, mentre ulteriori richieste interattive sono negate. Il provider non offre filtraggio degli strumenti o persona personalizzata attraverso il contratto condiviso DSH. Non applica un timeout totale né rollback. [Contratto del provider](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/subagent/subagent-claude-code/README.md).
- **Credenziali:** l'ambiente dei figli è ripulito dalle variabili che sembrano credenziali; i valori necessari devono essere configurati nell'overlay `env`. La sessione Claude ha `persistSession: false`, disabilita `AskUserQuestion` e rifiuta le richieste di approvazione residue. [Implementazione Claude](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/subagent/subagent-claude-code/src/run.ts).
- **Payload:** i manifest fissano attualmente Codex `0.153.4` e Claude Agent SDK `0.3.263`. [Manifest Codex](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/subagent/subagent-codex/package.json), [manifest Claude](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/subagent/subagent-claude-code/package.json). Servono payload nativi completi; il login resta da predisporre, senza fallback all'eseguibile dell'host. [Limiti del provider](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/subagent/subagent-claude-code/README.md#known-limitations-and-deferred-work).

**Assunzioni da non promuovere a funzionalità:** una catena DSH → Codex implementa → DSH controlla → Claude rivede → DSH valida è un nostro workflow, non una modalità già pronta. Il padre riceve risposta finale o diagnostica, non ragionamento e attività interne in diretta: deve rileggere file e rieseguire verifiche per mostrare diff e test. L'uso del modello interno non rende automaticamente interne le successive chiamate dei prodotti delegati. Permessi del padre, policy native dei figli e isolamento del sistema operativo sono livelli distinti. La cronologia persistente non implica ripresa sicura di job o deduplica degli effetti esterni; queste restano responsabilità applicative.
