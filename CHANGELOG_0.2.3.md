# Version 0.2.3

- Behebt verschobene Profilkästchen im Scanner.
- Die Breite/Höhe der Kundenname-OCR-Box wird nicht mehr als Maßstab für das gesamte Label verwendet.
- Mehrere gleichlautende Anker (z. B. HENKEL im Logo und in der Adresse) werden über den gemeinsamen geometrischen Treffer von Batch, IDH und Gewicht unterschieden.
- Skalierung, Drehung und Verschiebung werden durch Feldkonsens aus Kundenanker und Wertpositionen bestimmt.
- Beschriftungstexte neben den Werten bleiben weiterhin ohne Bedeutung.
- Service-Worker-Cache auf 0.2.3 angehoben.
