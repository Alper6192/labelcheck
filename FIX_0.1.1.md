# Korrektur 0.1.1

Diese Version behebt den Fehler `Cannot read properties of undefined (reading tokenizer_class)`.

Änderungen:

- Transformers.js auf 3.8.1 fest angeheftet.
- Florence-Tokenizer wird separat über `AutoTokenizer` geladen.
- Bild- und Texteingaben werden getrennt an Florence übergeben.
- Fehlende Florence-Tokenizer-Metadaten werden beim Build ergänzt.
- GitHub-Actions- und Service-Worker-Cache wurden versioniert, damit keine alte Fassung weiterverwendet wird.
