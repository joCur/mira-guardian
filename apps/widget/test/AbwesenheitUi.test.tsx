import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChangeWithVotes, Guardian, VoteStatus } from "@guardian/shared";
import { ChangesTab } from "../src/renderer/components/tabs/ChangesTab.js";
import { MeetingTab } from "../src/renderer/components/tabs/MeetingTab.js";
import { GuardiansTab } from "../src/renderer/components/tabs/GuardiansTab.js";
import type { MeetingResponse } from "../src/renderer/api/client.js";
import type { UpdateStatus } from "../src/types/update.js";

// Die Oberfläche liest die Abwesenheit gegen das heutige Datum — der Zeitraum
// muss deshalb aus der Sicht des Testlaufs laufend sein.
const heute = new Date();
const tag = (versatzTage: number) => {
  const d = new Date(heute);
  d.setDate(d.getDate() + versatzTage);
  return d.toISOString().slice(0, 10);
};
const LAUFEND = { from: tag(-3), until: tag(+4) };

function change(id: string, votes: Array<[string, VoteStatus]>): ChangeWithVotes {
  return {
    id, repo: "r", branch: "main", filePath: `docs/decisions/${id}.md`, changeKind: "modify",
    commitId: "abc1234", commitShort: "abc1234", authorName: "Anna", authorEmail: "a@x.de",
    committedAt: "2026-08-15T09:00:00Z", summary: "s", oldMd: "alt", newMd: "neu",
    previousPath: null, baselineCommitId: null, cycleId: "cy", firstSeenAt: "t",
    votes: votes.map(([g, status]) => ({ changeId: id, guardianId: g, status,
      comment: null, updatedAt: "t", seenAt: null })),
    adoLink: "http://x",
  };
}

const guardian = (id: string, name: string, from: string | null = null, until: string | null = null): Guardian => ({
  id, name, email: `${id}@x.de`, initials: name.slice(0, 2).toUpperCase(), avatarColor: "#89b4fa",
  createdAt: "t", isFounder: id === "g1", absentFrom: from, absentUntil: until,
});

