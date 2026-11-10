# Erststart und Onboarding: Design

Stand: 2026-11-10. Status: abgestimmt mit Philipp, Umsetzung pro Issue auf Zuruf.

## Zielgruppen

Agile Coaches, Scrum Master, Product Owner, Führungskräfte. Drei der vier planen vor allem für andere, oft für mehrere Teams. Der Einstieg geht deshalb von einer planenden Person aus; der eigene Kalender ist optional.

## Ist-Zustand und Brüche

1. Ein Team aus einer Vorlage hat keine Personen. Auslastung und Export pro Person bleiben leer. Personen entstehen unter Einstellungen, Mitgliedschaften unter Team.
2. Region (de-sn), Zeitzone, Planungszeitraum und Wochenstunden werden still gesetzt.
3. Im leeren Zustand widersprüchliche Signale: roter Hinweis „Team hinzufügen“, Startkarte, Filter ohne Daten, „Speichern“ als Hauptknopf.
4. Autosave und die Rolle der Datei werden nirgends erklärt.
5. „Mit einem leeren Arbeitsbereich beginnen“ führt in eine leere Team-Ansicht.
6. Die Hilfe „Erste Schritte“ braucht 11 Schritte über 6 Ansichten.

## Soll: User Journey

1. **Ankommen**: eine Hauptaktion „Neu planen“, klein daneben „Datei öffnen“ und „Beispiel ansehen“.
2. **Assistent „Neu planen“**
   1. Arbeitsweise: Scrum, Kanban, SAFe oder „Ohne Vorlage“; jede Kachel sagt in einem Satz, was sie mitbringt.
   2. Team: Name und Takt-Start (vorbelegt wie heute in `applyTemplate`).
   3. Team zusammenstellen: pro Rolle der Vorlage Namen eintragen (mehrere möglich); optional „Ich bin selbst dabei als …“. Überspringbar.
   4. Rahmen bestätigen: Zeitzone aus dem Browser, Region als Vorschlag, Planungszeitraum.
3. **Ergebnis**: Kalender mit dem Team (oder der eigenen Person, falls eingetragen). Einmalige Hinweiskarte mit „Termine anpassen“, „Kalender verteilen“ und dem Satz zu Autosave und Datei.
4. **Anpassen** in Termine, Auslastung zeigt die Wirkung.
5. **Verteilen**: .ics pro Person oder Rolle.
6. **Wiederkommen**: Autosave; Datei nur zum Sichern und Teilen.
7. **Ausbauen**: „Weiteres Team anlegen“ startet denselben Assistenten, vorhandene Personen stehen zur Auswahl.

Später, ohne Assistent: Arbeitszeit und Teilzeit, Schulferien, Auslastungsgrenzen, Kategorien, Zyklen, Meilensteine, Annahmen, eigene Vorlagen und Regionen. Leerzustände nennen jeweils genau einen nächsten Schritt.

## Technik

- Rein clientseitig, keine neuen Abhängigkeiten.
- Neue reine Funktion in `src/core` (z. B. `setupTeam`): wendet die Vorlage an, legt Personen und Mitgliedschaften an und setzt die Rahmen-Einstellungen. Unit-Tests.
- Der Assistent schreibt alles mit einem `workspace.apply`, also ein Strg+Z.
- UI in `src/ui/setup/`; `StartView` wird schlanker.
- WCAG 2.2 AA für jeden Schritt; axe in E2E.

## Umbaumaßnahmen (je ein Issue)

1. Leeren Zustand aufräumen (release:hotfix).
2. Assistent „Neu planen“ mit `setupTeam` (release:minor).
3. Rahmen-Schritt mit Vorschlägen für Zeitzone und Region.
4. Hinweiskarte nach dem Einrichten.
5. Export „Kalender verteilen“: mehrere .ics auf einmal.
6. „Weiteres Team anlegen“ über die Teamauswahl.
7. Hilfe „Erste Schritte“, E2E-Tests und Screenshots nachziehen (läuft mit jeder Maßnahme mit).

Reihenfolge: 1 und 2 zuerst, dann 3 und 4, dann 5 und 6.
