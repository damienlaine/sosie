"""Core behaviour without any model: script parsing, pronunciation, audio editing, projects (needs ffmpeg)."""
import json
import os
import shutil

import numpy as np
import pytest

from sosie import audio, project, scripts, text, tts

SR = 48000
needs_ffmpeg = pytest.mark.skipif(not shutil.which("ffmpeg"), reason="ffmpeg not installed")


def speechlike(segments, sr=SR):
    """A signal of tone bursts ("words") and silences: [(seconds, on), …]."""
    out = []
    rng = np.random.default_rng(0)
    for dur, on in segments:
        n = int(dur * sr)
        t = np.arange(n) / sr
        out.append(0.3 * np.sin(2 * np.pi * 220 * t) * (1 + 0.1 * rng.standard_normal(n)) if on else 0.0005 * rng.standard_normal(n))
    return np.concatenate(out)


# ------------------------------------------------------------------ text and scripts
def test_tokens_glue_punctuation():
    tok = text.tokens("Bonjour , le monde ! « Oui » .")
    assert [t["t"] for t in tok] == ["Bonjour ,", "le", "monde !", "« Oui » ."]
    assert [t["p"] for t in tok] == [False, False, True, True]


def test_strip_tags():
    assert text.strip_tags("[sigh] Bon, [laughter] d'accord.") == "Bon, d'accord."


def test_parse_markdown_chapters_and_ids():
    chapters, timing = scripts.parse("# Un\n\n[A1] Première.\n\nDeuxième\nsur deux lignes.\n\n# Deux\n\nTroisième.", name="x.md")
    assert timing is None
    assert [c["title"] for c in chapters] == ["Un", "Deux"]
    assert chapters[0]["lines"] == [{"id": "A1", "text": "Première."}, {"id": "L002", "text": "Deuxième sur deux lignes.", "auto": True}]
    assert chapters[1]["lines"][0]["text"] == "Troisième."


def test_parse_srt_gives_timing():
    srt = "1\n00:00:01,000 --> 00:00:03,500\nHello <i>there</i>.\n\n2\n00:00:04,000 --> 00:00:05,000\nBye.\n"
    chapters, timing = scripts.parse(srt, name="x.srt")
    assert [ln["text"] for ln in chapters[0]["lines"]] == ["Hello there.", "Bye."]
    assert timing["L001"] == {"start": 1.0, "dur": 2.5, "vo": 1.0}


# ------------------------------------------------------------------ what the synthesis reads
def test_say_numbers_and_lexicon():
    pytest.importorskip("num2words")
    lex = {"rules": [[r"\bSosie\b", "Sozi"]], "spell": ["API"]}
    assert tts.say("« Sosie » a 3 API en 2025 ?.", "fr", lex) == "Sozi a trois A P I en deux mille vingt-cinq ?"
    assert tts.say('The "API" was born in 1998.', "en", lex) == "The A P I was born in nineteen ninety-eight."


def test_sentences_glue_short_ones():
    assert tts.sentences("Oui. C'est une phrase assez longue pour rester seule. Et voilà la suite, elle aussi assez longue.") == [
        "Oui. C'est une phrase assez longue pour rester seule.", "Et voilà la suite, elle aussi assez longue."]


def test_score_finds_missing_words_and_runaways():
    pytest.importorskip("num2words")
    heard = [("Bonjour", 0.0, 0.4), ("le", 0.5, 0.6), ("monde", 0.6, 1.0)]
    assert tts.score("Bonjour le monde.", heard, 1.2, "fr")[0] == 0
    bad, missing, *_ = tts.score("Bonjour tout le monde.", heard, 1.2, "fr")
    assert missing == ["tou"] and bad == 1                        # compared in "heard" form: silent endings dropped
    assert tts.score("Bonjour le monde.", heard, 30.0, "fr")[0] >= 3          # 30 s for three words: ran away


def test_align_words_one_per_word():
    pytest.importorskip("num2words")
    words = tts.align_words("Il fait beau , non ?", [("Il", 0.1, 0.2), ("fait", 0.2, 0.5), ("beau", 0.5, 0.9), ("non", 1.2, 1.5)], "fr")
    assert [w["t"] for w in words] == ["Il", "fait", "beau", ",", "non", "?"]
    assert all(b["s"] >= a["s"] for a, b in zip(words, words[1:]))


