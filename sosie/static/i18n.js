"use strict";
// Interface strings, French and English. t("key", {var}) ; data-i18n, data-i18n-html, data-i18n-title, data-i18n-placeholder in the page.

const I18N = { lang: "fr" };
I18N.fr = {
  "tab.studio": "Studio", "tab.voices": "Voix", "tab.synth": "Synthèse",
  "tl.pauses": "Pauses", "tl.pauses.t": "Raccourcir les blancs à l'intérieur de la prise retenue (les mots restent calés)",
  "tl.pcap.none": "intactes", "tl.pinfo": "{n} pauses · −{s} s · cliquez une pause (bande orange) sur la forme d'onde pour la retirer",
  "tl.pcap.done": "Pauses limitées à {c} s : −{s} s", "tl.pcap.off": "Pauses intactes",
  "tl.pause.t": "Pause de {s} s : cliquer pour la retirer (ou la remettre)", "tl.pause.cut": "Pause de {s} s retirée : ▶ pour écouter le résultat", "tl.pause.back": "Pause de {s} s remise",
  "tk.wave.t": "Cliquer pour écouter ; les bandes orange sont les pauses (cliquer pour retirer), le rouge ce qui est retiré", "tk.wave.other.t": "Cliquer pour écouter. Les pauses se retirent sur la prise retenue (★)", "tk.cut.t": "Temps retiré dans les pauses",
  "tl.algo.t": "Vitesse changée par WSOLA (atempo de ffmpeg), sans toucher à la hauteur : le même algorithme que la version anglaise. Jamais Rubber Band (métallique).",
  // pace, video placement, text editing, file picker
  "tl.pslow.t": "Débit plus lent (−5 mots/min)", "tl.pfast.t": "Débit plus rapide (+5 mots/min)", "tl.pace.val": "{w} mots/min",
  "tl.pace.t": "Débit de cette réplique pour la bande estimée. Projet : {p} mots/min ({how})",
  "tl.pace.reset": "↺", "tl.pace.reset.t": "Revenir au débit du projet", "tl.pace.all": "⇉ projet", "tl.pace.all.t": "Appliquer ce débit à tout le projet",
  "tl.pace.alldone": "Débit du projet : {w} mots/min", "pace.default": "valeur par défaut", "pace.measured": "mesuré sur {n} prises micro", "pace.set": "réglé à la main",
  "tl.img": "Image", "tl.img.t": "Où la réplique commence dans la vidéo : amenez la vidéo à l'endroit voulu, puis « Placer ici »",
  "tl.place": "Placer ici", "tl.follow": "Placer la suite", "tl.follow.t": "Placer cette réplique et toutes les suivantes à la suite, chacune selon sa durée estimée (deux clics)",
  "tl.follow.confirm": "Cliquez encore : cette réplique et les suivantes seront placées à la suite", "tl.pos": "début {t} · plan {s} s", "tl.unplaced": "pas encore placée",
  "tl.placed": "{id} placée à {t}", "tl.followed": "{n} répliques placées à la suite à partir de {t}",
  "ed.edit": "Modifier", "ed.edit.t": "Modifier le texte de la réplique (E)", "ed.add": "Réplique", "ed.add.t": "Ajouter une réplique après celle-ci",
  "ed.del.t": "Supprimer la réplique (deux clics ; ses prises restent sur le disque)", "ed.save": "Enregistrer ⏎", "ed.cancel": "Annuler",
  "ed.hint": "Échap pour annuler", "ed.ph": "Le texte de la réplique…", "ed.new": "Nouvelle réplique",
  "ed.from": "Ce script est généré depuis {f} : il sera réécrit à la prochaine génération.",
  "ed.del.confirm": "Cliquez encore pour supprimer cette réplique (ses prises restent dans takes/)", "ed.saved": "Texte enregistré",
  "ed.added": "Réplique {id} ajoutée", "ed.deleted": "Réplique {id} supprimée",
  "pj.film.choose": "Choisir une vidéo…", "pj.film.remove": "Retirer", "pj.film.pick": "Choisir une vidéo", "pj.film.set": "Vidéo : {f}",
  "pj.film.laid": "Vidéo chargée. Les répliques sont placées à la suite depuis 0:00 : ajustez chaque début avec « Placer ici » (I).",
  "pj.film.removed": "Vidéo retirée", "pj.choose": "Choisir…", "pj.script.pick": "Choisir un script", "pj.script.pickbtn": "Choisir un fichier…",
  "pk.empty": "Aucun fichier de ce type ici",
  // studio tools (synthetic take, rythmo band, duration)
  "st.raw": "▶ Brute", "st.raw.t": "Écouter l'enregistrement brut de la prise retenue, sans aucun traitement",
  "tl.synth": "✦ Synthèse", "tl.synth.t": "Faire dire la réplique par une voix de la bibliothèque : une prise de synthèse s'ajoute aux prises",
  "tl.gen": "Générer une prise", "tl.gen.t": "Prise de synthèse de cette réplique avec la voix choisie (S)",
  "tl.band": "Bande rythmo", "tl.band.t": "D'où la bande rythmo tire son rythme : ce qu'elle fait défiler, et quand",
  "tl.listen": "▶ Écouter",
  "tl.dur": "Durée", "tl.dur.t": "Durée de la prise retenue dans la piste : accélérée ou ralentie sans changer la hauteur (WSOLA, comme la version anglaise)",
  "tl.shorter.t": "Raccourcir de 2 % (plus rapide)", "tl.longer.t": "Allonger de 2 % (plus lent)",
  "tl.reset": "×1", "tl.reset.t": "Revenir à la durée d'origine",
  "tl.fitslot": "= plan {s} s", "tl.fitsynth": "= synthèse {s} s", "tl.fitguide": "= synthèse importée {s} s",
  "tl.novoice": "aucune voix prête (onglet Voix)", "tl.nokept": "aucune prise retenue",
  "tl.gen.kept": "Prise de synthèse {n} : retenue pour la piste", "tl.gen.added": "Prise de synthèse {n} ajoutée (★ pour la retenir à la place de la prise actuelle)",
  "tl.tempo.set": "Prise calée à {s} s (×{f})", "tl.tempo.far": "Prise calée à {s} s (×{f}) : au-delà de ±20 %, écoutez, la voix peut se dégrader",
  "tl.tempo.reset": "Prise à sa durée d'origine",
  "src.auto": "Auto · {x}", "src.take": "Prise retenue {n} · {s} s (temps Whisper)", "src.takesynth": "Prise retenue {n} (synthèse) · {s} s", "src.synth": "Synthèse {v} · {s} s",
  "src.guide": "Synthèse importée · {s} s", "src.slot": "Durée du plan · {s} s", "src.pace": "Débit {w} mots/min · {s} s",
  "tk.mic": "micro", "tk.unkeep.t": "Ne plus retenir cette prise (deux clics)", "tk.unkeep.guide": "Cliquez encore pour ne plus retenir cette prise : la piste reprendra la synthèse importée", "tk.unkeep.empty": "Cliquez encore pour ne plus retenir cette prise : la réplique sera vide dans la piste", "tk.relisten": "à réécouter", "tk.checked": "vérifiée",
  "tk.tempo.t": "Tempo appliqué dans la piste", "tk.synthnew": "Prise de synthèse",
  "tk.unkept": "Plus aucune prise retenue : la réplique est vide dans la piste", "tk.unkept.guide": "Plus aucune prise retenue : la piste reprend la synthèse importée",
  "st.slot": "plan {s} s", "st.keptmic": "prise {n} (micro) {s} s", "st.keptsynth": "prise {n} (synthèse) {s} s",
  "st.nokept": "aucune prise retenue", "st.nokept.guide": "aucune prise retenue : synthèse importée dans la piste",
  "st.keepone": "Aucune prise retenue.<br/>Retenez-en une avec ★ ou <b>1…9</b>.",
  "st.notake": "Aucune prise. <b>Espace</b> pour enregistrer, <b>S</b> pour une prise de synthèse.",
  "st.guideold": "texte modifié depuis la synthèse importée : rythme estimé",
  "pj.k.guide": "Synthèse importée",
  "pj.synth": "Prises de synthèse :", "pj.synth.missing": "pour les répliques sans prise retenue", "pj.synth.all": "pour toutes les répliques",
  "pj.synth.go": "Générer", "pj.synth.hint": "Une prise de synthèse s'ajoute à chaque réplique ; elle n'est retenue que si la réplique n'en a pas d'autre.",
  "pj.synth.started": "{n} prises de synthèse en cours, réplique par réplique", "pj.synth.done": "{n} prises de synthèse faites, {k} retenues",
  "jobs.running": "{n} génération(s) en cours", err: "Erreur : {e}",
  // projects
  "pj.proj": "Projet", "pj.voiceproj": "Échantillons de", "pj.none": "Aucun projet", "pj.title": "Projet",
  "pj.none.long": "Aucun projet ouvert. Ouvrez un projet récent, créez-en un à partir d'un script, ou parcourez vos dossiers.",
  "pj.recent": "Projets récents", "pj.norecent": "Aucun projet récent.", "pj.new": "Nouveau projet",
  "pj.name": "Nom", "pj.lang": "Langue", "pj.dir": "Dossier du projet", "pj.script": "Script",
  "pj.script.ph": "Collez le texte : un paragraphe par réplique, « # Titre » pour un chapitre, « [ID] texte » pour nommer une réplique. Ou choisissez un fichier .txt, .md, .srt ou .json ci-dessous.",
  "pj.script.file": "Fichier choisi : {f}", "pj.film": "Vidéo de référence",
  "pj.film.ph": "Facultatif : l'image sous la bande rythmo (un .srt donne aussi la durée de chaque plan)",
  "pj.create": "Créer le projet", "pj.browse": "Parcourir les dossiers", "pj.openhere": "Ouvrir ce projet",
  "pj.browse.hint": "◉ = projet Sosie (cliquer pour l'ouvrir). Cliquer un script ou une vidéo le met dans « Nouveau projet ».",
  "pj.k.dir": "Dossier", "pj.k.lang": "Langue", "pj.k.lines": "Répliques", "pj.k.recorded": "en voix réelle",
  "pj.k.export": "Piste voix (montage)", "pj.k.takes": "Prises", "pj.k.film": "Vidéo",
  "pj.edit": "Modifier le script", "pj.close": "Fermer le projet",
  "pj.err.open": "Impossible d'ouvrir le projet : {e}", "pj.err.dir": "Indiquez le dossier du projet",
  "sc.title": "Script", "sc.hint": "Un paragraphe par réplique. « # Titre » commence un chapitre, « [ID] » en tête nomme la réplique (gardez les ID : les prises y sont rattachées). L'ancien script est gardé dans script.json.bak.",
  "sc.save": "Enregistrer le script", "sc.saved": "Script enregistré",
  "np.title": "Aucun projet ouvert", "np.text": "Un projet, c'est un script découpé en répliques, les prises enregistrées pour chacune, et la piste voix exportée pour le montage. Tout est sauvegardé au fil de l'eau dans son dossier.",
  "np.open": "Ouvrir ou créer un projet",
  // studio bar
  "st.full": "Texte entier", "st.rythmo": "Rythmo", "st.picture": "Image", "st.preroll": "Pré-roll", "st.mic": "Micro",
  "st.chan.t": "Canal de la carte son gardé dans la prise", "st.chan.auto": "Canal auto", "st.chan.1": "Entrée 1", "st.chan.2": "Entrée 2",
  "st.nr.t": "Débruitage de la piste exportée : le profil de bruit enregistré est soustrait. Les prises brutes ne sont pas touchées.",
  "st.nr.0": "Sans débruitage", "st.nr.8": "Débruitage léger", "st.nr.14": "Débruitage normal", "st.nr.20": "Débruitage fort",
  "st.noise": "Profil de bruit", "st.clip.t": "Saturation (cliquer pour effacer)",
  "st.rec.t": "Enregistrer / arrêter (Espace)", "st.redo": "⌫ Refaire", "st.redo.t": "Jeter la dernière prise et recommencer",
  "st.take": "▶ Prise", "st.take.t": "Écouter la prise retenue telle qu'elle part dans la piste : coupée, débruitée, pauses raccourcies, à sa vitesse", "st.film": "▶ Sur l'image", "st.film.t": "Écouter la prise retenue sur l'image",
  "st.prev": "◀ Réplique", "st.next": "Réplique ▶",
  "st.mic.on": "Micro : {d}", "st.mic.err": "Micro inaccessible : {e}",
  "st.tooshort": "Prise trop courte, ignorée", "st.upload.err": "Envoi de la prise impossible : {e}", "st.discarded": "Prise {n} jetée", "st.kept": "Prise {n} retenue",
  "st.noexport": "Pas encore de prise exportée pour cette réplique",
  "st.todo": "À enregistrer · {n}", "st.todo1": "à enregistrer", "st.noline": "Ce script n'a aucune réplique.",
  "st.status.mic": "prise {n} retenue (micro)", "st.status.synth": "prise {n} retenue (synthèse {v})", "st.ntakes": "{n} prise(s)", "st.line": "Réplique {i}/{n}",
  "st.infilm": "dans la vidéo à {t}",
  "st.prog": "<b>{n}</b>/{of} en voix réelle", "st.prog.synth": "<b>{k}</b> en synthèse",
  "st.nr.done": "Débruitage -{db} dB max : prises retenues refaites", "st.nr.off": "Sans débruitage : prises retenues refaites",
  "st.chan.autodone": "Canal choisi d'après le niveau, à chaque prise", "st.chan.done": "Seule l'entrée {n} est gardée",
  "st.film.err": "Vidéo illisible : guide sans image",
  "tk.new": "Nouvelle prise", "tk.sending": "envoi…", "tk.take": "Prise {n}", "tk.kept": "retenue", "tk.analysing": "analyse…",
  "tk.error": "erreur", "tk.clipping": "saturation", "tk.low": "niveau faible ({db} dB)", "tk.peak": "crête {db} dB",
  "tk.raw.t": "Écouter l'enregistrement brut, sans traitement (T)", "tk.raw": "brute", "tk.play.track.t": "Écouter la prise telle qu'elle part dans la piste : pauses raccourcies, à sa vitesse, débruitée (⏎)",
  "tk.film": "image", "tk.keep": "Retenir", "tk.keep.t": "Retenir pour la piste ({n})", "tk.discard.t": "Jeter cette prise",
  "noise.title": "Silence…", "noise.text": "Profil du bruit de fond : ne parlez pas, ne bougez pas. <kbd>Échap</kbd> pour annuler.",
  "noise.cancel": "Profil de bruit annulé", "noise.short": "Profil de bruit trop court, ignoré",
  "noise.done": "Profil de bruit enregistré : les prises retenues sont refaites avec",
  "noise.redo.t": "Réenregistrer le profil du bruit de fond : 10 s de silence (actuel : {d}, {s} s)",
  "noise.need.t": "Enregistrer 10 s de silence : le profil du bruit de fond à soustraire",
  "gate.title": "Micro", "gate.text": "Branchez et réglez le micro (alimentation fantôme 48 V si c'est un micro statique), puis activez-le. Le navigateur demandera l'autorisation la première fois. Échap pour continuer sans.",
  "gate.btn": "Activer le micro",
  // capture protocol card
  "pr.title": "Échantillons de la voix « {name} »",
  "pr.steps": "<ol><li>D'abord le <b>profil de bruit</b> (10 s de silence) ; crêtes entre −18 et −6 dB.</li><li>Lisez chaque phrase <b>comme la voix devra sonner</b>, naturellement. La première compte le plus.</li><li>Gardez la meilleure prise de chaque phrase (~30 s en tout), puis <b>Construire la voix</b>.</li></ol>",
  "pr.kept": "{n}/{of} phrases retenues", "pr.ref": "référence : {s} s ({d})", "pr.noref": "pas encore de référence",
  "pr.build": "Construire la voix", "pr.try": "Essayer dans Synthèse", "pr.built": "Voix construite : sa référence est prête",
  // voices
  "vo.title": "Voix", "vo.new": "+ Nouvelle voix", "vo.empty": "Aucune voix. Créez-en une : vous lirez une dizaine de phrases dans le studio, et Sosie en fera la référence du clone.",
  "vo.ref": "Référence {s} s · {d}", "vo.noref": "Pas encore de référence : enregistrez les échantillons ou importez un fichier.",
  "vo.from.file": "fichier {f}", "vo.from.samples": "{n} phrases enregistrées", "vo.from.takes": "prises {ids}{p}",
  "vo.sets": "expressivité {e} · guidage {c} · température {t} · décodeur {d} s · tempo {tp}",
  "vo.samples": "{n}/{of} phrases d'échantillon retenues",
  "vo.try": "Essayer", "vo.record": "Enregistrer les échantillons", "vo.build": "Construire depuis les échantillons",
  "vo.import": "Importer un enregistrement", "vo.fromproj": "Depuis le projet ouvert", "vo.edit": "Réglages",
  "vo.delete.confirm": "Cliquez encore sur 🗑 pour mettre cette voix à la corbeille", "vo.deleted": "Voix mise à la corbeille",
  "vo.notes": "Notes", "vo.wm": "Filigrane", "vo.wm.on": "marquer les fichiers générés (Perth)", "vo.nowm": "sans filigrane",
  "vo.wm.t": "Filigrane inaudible de Resemble AI : permet de reconnaître une voix de synthèse. À garder pour toute voix publiée.",
  "vo.save": "Enregistrer", "vo.defaults": "Réglages conseillés", "vo.saved": "Réglages de la voix enregistrés",
  "vo.importing": "Import…", "vo.imported": "Référence importée", "vo.fromproj.done": "Référence construite depuis les prises de {p}",
  "vo.protocol": "Protocole : comment enregistrer une bonne voix",
  "vo.protocol.html": `<ol>
    <li><b>Langue</b> : enregistrez dans la langue que la voix parlera. L'accent vient de la référence : une référence française donne un anglais à l'accent français.</li>
    <li><b>Pièce et micro</b> : pièce calme, micro à 15–20 cm, filtre anti-pop si possible. Aucun effet (compresseur, égaliseur, réduction de bruit) : Sosie s'en charge.</li>
    <li><b>Profil de bruit</b> : avant la première phrase, « Profil de bruit » et 10 s de silence.</li>
    <li><b>Niveau</b> : crêtes entre −18 et −6 dB (zone claire du vumètre), jamais de saturation.</li>
    <li><b>Lecture</b> : lisez comme la voix devra sonner, naturellement, au débit voulu. Le clone copie la diction : une lecture posée donne une voix posée.</li>
    <li><b>Première phrase</b> : soignez-la. Le modèle de texte n'écoute que les 6 premières secondes de la référence ; le décodeur, lui, en écoute 30 (le timbre).</li>
    <li><b>Durée</b> : ~30 s de parole retenue (la référence est coupée à 30 s). Refaites une phrase tant qu'elle ne vous plaît pas (<kbd>⌫</kbd>).</li>
    <li><b>Construire</b> : les prises retenues sont assemblées dans l'ordre, débruitées, coupées, en 24 kHz à −20 LUFS. Essayez ensuite la voix dans Synthèse, en l'écoutant juste après une vraie prise.</li>
  </ol><p>Autres sources : importer un enregistrement existant (30 s de parole propre, une seule voix), ou construire la référence depuis les prises retenues du projet ouvert (dans l'ordre de « À enregistrer » s'il existe).</p>`,
  "nv.title": "Nouvelle voix", "nv.name": "Nom", "nv.lang": "Langue", "nv.prompts": "Phrases à lire",
  "nv.prompts.ph": "Écrivez une dizaine de phrases dans cette langue, une par ligne : la première longue et représentative.",
  "nv.hint": "Une phrase par ligne. Elles s'ouvrent dans le studio : vous les lirez comme n'importe quel script.",
  "nv.create": "Créer et enregistrer les échantillons", "nv.created": "Voix créée : commencez par le profil de bruit, puis lisez les phrases",
  // settings
  "set.exaggeration": "Expressivité", "set.exaggeration.t": "exaggeration : emphase et énergie ; plus haut = plus théâtral (et plus rapide)",
  "set.cfg_weight": "Guidage", "set.cfg_weight.t": "cfg_weight : plus bas = débit plus lent et posé ; plus haut = plus rapide, plus collé à la référence",
  "set.temperature": "Température", "set.temperature.t": "temperature : variété d'un tirage à l'autre ; trop haut, la voix dérape",
  "set.decoder_seconds": "Référence au décodeur (s)", "set.decoder_seconds.t": "secondes de la référence données au décodeur : le timbre (30 conseillé)",
  "set.tempo": "Tempo", "set.tempo.t": "accélère ou ralentit après coup, sans changer la hauteur (WSOLA). 1,15 si le clone parle trop lentement",
  // synthesis
  "sy.voice": "Voix", "sy.lang": "Langue", "sy.ph": "Le texte à dire…", "sy.go": "Générer", "sy.check": "Vérifier avec Whisper",
  "sy.tries": "Tirages", "sy.adv": "Réglages avancés", "sy.reset": "Réglages de la voix", "sy.savevoice": "Enregistrer comme réglages de la voix",
  "sy.clips": "Clips", "sy.novoice": "Aucune voix prête (onglet Voix)", "sy.notext": "Écrivez un texte",
  "sy.notinstalled": "Synthèse non installée : pip install 'sosie[voice]'",
  "sy.count": "{w} mots · ~{s} s", "sy.queued": "en file…", "sy.loading": "chargement du modèle (la première fois)…",
  "sy.progress": "phrase {s}/{n} · tirage {d}/{of}", "sy.done": "Prêt : {s} s", "sy.worst": "à réécouter", "sy.why.missing": "mots non entendus : {w}", "sy.why.extra": "{n} mots en trop", "sy.why.gap": "silence de {s} s", "sy.why.rate": "débit {r} car./s",
  "sy.noclip": "Les clips générés s'affichent ici.", "sy.dl.t": "Télécharger le fichier WAV (48 kHz)", "sy.copy": "📋 Copier",
  "sy.copy.t": "Copier le fichier dans le presse-papiers : à coller dans un gestionnaire de fichiers, une messagerie, un logiciel de montage",
  "sy.reuse.t": "Reprendre ce texte et ces réglages", "sy.del.t": "Mettre à la corbeille", "sy.del.confirm": "Cliquez encore sur 🗑 pour mettre ce clip à la corbeille",
  "sy.copied": "Fichier copié : collez-le où vous voulez (Ctrl+V)", "sy.drag": "Glissez le clip vers un dossier ou une application pour y déposer le fichier", "sy.copied.path": "Chemin du fichier copié",
  "sy.help": "Aide : prosodie, réglages et balises",
  "sy.help.html": `<h3>La ponctuation, premier levier</h3><ul>
    <li><code>,</code> <code>.</code> <code>?</code> <code>!</code> placent les pauses et l'intonation ; <code>?</code> fait monter la fin de phrase.</li>
    <li>Chaque phrase est générée à part puis recollée : 0,40 s de pause après <code>.</code> et <code>!</code>, 0,45 s après <code>?</code>. Pour un vrai silence, finissez la phrase.</li>
    <li>Le modèle change <code>…</code> <code>...</code> <code>:</code> <code>;</code> et « <code> - </code> » en virgules : les points de suspension ne font pas de longue pause.</li>
    <li>Les nombres sont lus en toutes lettres. Un sigle écrit avec des espaces se lit lettre par lettre (<code>I A</code>) ; écrivez un mot comme il se prononce s'il est mal lu (<code>Linnto</code>).</li></ul>
    <h3>Les réglages (Réglages avancés)</h3><ul>
    <li><b>Expressivité</b> (0,35) : emphase et énergie. <b>Guidage</b> (0,3) : plus bas = plus lent et posé. <b>Température</b> (0,6) : variété des tirages.</li>
    <li><b>Tempo</b> : accélère ou ralentit après coup sans changer la hauteur. <b>Tirages</b> : chaque phrase est tirée jusqu'à N fois, Whisper vérifie les mots et la meilleure est gardée.</li></ul>
    <h3>Ce que le texte ne règle pas</h3><p>L'accent, le style et le rythme viennent de la référence de la voix. Une voix qui doit parler anglais doit avoir une référence en anglais.</p>
    <h3>Balises de sons (expérimental)</h3><p>Le vocabulaire du modèle contient des sons non verbaux, en minuscules entre crochets. Ils ne sont pas documentés pour ce modèle : l'effet est faible ou nul la plupart du temps. En français, <code>[inhale]</code> et <code>[um]</code> ont fait partir la génération en boucle (la vérification Whisper écarte ces tirages). Pas de SSML (<code>&lt;break&gt;</code>, <code>&lt;prosody&gt;</code>).</p>`,
  // help
  "help.title": "Raccourcis du studio",
  "help.keys": `<dt><kbd>Espace</kbd></dt><dd>Enregistrer / arrêter. La prise est gardée et retenue pour la piste.</dd>
    <dt><kbd>⌫</kbd></dt><dd>Jeter la dernière prise et recommencer tout de suite (pendant l'enregistrement : repartir de zéro).</dd>
    <dt><kbd>Échap</kbd></dt><dd>Annuler l'enregistrement en cours, ou arrêter l'écoute.</dd>
    <dt><kbd>Suppr</kbd></dt><dd>Jeter la dernière prise.</dd>
    <dt><kbd>←</kbd> <kbd>→</kbd></dt><dd>Réplique précédente / suivante (aussi <kbd>↑</kbd> <kbd>↓</kbd>).</dd>
    <dt><kbd>⏎</kbd></dt><dd>Écouter la prise retenue telle qu'elle part dans la piste (pauses raccourcies, à sa vitesse) ; les mots défilent dans la bande.</dd>
    <dt><kbd>F</kbd></dt><dd>Écouter la prise retenue sur l'image.</dd>
    <dt><kbd>T</kbd></dt><dd>Écouter l'enregistrement brut de la prise retenue, sans traitement.</dd>
    <dt><kbd>S</kbd></dt><dd>Générer une prise de synthèse avec la voix choisie.</dd>
    <dt><kbd>E</kbd></dt><dd>Modifier le texte de la réplique.</dd>
    <dt><kbd>I</kbd></dt><dd>Placer le début de la réplique à l'instant affiché par la vidéo.</dd>
    <dt><kbd>G</kbd></dt><dd>Écouter la source de la bande rythmo.</dd>
    <dt><kbd>1</kbd>…<kbd>9</kbd></dt><dd>Retenir la prise n.</dd>
    <dt><kbd>M</kbd></dt><dd>Texte entier / bande rythmo.</dd>
    <dt><kbd>V</kbd></dt><dd>Afficher / masquer l'image.</dd>
    <dt><kbd>+</kbd> <kbd>−</kbd></dt><dd>Vitesse de défilement de la bande rythmo.</dd>`,
  "help.text": `<p><b>Prises.</b> Une réplique a des prises micro (🎙) et des prises de synthèse (✦, générées avec une voix de la bibliothèque). Une seule est retenue (★) : c'est elle qui part dans la piste.</p>
    <p><b>Bande rythmo.</b> Elle fait défiler les mots au rythme d'une source, au choix : la prise retenue (les mots et les temps entendus par Whisper), la prise de synthèse, la synthèse importée, la durée du plan dans la vidéo, ou un débit réglable (mots par minute, par réplique ou pour le projet ; par défaut mesuré sur vos prises micro). Dites chaque mot quand il passe la barre. Le pré-roll fait démarrer l'image un peu avant la voix.</p>
    <p><b>Durée.</b> La prise retenue peut être raccourcie ou allongée dans la piste (−/+ par pas de 2 %), ou calée d'un clic sur la durée du plan ou de la synthèse, sans changer la hauteur de la voix (WSOLA, l'algorithme de la version anglaise ; jamais Rubber Band, métallique). Au-delà de ±20 %, écoutez : la voix peut se dégrader.</p>
    <p><b>Pauses.</b> Les blancs à l'intérieur d'une prise sont repérés (bandes orange sur la forme d'onde). On peut les limiter toutes (≤ 0,5 / 0,3 / 0,15 s) ou en retirer une en cliquant dessus ; la partie retirée apparaît en rouge, les mots restent calés. Pauses et vitesse se combinent.</p>
    <p><b>Vidéo.</b> Projet ▸ « Choisir une vidéo ». Chaque réplique se place sur l'image : amenez la vidéo au bon endroit et « Placer ici » (I) ; « Placer la suite » enchaîne les répliques suivantes selon leur durée estimée. Un script importé en .srt arrive déjà placé.</p>
    <p><b>Texte.</b> ✎ Modifier (E), + Réplique, 🗑 sur la réplique courante ; Projet ▸ « Modifier le script » pour tout le texte d'un coup.</p>
    <p>Vous pouvez vous écarter du script : sous chaque prise s'affiche ce que vous avez dit, et c'est ce texte, mot à mot avec ses temps, qui part avec la prise.</p>
    <p>La prise retenue est exportée aussitôt dans la piste voix du projet (Projet ▸ Piste voix) : coupée, débruitée, à −20 LUFS, avec durations.json et words.json pour le montage.</p>
    <p>Débruitage : « Profil de bruit » enregistre 10 s de silence ; ce bruit est soustrait de la piste exportée, recalé sur le silence avant la première syllabe. À refaire si le bruit de la pièce change.</p>`,
};
I18N.en = {
  "tab.studio": "Studio", "tab.voices": "Voices", "tab.synth": "Synthesis",
  "tl.pauses": "Pauses", "tl.pauses.t": "Shorten the silences inside the kept take (words stay in sync)",
  "tl.pcap.none": "untouched", "tl.pinfo": "{n} pauses · −{s} s · click a pause (orange band) on the waveform to remove it",
  "tl.pcap.done": "Pauses capped at {c} s: −{s} s", "tl.pcap.off": "Pauses untouched",
  "tl.pause.t": "{s} s pause: click to remove it (or bring it back)", "tl.pause.cut": "{s} s pause removed: ▶ to hear the result", "tl.pause.back": "{s} s pause back",
  "tk.wave.t": "Click to listen; orange bands are pauses (click to remove), red is what is removed", "tk.wave.other.t": "Click to listen. Pauses are removed on the kept take (★)", "tk.cut.t": "Time removed from pauses",
  "tl.algo.t": "Speed changed by WSOLA (ffmpeg atempo), pitch untouched: the same algorithm as the English version. Never Rubber Band (metallic).",
  "tl.pslow.t": "Slower pace (−5 words/min)", "tl.pfast.t": "Faster pace (+5 words/min)", "tl.pace.val": "{w} words/min",
  "tl.pace.t": "Pace of this line for the estimated band. Project: {p} words/min ({how})",
  "tl.pace.reset": "↺", "tl.pace.reset.t": "Back to the project's pace", "tl.pace.all": "⇉ project", "tl.pace.all.t": "Apply this pace to the whole project",
  "tl.pace.alldone": "Project pace: {w} words/min", "pace.default": "default value", "pace.measured": "measured on {n} mic takes", "pace.set": "set by hand",
  "tl.img": "Picture", "tl.img.t": "Where the line starts in the video: bring the video to the right spot, then \"Place here\"",
  "tl.place": "Place here", "tl.follow": "Place the rest", "tl.follow.t": "Place this line and all the following ones one after the other, each for its estimated duration (two clicks)",
  "tl.follow.confirm": "Click again: this line and the following ones will be placed one after the other", "tl.pos": "start {t} · shot {s} s", "tl.unplaced": "not placed yet",
  "tl.placed": "{id} placed at {t}", "tl.followed": "{n} lines placed one after the other from {t}",
  "ed.edit": "Edit", "ed.edit.t": "Edit the line's text (E)", "ed.add": "Line", "ed.add.t": "Add a line after this one",
  "ed.del.t": "Delete the line (two clicks; its takes stay on disk)", "ed.save": "Save ⏎", "ed.cancel": "Cancel",
  "ed.hint": "Esc to cancel", "ed.ph": "The line's text…", "ed.new": "New line",
  "ed.from": "This script is generated from {f}: it will be rewritten the next time it is generated.",
  "ed.del.confirm": "Click again to delete this line (its takes stay in takes/)", "ed.saved": "Text saved",
  "ed.added": "Line {id} added", "ed.deleted": "Line {id} deleted",
  "pj.film.choose": "Choose a video…", "pj.film.remove": "Remove", "pj.film.pick": "Choose a video", "pj.film.set": "Video: {f}",
  "pj.film.laid": "Video loaded. Lines are placed one after the other from 0:00: adjust each start with \"Place here\" (I).",
  "pj.film.removed": "Video removed", "pj.choose": "Choose…", "pj.script.pick": "Choose a script", "pj.script.pickbtn": "Choose a file…",
  "pk.empty": "No file of this kind here",
  "st.raw": "▶ Raw", "st.raw.t": "Listen to the raw recording of the kept take, without any processing",
  "tl.synth": "✦ Synthesis", "tl.synth.t": "Have a library voice say the line: a synthetic take joins the takes",
  "tl.gen": "Generate a take", "tl.gen.t": "Synthetic take of this line in the chosen voice (S)",
  "tl.band": "Rythmo band", "tl.band.t": "Where the rythmo band gets its rhythm: what scrolls, and when",
  "tl.listen": "▶ Listen",
  "tl.dur": "Duration", "tl.dur.t": "Duration of the kept take in the track: sped up or slowed down, pitch unchanged (WSOLA)",
  "tl.shorter.t": "2 % shorter (faster)", "tl.longer.t": "2 % longer (slower)",
  "tl.reset": "×1", "tl.reset.t": "Back to the original duration",
  "tl.fitslot": "= shot {s} s", "tl.fitsynth": "= synthesis {s} s", "tl.fitguide": "= imported synthesis {s} s",
  "tl.novoice": "no voice ready (Voices tab)", "tl.nokept": "no kept take",
  "tl.gen.kept": "Synthetic take {n}: kept for the track", "tl.gen.added": "Synthetic take {n} added (★ to keep it instead of the current take)",
  "tl.tempo.set": "Take fitted to {s} s (×{f})", "tl.tempo.far": "Take fitted to {s} s (×{f}): beyond ±20 %, listen, the voice may degrade",
  "tl.tempo.reset": "Take back to its original duration",
  "src.auto": "Auto · {x}", "src.take": "Kept take {n} · {s} s (Whisper timings)", "src.takesynth": "Kept take {n} (synthesis) · {s} s", "src.synth": "Synthesis {v} · {s} s",
  "src.guide": "Imported synthesis · {s} s", "src.slot": "Shot duration · {s} s", "src.pace": "Pace {w} words/min · {s} s",
  "tk.mic": "mic", "tk.unkeep.t": "Stop keeping this take (two clicks)", "tk.unkeep.guide": "Click again to stop keeping this take: the track will use the imported synthesis", "tk.unkeep.empty": "Click again to stop keeping this take: the line will be empty in the track", "tk.relisten": "listen again", "tk.checked": "checked",
  "tk.tempo.t": "Tempo applied in the track", "tk.synthnew": "Synthetic take",
  "tk.unkept": "No kept take any more: the line is empty in the track", "tk.unkept.guide": "No kept take any more: the track uses the imported synthesis",
  "st.slot": "shot {s} s", "st.keptmic": "take {n} (mic) {s} s", "st.keptsynth": "take {n} (synthesis) {s} s",
  "st.nokept": "no kept take", "st.nokept.guide": "no kept take: imported synthesis in the track",
  "st.keepone": "No kept take.<br/>Keep one with ★ or <b>1…9</b>.",
  "st.notake": "No take. <b>Space</b> to record, <b>S</b> for a synthetic take.",
  "st.guideold": "text changed since the imported synthesis: estimated rhythm",
  "pj.k.guide": "Imported synthesis",
  "pj.synth": "Synthetic takes:", "pj.synth.missing": "for lines without a kept take", "pj.synth.all": "for every line",
  "pj.synth.go": "Generate", "pj.synth.hint": "A synthetic take is added to each line; it is kept only if the line has no other.",
  "pj.synth.started": "{n} synthetic takes running, line by line", "pj.synth.done": "{n} synthetic takes made, {k} kept",
  "jobs.running": "{n} generation(s) running", err: "Error: {e}",
  "pj.proj": "Project", "pj.voiceproj": "Samples of", "pj.none": "No project", "pj.title": "Project",
  "pj.none.long": "No project open. Open a recent one, create one from a script, or browse your folders.",
  "pj.recent": "Recent projects", "pj.norecent": "No recent project.", "pj.new": "New project",
  "pj.name": "Name", "pj.lang": "Language", "pj.dir": "Project folder", "pj.script": "Script",
  "pj.script.ph": "Paste the text: one paragraph per line, \"# Title\" for a chapter, \"[ID] text\" to name a line. Or pick a .txt, .md, .srt or .json file below.",
  "pj.script.file": "Selected file: {f}", "pj.film": "Reference video",
  "pj.film.ph": "Optional: the picture under the rythmo band (an .srt also gives the timing)",
  "pj.create": "Create the project", "pj.browse": "Browse folders", "pj.openhere": "Open this project",
  "pj.browse.hint": "◉ = Sosie project (click to open). Clicking a script or a video puts it in \"New project\".",
  "pj.k.dir": "Folder", "pj.k.lang": "Language", "pj.k.lines": "Lines", "pj.k.recorded": "in real voice",
  "pj.k.export": "Voice track (edit)", "pj.k.takes": "Takes", "pj.k.film": "Video",
  "pj.edit": "Edit the script", "pj.close": "Close the project",
  "pj.err.open": "Cannot open the project: {e}", "pj.err.dir": "Give the project folder",
  "sc.title": "Script", "sc.hint": "One paragraph per line. \"# Title\" starts a chapter, a leading \"[ID]\" names the line (keep the IDs: takes are attached to them). The previous script is kept in script.json.bak.",
  "sc.save": "Save the script", "sc.saved": "Script saved",
  "np.title": "No project open", "np.text": "A project is a script cut into lines, the takes recorded for each, and the voice track exported for the edit. Everything is saved as you go, in its folder.",
  "np.open": "Open or create a project",
  "st.full": "Full text", "st.rythmo": "Rythmo", "st.picture": "Picture", "st.preroll": "Pre-roll", "st.mic": "Microphone",
  "st.chan.t": "Sound card channel kept in the take", "st.chan.auto": "Auto channel", "st.chan.1": "Input 1", "st.chan.2": "Input 2",
  "st.nr.t": "Denoising of the exported track: the recorded noise profile is subtracted. Raw takes are never touched.",
  "st.nr.0": "No denoising", "st.nr.8": "Light denoising", "st.nr.14": "Normal denoising", "st.nr.20": "Strong denoising",
  "st.noise": "Noise profile", "st.clip.t": "Clipping (click to clear)",
  "st.rec.t": "Record / stop (Space)", "st.redo": "⌫ Redo", "st.redo.t": "Discard the last take and start again",
  "st.take": "▶ Take", "st.take.t": "Listen to the kept take as it goes into the track: trimmed, denoised, pauses shortened, at its speed", "st.film": "▶ On picture", "st.film.t": "Listen to the kept take on the picture",
  "st.prev": "◀ Line", "st.next": "Line ▶",
  "st.mic.on": "Microphone: {d}", "st.mic.err": "Microphone unavailable: {e}",
  "st.tooshort": "Take too short, ignored", "st.upload.err": "Cannot send the take: {e}", "st.discarded": "Take {n} discarded", "st.kept": "Take {n} kept",
  "st.noexport": "No exported take for this line yet",
  "st.todo": "To record · {n}", "st.todo1": "to record", "st.noline": "This script has no line.",
  "st.status.mic": "take {n} kept (mic)", "st.status.synth": "take {n} kept (synthesis {v})", "st.ntakes": "{n} take(s)", "st.line": "Line {i}/{n}",
  "st.infilm": "in the video at {t}",
  "st.prog": "<b>{n}</b>/{of} in real voice", "st.prog.synth": "<b>{k}</b> synthetic",
  "st.nr.done": "Denoising -{db} dB max: kept takes redone", "st.nr.off": "No denoising: kept takes redone",
  "st.chan.autodone": "Channel chosen by level, for each take", "st.chan.done": "Only input {n} is kept",
  "st.film.err": "Unreadable video: guide without picture",
  "tk.new": "New take", "tk.sending": "sending…", "tk.take": "Take {n}", "tk.kept": "kept", "tk.analysing": "analysing…",
  "tk.error": "error", "tk.clipping": "clipping", "tk.low": "low level ({db} dB)", "tk.peak": "peak {db} dB",
  "tk.raw.t": "Listen to the raw recording, unprocessed (T)", "tk.raw": "raw", "tk.play.track.t": "Listen to the take as it goes into the track: pauses shortened, at its speed, denoised (⏎)",
  "tk.film": "picture", "tk.keep": "Keep", "tk.keep.t": "Keep for the track ({n})", "tk.discard.t": "Discard this take",
  "noise.title": "Silence…", "noise.text": "Background noise profile: don't speak, don't move. <kbd>Esc</kbd> to cancel.",
  "noise.cancel": "Noise profile cancelled", "noise.short": "Noise profile too short, ignored",
  "noise.done": "Noise profile saved: kept takes are redone with it",
  "noise.redo.t": "Record the background noise profile again: 10 s of silence (current: {d}, {s} s)",
  "noise.need.t": "Record 10 s of silence: the background noise profile to subtract",
  "gate.title": "Microphone", "gate.text": "Plug in and set up the microphone (48 V phantom power for a condenser microphone), then enable it. The browser asks for permission the first time. Esc to go on without it.",
  "gate.btn": "Enable the microphone",
  "pr.title": "Samples of the voice \"{name}\"",
  "pr.steps": "<ol><li><b>Noise profile</b> first (10 s of silence); peaks between −18 and −6 dB.</li><li>Read each sentence <b>the way the voice should sound</b>, naturally. The first one matters most.</li><li>Keep the best take of each sentence (~30 s in all), then <b>Build the voice</b>.</li></ol>",
  "pr.kept": "{n}/{of} sentences kept", "pr.ref": "reference: {s} s ({d})", "pr.noref": "no reference yet",
  "pr.build": "Build the voice", "pr.try": "Try it in Synthesis", "pr.built": "Voice built: its reference is ready",
  "vo.title": "Voices", "vo.new": "+ New voice", "vo.empty": "No voice yet. Create one: you will read about ten sentences in the studio, and Sosie turns them into the clone's reference.",
  "vo.ref": "Reference {s} s · {d}", "vo.noref": "No reference yet: record the samples or import a file.",
  "vo.from.file": "file {f}", "vo.from.samples": "{n} recorded sentences", "vo.from.takes": "takes {ids}{p}",
  "vo.sets": "exaggeration {e} · cfg {c} · temperature {t} · decoder {d} s · tempo {tp}",
  "vo.samples": "{n}/{of} sample sentences kept",
  "vo.try": "Try", "vo.record": "Record the samples", "vo.build": "Build from the samples",
  "vo.import": "Import a recording", "vo.fromproj": "From the open project", "vo.edit": "Settings",
  "vo.delete.confirm": "Click 🗑 again to move this voice to the trash", "vo.deleted": "Voice moved to the trash",
  "vo.notes": "Notes", "vo.wm": "Watermark", "vo.wm.on": "mark generated files (Perth)", "vo.nowm": "no watermark",
  "vo.wm.t": "Resemble AI's inaudible watermark: lets anyone detect synthetic speech. Keep it for any voice you publish.",
  "vo.save": "Save", "vo.defaults": "Advised settings", "vo.saved": "Voice settings saved",
  "vo.importing": "Importing…", "vo.imported": "Reference imported", "vo.fromproj.done": "Reference built from the takes of {p}",
  "vo.protocol": "Protocol: how to record a good voice",
  "vo.protocol.html": `<ol>
    <li><b>Language</b>: record in the language the voice will speak. The accent comes from the reference: a French reference gives English with a French accent.</li>
    <li><b>Room and microphone</b>: quiet room, microphone at 15–20 cm, pop filter if possible. No effects (compressor, EQ, noise reduction): Sosie takes care of it.</li>
    <li><b>Noise profile</b>: before the first sentence, "Noise profile" and 10 s of silence.</li>
    <li><b>Level</b>: peaks between −18 and −6 dB (light zone of the meter), never clipping.</li>
    <li><b>Delivery</b>: read the way the voice should sound, naturally, at the pace you want. The clone copies the delivery: a calm reading gives a calm voice.</li>
    <li><b>First sentence</b>: make it count. The text model only hears the first 6 s of the reference; the decoder hears 30 (the timbre).</li>
    <li><b>Length</b>: ~30 s of kept speech (the reference is cut at 30 s). Redo a sentence until you like it (<kbd>⌫</kbd>).</li>
    <li><b>Build</b>: kept takes are joined in order, denoised, trimmed, at 24 kHz and −20 LUFS. Then try the voice in Synthesis, right after listening to a real take.</li>
  </ol><p>Other sources: import an existing recording (30 s of clean speech, a single voice), or build the reference from the kept takes of the open project (in the order of "To record" if there is one).</p>`,
  "nv.title": "New voice", "nv.name": "Name", "nv.lang": "Language", "nv.prompts": "Sentences to read",
  "nv.prompts.ph": "Write about ten sentences in this language, one per line: the first one long and representative.",
  "nv.hint": "One sentence per line. They open in the studio: you read them like any script.",
  "nv.create": "Create and record the samples", "nv.created": "Voice created: start with the noise profile, then read the sentences",
  "set.exaggeration": "Exaggeration", "set.exaggeration.t": "emphasis and energy; higher = more theatrical (and faster)",
  "set.cfg_weight": "Guidance (cfg)", "set.cfg_weight.t": "lower = slower, calmer delivery; higher = faster, closer to the reference",
  "set.temperature": "Temperature", "set.temperature.t": "variety from one draw to the next; too high and the voice slips",
  "set.decoder_seconds": "Decoder reference (s)", "set.decoder_seconds.t": "seconds of reference given to the decoder: the timbre (30 advised)",
  "set.tempo": "Tempo", "set.tempo.t": "speeds up or slows down afterwards, pitch unchanged (WSOLA). 1.15 if the clone speaks too slowly",
  "sy.voice": "Voice", "sy.lang": "Language", "sy.ph": "The text to say…", "sy.go": "Generate", "sy.check": "Check with Whisper",
  "sy.tries": "Draws", "sy.adv": "Advanced settings", "sy.reset": "Voice settings", "sy.savevoice": "Save as the voice's settings",
  "sy.clips": "Clips", "sy.novoice": "No voice ready (Voices tab)", "sy.notext": "Write a text",
  "sy.notinstalled": "Synthesis not installed: pip install 'sosie[voice]'",
  "sy.count": "{w} words · ~{s} s", "sy.queued": "queued…", "sy.loading": "loading the model (first time)…",
  "sy.progress": "sentence {s}/{n} · draw {d}/{of}", "sy.done": "Ready: {s} s", "sy.worst": "listen again", "sy.why.missing": "words not heard: {w}", "sy.why.extra": "{n} extra words", "sy.why.gap": "{s} s silence", "sy.why.rate": "rate {r} chars/s",
  "sy.noclip": "Generated clips show up here.", "sy.dl.t": "Download the WAV file (48 kHz)", "sy.copy": "📋 Copy",
  "sy.copy.t": "Copy the file to the clipboard: paste it in a file manager, a chat, a video editor",
  "sy.reuse.t": "Reuse this text and these settings", "sy.del.t": "Move to the trash", "sy.del.confirm": "Click 🗑 again to move this clip to the trash",
  "sy.copied": "File copied: paste it anywhere (Ctrl+V)", "sy.drag": "Drag the clip to a folder or an application to drop the file there", "sy.copied.path": "File path copied",
  "sy.help": "Help: prosody, settings and tags",
  "sy.help.html": `<h3>Punctuation first</h3><ul>
    <li><code>,</code> <code>.</code> <code>?</code> <code>!</code> place pauses and intonation; <code>?</code> raises the end of the sentence.</li>
    <li>Each sentence is generated on its own, then glued: a 0.40 s pause after <code>.</code> and <code>!</code>, 0.45 s after <code>?</code>. For a real silence, end the sentence.</li>
    <li>The model turns <code>…</code> <code>...</code> <code>:</code> <code>;</code> and "<code> - </code>" into commas: an ellipsis makes no long pause.</li>
    <li>Numbers are read out in words. An acronym written with spaces is spelled (<code>A I</code>); write a word as it sounds if it is misread.</li></ul>
    <h3>Settings (Advanced settings)</h3><ul>
    <li><b>Exaggeration</b> (0.35): emphasis and energy. <b>Guidance</b> (0.3): lower = slower and calmer. <b>Temperature</b> (0.6): variety of the draws.</li>
    <li><b>Tempo</b>: speeds up or slows down afterwards, pitch unchanged. <b>Draws</b>: each sentence is drawn up to N times, Whisper checks the words and the best one is kept.</li></ul>
    <h3>What the text cannot set</h3><p>Accent, style and rhythm come from the voice's reference. A voice meant to speak English needs an English reference.</p>
    <h3>Sound tags (experimental)</h3><p>The model's vocabulary holds non-verbal sounds, lower case in square brackets. They are not documented for this model: most of the time the effect is weak or absent. In French, <code>[inhale]</code> and <code>[um]</code> made the generation run away (the Whisper check rejects such draws). No SSML (<code>&lt;break&gt;</code>, <code>&lt;prosody&gt;</code>).</p>`,
  "help.title": "Studio shortcuts",
  "help.keys": `<dt><kbd>Space</kbd></dt><dd>Record / stop. The take is saved and kept for the track.</dd>
    <dt><kbd>⌫</kbd></dt><dd>Discard the last take and start again at once (while recording: start over).</dd>
    <dt><kbd>Esc</kbd></dt><dd>Cancel the current recording, or stop listening.</dd>
    <dt><kbd>Del</kbd></dt><dd>Discard the last take.</dd>
    <dt><kbd>←</kbd> <kbd>→</kbd></dt><dd>Previous / next line (also <kbd>↑</kbd> <kbd>↓</kbd>).</dd>
    <dt><kbd>⏎</kbd></dt><dd>Listen to the kept take as it goes into the track (pauses shortened, at its speed); the words scroll in the band.</dd>
    <dt><kbd>F</kbd></dt><dd>Listen to the kept take on the picture.</dd>
    <dt><kbd>T</kbd></dt><dd>Listen to the raw recording of the kept take, unprocessed.</dd>
    <dt><kbd>S</kbd></dt><dd>Generate a synthetic take in the chosen voice.</dd>
    <dt><kbd>E</kbd></dt><dd>Edit the line's text.</dd>
    <dt><kbd>I</kbd></dt><dd>Place the line's start at the video's current time.</dd>
    <dt><kbd>G</kbd></dt><dd>Listen to the source of the rythmo band.</dd>
    <dt><kbd>1</kbd>…<kbd>9</kbd></dt><dd>Keep take n.</dd>
    <dt><kbd>M</kbd></dt><dd>Full text / rythmo band.</dd>
    <dt><kbd>V</kbd></dt><dd>Show / hide the picture.</dd>
    <dt><kbd>+</kbd> <kbd>−</kbd></dt><dd>Scrolling speed of the rythmo band.</dd>`,
  "help.text": `<p><b>Takes.</b> A line has microphone takes (🎙) and synthetic takes (✦, generated with a library voice). One is kept (★): that one goes into the track.</p>
    <p><b>Rythmo band.</b> It scrolls the words at the pace of a source of your choice: the kept take (the words and timings Whisper heard), the synthetic take, the imported synthesis, the shot's duration in the video, or an adjustable pace (words per minute, per line or for the project; by default measured on your mic takes). Say each word as it crosses the bar. The pre-roll starts the picture a little before the voice.</p>
    <p><b>Duration.</b> The kept take can be made shorter or longer in the track (−/+ in 2 % steps), or fitted in one click to the shot or the synthesis, pitch unchanged (WSOLA, the English version's algorithm; never Rubber Band, metallic). Beyond ±20 %, listen: the voice may degrade.</p>
    <p><b>Pauses.</b> Silences inside a take are detected (orange bands on the waveform). Cap them all (≤ 0.5 / 0.3 / 0.15 s) or remove one by clicking it; the removed part shows in red, words stay in sync. Pauses and speed add up.</p>
    <p><b>Video.</b> Project ▸ "Choose a video". Each line is placed on the picture: bring the video to the right spot and "Place here" (I); "Place the rest" chains the following lines by their estimated duration. A script imported as .srt arrives already placed.</p>
    <p><b>Text.</b> ✎ Edit (E), + Line, 🗑 on the current line; Project ▸ "Edit the script" for the whole text at once.</p>
    <p>You can stray from the script: what you said shows under each take, and that text, word by word with its timings, goes with the take.</p>
    <p>The kept take is exported at once to the project's voice track (Project ▸ Voice track): trimmed, denoised, at −20 LUFS, with durations.json and words.json for the edit.</p>
    <p>Denoising: "Noise profile" records 10 s of silence; that noise is subtracted from the exported track, matched to the silence before the first syllable. Redo it if the room noise changes.</p>`,
};

function t(key, vars) {
  let s = I18N[I18N.lang]?.[key] ?? I18N.en[key] ?? I18N.fr[key];
  if (s == null) {
    console.warn("i18n: missing", key);
    return key;
  }
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? ""));
  return s;
}

function applyI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((e) => (e.textContent = t(e.dataset.i18n)));
  root.querySelectorAll("[data-i18n-html]").forEach((e) => (e.innerHTML = t(e.dataset.i18nHtml)));
  root.querySelectorAll("[data-i18n-title]").forEach((e) => (e.title = t(e.dataset.i18nTitle)));
  root.querySelectorAll("[data-i18n-placeholder]").forEach((e) => (e.placeholder = t(e.dataset.i18nPlaceholder)));
}
