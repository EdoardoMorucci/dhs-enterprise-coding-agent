# Webinar: costruire il nostro coding agent con DSH

Pubblico: sviluppatori e IT. Durata proposta: 35 minuti più domande. Questa è la scaletta operativa; le prove complete con modello interno e deleghe autenticate devono essere registrate prima di dichiarare pronta la demo.

## Il messaggio da dimostrare

«Abbiamo preso un harness estendibile e costruito una distribuzione nostra: colleghiamo il modello previsto, portiamo le convenzioni del progetto, conserviamo lo stato del lavoro e decidiamo attraverso verifiche eseguibili quando una modifica è consegnabile.»

Il momento centrale è osservabile: l'agente modifica l'applicazione, ma il sistema può ancora rifiutare la consegna. Dopo i test riusciti, un'ulteriore modifica rende vecchia l'attestazione. Il controllo appartiene alla nostra distribuzione e segue il codice effettivamente verificato.

## Preparazione sulla macchina del webinar

- Fissare commit, runtime e modello. Preparare dipendenze, immagini container e credenziali necessarie prima della prova di rete interna.
- Qualificare il modello attraverso un task completo con uso degli strumenti. Un endpoint che risponde a `/models` non basta.
- Preparare due copie nuove dell'app ordini: una interna e una ibrida. Usare esclusivamente dati sintetici.
- Tenere la suite e la soluzione di riferimento fuori dalle copie visibili ai lavoratori.
- Verificare Docker e i permessi effettivi del revisore. Se manca uno di questi requisiti, la parte relativa resta una spiegazione dell'implementazione, senza dichiararla una demo riuscita.
- Provare due esecuzioni complete consecutive, ciascuna da reset. Annotare tempi, interventi e rapporti. Registrarne una come supporto dichiarato.
- Per affermare «funziona senza Internet», bloccare realmente la rete esterna lasciando l'endpoint interno disponibile e controllare anche browser e processi figli.

## Sequenza sullo schermo

| Tempo | Azione | Evidenza che il pubblico deve vedere |
|---|---|---|
| 0–4 min | Presentare i componenti: modello, loop, strumenti, contesto, stato e verificatore | Diagramma e percorsi interni/ibridi separati |
| 4–8 min | Avviare la distribuzione e mostrare configurazione e strumenti | Versione fissata, endpoint scelto, strumenti aziendali; nessuna chiave mostrata |
| 8–11 min | Aprire l'app ordini, inviare con timeout simulato, riprovare lo stesso identificativo | Due ordini con lo stesso `requestId` |
| 11–18 min | Dare il task all'agente e seguire indagine, modifica e verifica | Letture e scritture reali, obiettivo salvato, esito della suite esterna |
| 18–22 min | Provare la consegna senza evidenza e l'invalidazione dopo una modifica | Rifiuto del completamento e digest/evidenza obsoleta |
| 22–25 min | Riaprire il lavoro; se qualificata, mostrare anche la compattazione | Obiettivo, criteri e verifiche pendenti recuperati dallo stato persistito |
| 25–31 min | Usare la copia ibrida: Codex implementa, Claude Code revisiona, il padre verifica | Incarichi sequenziali, snapshot del revisore, risultati e verifica finale |
| 31–35 min | Aprire un'estensione del bundle e discutere distribuzione e confronto | Punto preciso in cui cambiamo comportamento, risultati misurati e limiti |

La durata della fase di correzione va misurata sul modello reale. Se supera lo spazio disponibile, ridurre il contorno o usare la registrazione dichiarata; non sostituire di nascosto la soluzione di riferimento al risultato dell'agente.

## Prompt iniziale

> Nell'app ordini il primo invio può registrare l'ordine e restituire un timeout. Il retry con lo stesso requestId crea un duplicato. Correggi il problema. Le richieste diverse devono restare distinte; i dati non validi vanno rifiutati; il riuso dello stesso identificativo con dati differenti deve essere gestito. Conserva lo stato dell'indagine e verifica la modifica prima di consegnarla.

La suite verifica il contratto del modulo ordini; la pagina rende visibile il difetto. L'applicazione conserva gli ordini in memoria: non presentarla come un sistema con persistenza o come una soluzione completa all'idempotenza di un servizio distribuito.

## Le tre personalizzazioni da aprire nel codice

1. **Contesto e memoria:** mostrare una convenzione in `company-knowledge`, poi `company_task_note`, lo schema del task e il contesto limitato che viene reinserito prima del passo dell'agente. Le note aggiungono ipotesi e controlli, conservando i motivi autorevoli dell'host. Spiegare come si sostituiscono gli esempi con documenti curati del team.
2. **Strumenti e consegna:** mostrare il registro ristretto, il verificatore esterno e il controllo su digest, tentativo ed esito. La risposta del modello e lo stato `verified` sono due informazioni diverse.
3. **Delega opzionale:** mostrare la sequenza controllata e il confine del container del revisore. Il servizio esterno riceve il materiale della demo ibrida: questa parte non fa parte della promessa di inferenza interna.

## Risposte alle obiezioni prevedibili

**«Lo fa anche Codex o Claude Code.»** Possono risolvere il bug, e il confronto deve riconoscerlo. Qui mostriamo come distribuire e mantenere il nostro prodotto attorno al lavoro dell'agente: modello selezionabile, strumenti consentiti, stato e criteri di consegna implementati da noi. Per chi vuole soltanto un assistente di programmazione già pronto, costruire questa distribuzione potrebbe non convenire.

**«Perché non OpenCode?»** È un'alternativa seria anche per modelli interni e personalizzazioni. In questo progetto abbiamo scelto e qualificato i punti di estensione DSH. Un vantaggio su OpenCode richiederebbe realizzare la stessa modifica anche lì e confrontare risultato, quantità di codice e manutenzione. La demo prova la fattibilità su DSH.

**«Il nostro agente è migliore?»** Possiamo misurare se i controlli riducono le consegne accettate erroneamente e se le convenzioni aiutano sul nostro caso. Non possiamo dedurre che il modello programmi meglio su qualsiasi repository. Usare il [protocollo di valutazione](../evaluations/README.md) e mostrare solo esecuzioni registrate.

**«Cosa serve per usarlo davvero in azienda?»** Un deployment qualificato del modello, isolamento funzionante, convenzioni e verifiche specifiche per il repository, responsabilità sugli aggiornamenti e una prova end-to-end. Il prototipo parte dal caso ordini: la suite di un altro progetto deve essere realizzata e protetta allo stesso modo.

## Se qualcosa fallisce durante la presentazione

Mostrare lo stato effettivo e il messaggio d'errore. Un fallimento di verifica è utile per spiegare il controllo; un endpoint irraggiungibile o un container non avviabile non dimostra una correzione riuscita. Per un lavoratore interrotto conservare il workspace e ispezionarlo prima della ripresa: interrompere non annulla le modifiche.

La registrazione di supporto va annunciata come tale, indicando versione e data della prova. Se nessuna prova reale è disponibile, presentare codice e test dei componenti e rimandare la dimostrazione end-to-end.
