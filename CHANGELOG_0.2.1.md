# Änderungen 0.2.1

- Kritischer Darstellungs- und Zuordnungsfehler behoben: Ein einzelner Kundenanker erzeugt keine Homographie mehr.
- Stabile Ähnlichkeitstransformation aus Mittelpunkt, Drehung und einheitlicher Skalierung.
- Plausibilitätsprüfung verhindert kollabierte oder extrem große Feldprojektionen.
- Anonyme Geometrie-Feinjustierung bleibt weiterhin möglich, sobald ein Profil im Editor kalibriert wurde.
- Zusätzlicher Regressionstest für weit vom Anker entfernte Felder.