# ------------------------------------------------------------------ audio
def test_wav_roundtrip(tmp_path):
    y = np.sin(np.linspace(0, 100, SR)) * 0.5
    for write in (audio.write_wav16, audio.write_wav24):
        p = str(tmp_path / f"{write.__name__}.wav")
        write(p, y, SR)
        x, sr = audio.read_wav(p)
        assert sr == SR and x.shape == (SR, 1) and np.abs(x[:, 0] - y).max() < 1e-3
        assert abs(audio.wav_duration(p) - 1.0) < 1e-6


def test_find_pauses_and_cut():
    y = speechlike([(0.3, False), (0.6, True), (0.5, False), (0.6, True), (0.1, False), (0.6, True), (0.3, False)])
    pauses = audio.find_pauses(y, SR, 0.25, 3.0)
    assert len(pauses) == 1                                      # the 0.1 s gap is not a pause
    s, e = pauses[0]
    assert abs(s - 0.9) < 0.05 and abs(e - 1.4) < 0.05
    z = audio.cut(y, SR, [[s + 0.04, e - 0.04]])
    assert abs((len(y) - len(z)) / SR - (e - s - 0.08)) < 0.02


def test_splice_replaces_and_levels():
    y = speechlike([(0.2, False), (1.0, True), (0.3, False), (1.0, True), (0.2, False)])
    ins = 0.4 * speechlike([(0.5, True)])                       # a quieter insert is brought to the level of the take (±12 dB)
    out, s, e, d = audio.splice(y, SR, 1.25, 1.45, ins)
    assert abs(d - 0.5) < 1e-6
    assert abs(len(out) / SR - (len(y) / SR - (e - s) + 0.5 - 0.015 * 2)) < 0.01
    assert 0.5 < audio.speech_rms(out[int((s + 0.05) * SR):int((s + 0.45) * SR)], SR) / audio.speech_rms(y, SR) < 2


# ------------------------------------------------------------------ projects
@pytest.fixture
def proj(tmp_path, monkeypatch):
    monkeypatch.setenv("SOSIE_HOME", str(tmp_path / "home"))
    chapters, _ = scripts.parse("# Test\n\n[A] Un deux trois.\n\n[B] Quatre cinq six sept.\n", name="t.md")
    project.create(str(tmp_path / "p"), "Test", "fr", chapters)
    return project.Project(str(tmp_path / "p"), None, None)


def take_words(times, words):
    return [{"t": w, "s": a, "e": b} for w, (a, b) in zip(words, times)]


@needs_ffmpeg
def test_take_export_pauses_tempo(proj):
    y = speechlike([(0.2, False), (0.5, True), (0.6, False), (0.5, True), (0.6, False), (0.5, True), (0.2, False)])
    m = proj.add_take("A", y, SR, take_words([(0.2, 0.7), (1.3, 1.8), (2.4, 2.9)], ["Un", "deux", "trois."]), [0.1, 3.0], {})
    assert proj.sel["A"] == m["n"] and len(m["pauses"]) == 2
    exp = proj.path("export")
    d0 = json.load(open(os.path.join(exp, "durations.json")))["A"]["dur"]
    assert abs(d0 - 2.9) < 0.05
    proj.set_pauses("A", m["n"], cap=0.2)
    d1 = json.load(open(os.path.join(exp, "durations.json")))["A"]
    assert abs(d1["dur"] - (2.9 - d1["cut"])) < 0.05 and d1["cut"] > 0.7
    proj.set_tempo("A", m["n"], 1.25)
    d2 = json.load(open(os.path.join(exp, "durations.json")))["A"]
    w2 = json.load(open(os.path.join(exp, "words.json")))["A"]
    assert abs(d2["dur"] - d1["dur"] / 1.25) < 0.06 and w2[-1]["e"] <= d2["dur"] + 0.01
    proj.select("A", None)                                        # nothing kept: the line leaves the track
    assert "A" not in json.load(open(os.path.join(exp, "durations.json")))


@needs_ffmpeg
def test_edit_take_delete_passage(proj):
    y = speechlike([(0.2, False), (0.5, True), (0.4, False), (0.5, True), (0.4, False), (0.5, True), (0.2, False)])
    m = proj.add_take("A", y, SR, take_words([(0.2, 0.7), (1.1, 1.6), (2.0, 2.5)], ["Un", "deux", "trois."]), [0.1, 2.6], {})
    m["pauses"] = audio.find_pauses(y, SR, 0.1, 2.6)
    s, e = proj.passage("A", m["n"], 1, 1)                       # "deux", cut in the pauses around it
    d = proj.edit_take("A", m["n"], s, e)
    assert [w["t"] for w in d["heard"]] == ["Un", "trois."]
    assert abs(d["dur"] - (len(y) / SR - (e - s))) < 0.05
    assert proj.sel["A"] == d["n"] and m["n"] in proj.tk["A"]    # the edit is a new take; the old one stays