describe("Änderungen-Tab — Leseliste", () => {
  const ohneMich = change("c1", [["g1", "uebersprungen"], ["g2", "akzeptiert"], ["g3", "akzeptiert"]]);
  const offen = change("c2", [["g1", "offen"]]);

  it("zeigt den Abschnitt nur, wenn es etwas nachzulesen gibt", () => {
    const { unmount } = render(<ChangesTab toRate={[offen]} acceptedByMe={[]} selectedId="c2"
      guardianId="g1" onSelect={vi.fn()} onVote={vi.fn()} />);
    expect(screen.queryByText("OHNE MICH ENTSCHIEDEN")).toBeNull();
    unmount();

    render(<ChangesTab toRate={[offen]} acceptedByMe={[]} decidedWithoutMe={[ohneMich]} selectedId="c2"
      guardianId="g1" onSelect={vi.fn()} onVote={vi.fn()} onSeen={vi.fn()} />);
    expect(screen.getByText("OHNE MICH ENTSCHIEDEN")).toBeTruthy();
  });

  it("ist eingeklappt und zeigt die Einträge erst auf Klick", async () => {
    render(<ChangesTab toRate={[offen]} acceptedByMe={[]} decidedWithoutMe={[ohneMich]} selectedId="c2"
      guardianId="g1" onSelect={vi.fn()} onVote={vi.fn()} onSeen={vi.fn()} />);
    expect(screen.queryByText("c1.md")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /OHNE MICH ENTSCHIEDEN/ }));
    expect(screen.getByText("c1.md")).toBeTruthy();
  });

  // Eine Auswahl aus der Leseliste muss links sichtbar sein, sonst zeigt die
  // rechte Seite eine Änderung, die nirgends markiert ist.
  it("eine ausgewählte Nachlese-Änderung klappt den Abschnitt auf", () => {
    render(<ChangesTab toRate={[]} acceptedByMe={[]} decidedWithoutMe={[ohneMich]} selectedId="c1"
      guardianId="g1" onSelect={vi.fn()} onVote={vi.fn()} onSeen={vi.fn()} />);
    expect(screen.getByText("c1.md")).toBeTruthy();
  });

  it("statt der Bewertungsknöpfe stehen Gesehen und Einspruch bereit", () => {
    render(<ChangesTab toRate={[]} acceptedByMe={[]} decidedWithoutMe={[ohneMich]} selectedId="c1"
      guardianId="g1" onSelect={vi.fn()} onVote={vi.fn()} onSeen={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Gesehen" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Einspruch" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Akzeptiert/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Neu bewerten" })).toBeNull();
    expect(screen.getByText("OHNE DICH ENTSCHIEDEN")).toBeTruthy();
  });

  it("Gesehen hakt genau diese Änderung ab", async () => {
    const onSeen = vi.fn();
    render(<ChangesTab toRate={[]} acceptedByMe={[]} decidedWithoutMe={[ohneMich]} selectedId="c1"
      guardianId="g1" onSelect={vi.fn()} onVote={vi.fn()} onSeen={onSeen} />);
    await userEvent.click(screen.getByRole("button", { name: "Gesehen" }));
    expect(onSeen).toHaveBeenCalledWith(["c1"]);
  });

  it("alles abhaken schickt alle Ids der Leseliste", async () => {
    const onSeen = vi.fn();
    const zwei = [ohneMich, change("c9", [["g1", "uebersprungen"], ["g2", "akzeptiert"]])];
    render(<ChangesTab toRate={[]} acceptedByMe={[]} decidedWithoutMe={zwei} selectedId="c1"
      guardianId="g1" onSelect={vi.fn()} onVote={vi.fn()} onSeen={onSeen} />);
    await userEvent.click(screen.getByRole("button", { name: "Alle als gesehen markieren" }));
    expect(onSeen).toHaveBeenCalledWith(["c1", "c9"]);
  });

  it("Einspruch verlangt einen Kommentar und meldet Klärungsbedarf", async () => {
    const onVote = vi.fn();
    render(<ChangesTab toRate={[]} acceptedByMe={[]} decidedWithoutMe={[ohneMich]} selectedId="c1"
      guardianId="g1" onSelect={vi.fn()} onVote={onVote} onSeen={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Einspruch" }));
    const speichern = screen.getByRole("button", { name: "Bewertung speichern" });
    expect(speichern).toHaveProperty("disabled", true);
    await userEvent.type(screen.getByRole("textbox"), "so nicht");
    await userEvent.click(speichern);
    expect(onVote).toHaveBeenCalledWith("c1", "klaerung", "so nicht");
  });
});

describe("Offene Punkte — Abwesende", () => {
  const meeting = (changes: ChangeWithVotes[], offen = 0): MeetingResponse => ({
    changes, counts: { abgelehnt: 0, klaerung: 0, offen, gesamt: changes.length + offen },
  });
  const streitfall = change("c1", [["g1", "abgelehnt"], ["g2", "offen"], ["g3", "offen"]]);

  it("eine ausstehende Stimme eines Abwesenden steht als abwesend da", () => {
    const gs = [guardian("g1", "Anna"), guardian("g2", "Bert"), guardian("g3", "Cara", LAUFEND.from, LAUFEND.until)];
    render(<MeetingTab meeting={meeting([streitfall])} guardians={gs} onOpen={vi.fn()} />);
    expect(screen.getByText("abwesend")).toBeTruthy();
    // Bert ist anwesend und bleibt "ausstehend".
    expect(screen.getByText("ausstehend")).toBeTruthy();
    expect(screen.getByText(/Cara ist bis .* abwesend/)).toBeTruthy();
  });

  it("ohne Abwesenheit bleibt alles wie vorher", () => {
    const gs = [guardian("g1", "Anna"), guardian("g2", "Bert"), guardian("g3", "Cara")];
    render(<MeetingTab meeting={meeting([streitfall])} guardians={gs} onOpen={vi.fn()} />);
    expect(screen.queryByText("abwesend")).toBeNull();
    expect(screen.queryByText(/genügt/)).toBeNull();
  });

  // Greift die Untergrenze, wartet das Team weiter auf alle — dann darf die
  // Zeile auch nicht "abwesend" behaupten.
  it("eine wirkungslose Abwesenheit verschweigt die Oberfläche nicht als Zustand", () => {
    const gs = [guardian("g1", "Anna"), guardian("g2", "Bert", LAUFEND.from, LAUFEND.until),
      guardian("g3", "Cara", LAUFEND.from, LAUFEND.until)];
    render(<MeetingTab meeting={meeting([streitfall])} guardians={gs} onOpen={vi.fn()} />);
    expect(screen.queryByText("abwesend")).toBeNull();
  });
});

describe("Hüter-Tab — Abwesenheit pflegen", () => {
  const noUpdate: UpdateStatus = { phase: "idle", version: null, percent: 0, notesUrl: null, message: null };
  const CODE = { code: "MB-HWFT-NMR7", expiresAt: "2026-08-04T12:00:00.000Z", guardianName: "Anna" };

  function setup(gs: Guardian[], onAbsence = vi.fn(async () => {})) {
    render(<GuardiansTab guardians={gs} pending={[]} onInvite={vi.fn()}
      serverUrl="http://localhost:4000" onSignOut={vi.fn(async () => {})}
      devices={[]} onRelink={vi.fn(async () => CODE)} onRevoke={vi.fn(async () => {})}
      onAbsence={onAbsence} appVersion="0.1.0" serverVersion={null}
      update={noUpdate} onCheckUpdate={vi.fn()} />);
    return { onAbsence };
  }

  it("zeigt eine laufende Abwesenheit als Chip", () => {
    setup([guardian("g1", "Anna"), guardian("g2", "Bert"),
      guardian("g3", "Cara", LAUFEND.from, LAUFEND.until)]);
    expect(screen.getByText(/abwesend bis/)).toBeTruthy();
  });

  it("trägt einen Zeitraum ein", async () => {
    const { onAbsence } = setup([guardian("g1", "Anna"), guardian("g2", "Bert"), guardian("g3", "Cara")]);
    await userEvent.click(screen.getAllByRole("button", { name: "Abwesenheit eintragen" })[2]!);
    const felder = screen.getAllByLabelText(/VON|BIS/) as HTMLInputElement[];
    // Ein Datumsfeld lässt sich in jsdom nicht tippen — der Wert wird gesetzt,
    // wie es der Datumswähler des Browsers tut. Von ist mit heute vorbelegt.
    fireEvent.change(felder[1]!, { target: { value: LAUFEND.until } });
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(onAbsence).toHaveBeenCalledWith("g3", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), LAUFEND.until);
  });

  it("weist auf die Untergrenze hin, wenn die Abwesenheit nicht wirkt", () => {
    setup([guardian("g1", "Anna"), guardian("g2", "Bert", LAUFEND.from, LAUFEND.until)]);
    expect(screen.getByText(/Wirkt derzeit nicht/)).toBeTruthy();
  });

  it("eine wirksame Abwesenheit bekommt keinen Warnhinweis", () => {
    setup([guardian("g1", "Anna"), guardian("g2", "Bert"),
      guardian("g3", "Cara", LAUFEND.from, LAUFEND.until)]);
    expect(screen.queryByText(/Wirkt derzeit nicht/)).toBeNull();
  });

  it("ohne Abwesenheits-Rückruf bleibt der Tab wie bisher", () => {
    render(<GuardiansTab guardians={[guardian("g1", "Anna")]} pending={[]} onInvite={vi.fn()}
      serverUrl="http://localhost:4000" onSignOut={vi.fn(async () => {})}
      devices={[]} onRelink={vi.fn(async () => CODE)} onRevoke={vi.fn(async () => {})}
      appVersion="0.1.0" serverVersion={null} update={noUpdate} onCheckUpdate={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Abwesenheit eintragen" })).toBeNull();
  });
});
