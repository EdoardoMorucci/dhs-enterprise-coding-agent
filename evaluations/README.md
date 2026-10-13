# Valutare il prototipo senza confondere demo e benchmark

Il primo esperimento misura la correzione del caso ordini e l'affidabilità del controllo di consegna. I casi in `cases.json` sono un protocollo da eseguire: non contengono risultati di modelli già osservati.

Confrontare DSH standard e questa distribuzione usando lo stesso modello, lo stesso endpoint, lo stesso snapshot iniziale e la stessa suite esterna. Per DSH standard raccogliere il messaggio di completamento e poi eseguire il verificatore dall'esterno. Per la distribuzione raccogliere anche lo stato del task. La suite che assegna l'esito deve essere identica.

I test automatici del repository qualificano componenti e condizioni avverse. Non sono tentativi del modello e non vanno contati nel tasso di successo dell'agente. Le risposte di un server fittizio usato per provare il protocollo DSH non sono inferenza reale.

## Protocollo

1. Fissare commit, release DSH, identificativo esatto del modello, parametri, hardware, permessi, limite di tempo e budget di chiamate. Documentare tutte le differenze inevitabili tra configurazioni.
2. Creare una copia iniziale nuova per ogni prova. Conservare il digest iniziale e il prompt esatto, senza inserire la soluzione di riferimento nel contesto dell'agente.
3. Eseguire almeno tre ripetizioni per configurazione e caso. Alternare l'ordine delle configurazioni. Non correggere i prompt tra le ripetizioni valutate.
4. Lasciare le istruzioni invariate durante la prova. Registrare ogni intervento umano, inclusi chiarimenti e modifiche manuali. Un timeout rimane nel denominatore.
5. Eseguire la verifica indipendente sul risultato e conservare rapporto, digest finale, versione della suite e isolamento effettivo. Per il risultato «verificato» serve il percorso Docker qualificato.
6. Compilare una riga di `results-template.csv` per ogni esecuzione. Lasciare vuoti i valori non disponibili: non stimare token o consumi dal testo della chat.

Le tre ripetizioni sono esplorative: riportare i conteggi grezzi e la variabilità, senza presentare il campione come prova di superiorità generale. I casi di controllo del completamento condividono la stessa applicazione e non costituiscono sei problemi di programmazione indipendenti.

## Indicatori

| Indicatore | Definizione |
|---|---|
| Successo applicativo | Il candidato passa la suite esterna sul digest finale |
| Falso completamento del modello | Il modello dichiara il lavoro completato, ma la verifica finale fallisce o manca |
| Falso stato verificato | Il sistema assegna `verified` senza una ricevuta Docker positiva e attuale |
| Interventi umani | Numero e descrizione degli aiuti necessari dopo il prompt iniziale |
| Durata | Tempo totale fino alla consegna o al limite, comprese attese e verifiche |
| Risorse | Chiamate e token se osservabili; macchina e tempo di inferenza per il modello interno |

Tenere distinti il testo del modello e lo stato deciso dall'harness. Il controllo può impedire un falso stato `verified`, ma non garantisce che il modello non scriva una frase sbagliata.

## Estensioni del confronto

La mini demo Codex → Claude Code cambia i lavoratori e usa servizi esterni: riportarla separatamente dal confronto a modello costante. Per confrontare OpenCode occorre implementare e verificare la stessa personalizzazione anche lì. Avere realizzato soltanto DSH non dimostra che OpenCode sia meno adatto.

Mapping di stati, paginazione e altri bug applicativi descritti nella proposta iniziale restano un'estensione del campione. Questa versione concentra il pilot sul caso ordini e sui controlli effettivamente implementati.