@needs_ffmpeg
def test_split_line_with_take_and_rename(proj):
    y = speechlike([(0.2, False), (0.4, True), (0.4, False), (0.4, True), (0.4, False), (0.4, True), (0.4, False), (0.4, True), (0.2, False)])
    times = [(0.2, 0.6), (1.0, 1.4), (1.8, 2.2), (2.6, 3.0)]
    m = proj.add_take("B", y, SR, take_words(times, ["Quatre", "cinq", "six", "sept."]), [0.1, 3.1], {})
    new = proj.split_line("B", pos=len("Quatre cinq "))
    assert proj.byid["B"]["text"] == "Quatre cinq" and proj.byid[new]["text"] == "six sept."
    a, b = proj.tk["B"][proj.sel["B"]], proj.tk[new][proj.sel[new]]
    assert [w["t"] for w in a["heard"]] == ["Quatre", "cinq"] and [w["t"] for w in b["heard"]] == ["six", "sept."]
    assert 1.4 < a["dur"] < 1.8                                   # cut in the pause between "cinq" and "six"
    proj.rename_line(new, "C")
    assert "C" in proj.byid and new not in proj.byid and proj.sel["C"] == b["n"]
    assert os.path.exists(proj.take_path("C", b["n"])) and os.path.exists(os.path.join(proj.path("export"), "C.wav"))
    with pytest.raises(ValueError):
        proj.rename_line("C", "B")                               # already used
    assert m["n"] in proj.tk["B"]


def test_add_edit_delete_lines(proj):
    lid = proj.add_line("A", "Entre les deux.")
    assert [ln["id"] for ln in proj.lines] == ["A", lid, "B"]
    proj.edit_line(lid, "  Entre   les deux, corrigé. ")
    assert proj.byid[lid]["text"] == "Entre les deux, corrigé."
    proj.delete_line(lid)
    assert [ln["id"] for ln in proj.lines] == ["A", "B"]
    assert os.path.exists(proj.p("script.json.bak"))
    with pytest.raises(ValueError):
        proj.split_line("A", pos=0)                              # nothing before the cursor


def test_pause_cuts_rule():
    m = {"pauses": [[1.0, 1.6], [3.0, 3.2]], "pause_cap": 0.3, "pause_drop": [3.0]}
    cuts = project.pause_cuts(m)
    assert [[round(a, 2), round(b, 2)] for a, b in cuts] == [[1.15, 1.45], [3.04, 3.16]]
    assert abs(project.removed_before(cuts, 5.0) - (0.3 + 0.12)) < 1e-9


def test_made_up_ids_never_collide():
    chapters, _ = scripts.parse("[L002] Given.\n\nNot given.\n\nNot given either.", name="x.md")
    ids = [ln["id"] for ln in chapters[0]["lines"]]
    assert len(set(ids)) == 3 and ids[0] == "L002"


@needs_ffmpeg
def test_split_from_a_given_take_and_reload(proj):
    y = speechlike([(0.2, False), (0.4, True), (0.5, False), (0.4, True), (0.5, False), (0.4, True), (0.5, False), (0.4, True), (0.2, False)])
    times = [(0.2, 0.6), (1.1, 1.5), (2.0, 2.4), (2.9, 3.3)]
    old = proj.add_take("B", y, SR, take_words(times, ["Quatre", "cinq", "six", "sept."]), [0.1, 3.4], {})
    proj.add_take("B", y[: int(1.7 * SR)], SR, take_words(times[:2], ["Quatre", "cinq"]), [0.1, 1.6], {})   # now kept
    new = proj.split_line("B", word=2, take=old["n"])          # cut the first take, before "six"
    assert proj.byid[new]["text"] == "six sept."
    assert [w["t"] for w in proj.tk[new][proj.sel[new]]["heard"]] == ["six", "sept."]
    same = proj.tk
    proj.reload()                                              # in place: the same object, read again from the folder
    assert proj.byid[new]["text"] == "six sept." and proj.sel[new] == 1 and proj.tk is not same
