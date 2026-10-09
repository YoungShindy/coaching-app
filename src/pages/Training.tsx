import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2, Dumbbell, ChevronDown, ChevronUp, Timer, Flame, Activity, BookOpen, Camera, Sparkles, X, Pencil, HelpCircle, Check, Play, Search, StickyNote } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import { formatDate, todayISO } from '../lib/utils'
import { equipmentRank, findBest, gifUrl, imgUrl, loadExercises, norm, searchKey, type PoolExercise } from '../lib/exercises'
import { Modal } from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'
import { Spinner } from '../components/ui/Spinner'
import type { TrainingEntry, UebungEntry } from '../types/database'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const TRAINING_TYPES = ['Kraft', 'Cardio', 'HIIT', 'Yoga', 'Stretching', 'Schwimmen', 'Radfahren', 'Laufen', 'Sonstiges']

interface TrainingWithExercises extends TrainingEntry {
  uebungen?: UebungEntry[]
  expanded?: boolean
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="card !p-3 text-xs">
      <div className="text-text-muted mb-1">{label}</div>
      <div className="text-text-primary font-bold">{payload[0]?.value} min</div>
    </div>
  )
}

interface UebungTip {
  muskel: string
  sekundaer: string
  warum: string
  muskeln: string[]
  tipps: string[]
  fehler: string[]
}

const UEBUNG_TIPS: Record<string, UebungTip> = {
  'bankdrücken': {
    muskel: 'Brust (Pectoralis)', sekundaer: 'Trizeps · Vordere Schulter',
    warum: 'Die effektivste Übung für Brustaufbau und Oberkörperkraft. Aktiviert gleichzeitig Brust, Schultern und Trizeps – ideal für Masse und Maximalkraft.',
    muskeln: ['chest', 'tricep', 'shoulder'],
    tipps: ['Schulterblätter zusammenziehen und in die Bank drücken', 'Rücken leicht gewölbt, Füße flach am Boden', 'Griffbreite: Oberarm 90° zur Stange', 'Stange zur unteren Brust führen (Brustwarzen-Linie)', 'Ellenbogen 45–75° vom Körper – nicht komplett aufspreizen'],
    fehler: ['Schultern hochziehen (Verletzungsrisiko)', 'Ellenbogen zu weit aufspreizen (Schulter-Impingement)', 'Stange unkontrolliert fallen lassen', 'Füße in die Luft strecken (Stabilitätsverlust)'],
  },
  'kniebeuge': {
    muskel: 'Quadrizeps · Gesäß (Gluteus)', sekundaer: 'Hamstrings · Core · Rückenstrecker',
    warum: 'Die „Königin der Übungen" – aktiviert mehr Muskelmasse als fast jede andere Übung. Fördert Hormonausschüttung, Kraft und Muskelaufbau im gesamten Körper.',
    muskeln: ['quad', 'glute', 'ham', 'lback', 'abs'],
    tipps: ['Stange auf dem Trapezmuskel, nicht auf dem Nacken', 'Füße schulterbreit, Zehen 15–30° auswärts', 'Knie zeigen immer in Richtung der Zehen', 'Mindestens bis zur Parallele, besser tiefer', 'Blick geradeaus, Rücken neutral – kein Rundrücken', 'Aus den Fersen herausdrücken beim Aufstehen'],
    fehler: ['Knie nach innen fallen lassen (Valgus-Stellung)', 'Zu wenig Tiefe – Muskel nicht voll aktiviert', 'Rundrücken – Bandscheiben werden belastet', 'Fersen heben (Beweglichkeit trainieren)'],
  },
  'kreuzheben': {
    muskel: 'Rückenstrecker · Gesäß', sekundaer: 'Hamstrings · Trapez · Core',
    warum: 'Trainiert die gesamte hintere Muskelkette gleichzeitig. Essenziell für Kraft, Körperhaltung und Prävention von Rückenproblemen.',
    muskeln: ['lback', 'glute', 'ham', 'trap'],
    tipps: ['Stange über dem Mittelfuß positionieren', 'Schulterblätter einziehen bevor du hebst', 'Rücken gerade, Brust raus, Blick nach vorne-unten', 'Stange nah am Körper führen – fast schaben', 'Hüfte und Knie gleichzeitig strecken', 'Oben Hüfte durchdrücken, Gesäß anspannen'],
    fehler: ['Rundrücken – besonders im unteren Rücken gefährlich', 'Stange vom Körper wegschwingen lassen', 'Mit dem Rücken hochreißen statt Beine nutzen'],
  },
  'klimmzug': {
    muskel: 'Latissimus (Rücken)', sekundaer: 'Bizeps · Trapez · hintere Schulter',
    warum: 'Ultimatives Rückentraining für einen breiten V-förmigen Latissimus. Einer der besten Indikatoren für Kraft-zu-Körpergewicht-Ratio.',
    muskeln: ['lat', 'bicep', 'trap'],
    tipps: ['Schulterblätter zuerst einziehen, dann hochziehen', 'Ellenbogen führen nach unten-hinten', 'Brust zur Stange, Oberkörper leicht nach hinten', 'Oben kurz halten – Rücken vollständig anspannen', 'Langsam absenken (3–4 Sek.) – exzentrische Phase nutzen'],
    fehler: ['Nur mit Armen ziehen statt Rücken zu aktivieren', 'Zu schnell und schwingen', 'Nicht vollständig strecken in unterer Position'],
  },
  'pull up': {
    muskel: 'Latissimus (Rücken)', sekundaer: 'Bizeps · Trapez · hintere Schulter',
    warum: 'Ultimatives Rückentraining für einen breiten V-förmigen Latissimus. Einer der besten Indikatoren für Kraft-zu-Körpergewicht-Ratio.',
    muskeln: ['lat', 'bicep', 'trap'],
    tipps: ['Schulterblätter zuerst einziehen, dann hochziehen', 'Ellenbogen führen nach unten-hinten', 'Brust zur Stange, Oberkörper leicht nach hinten', 'Oben kurz halten – Rücken vollständig anspannen', 'Langsam absenken (3–4 Sek.) – exzentrische Phase nutzen'],
    fehler: ['Nur mit Armen ziehen statt Rücken zu aktivieren', 'Zu schnell und schwingen', 'Nicht vollständig strecken in unterer Position'],
  },
  'wide pull up': {
    muskel: 'Latissimus (breite Schicht)', sekundaer: 'Trapez · hintere Schulter',
    warum: 'Weiter Griff betont die äußeren Lats und erzeugt maximale Rückenbreite. Intensiver als normaler Klimmzug, weniger Bizeps-Beteiligung.',
    muskeln: ['lat', 'trap', 'shoulder'],
    tipps: ['Griffbreite: ca. 1,5× Schulterbreite', 'Schulterblätter aktiv einziehen vor dem Hochziehen', 'Oberkörper leicht nach hinten lehnen', 'Pause oben – Rücken maximal anspannen', 'Kontrolliert absenken'],
    fehler: ['Zu breiter Griff (Schultergelenk belastet)', 'Schultern nicht aktivieren', 'Zu viel Schwung'],
  },
  'schulterdrücken': {
    muskel: 'Schultern (Deltamuskel)', sekundaer: 'Trizeps · Trapez · Core',
    warum: 'Die Grundübung für massive Schultern. Belastet den vorderen und seitlichen Deltamuskel maximal und entwickelt Überkopfkraft.',
    muskeln: ['shoulder', 'tricep', 'trap'],
    tipps: ['Stange VOR dem Kopf drücken – nie dahinter', 'Core fest anspannen, kein starkes Hohlkreuz', 'Ellenbogen leicht nach vorne-außen', 'Vollständige Streckung am Ende oben', 'Stange kontrolliert zur Brust absenken'],
    fehler: ['Hinter dem Kopf drücken – Nacken belastet', 'Starkes Hohlkreuz – Lendenwirbel gefährdet', 'Ellenbogen zu weit nach außen klappen'],
  },
  'rudern': {
    muskel: 'Oberer Rücken (Rhomboid, Trapez)', sekundaer: 'Latissimus · Bizeps · hintere Schulter',
    warum: 'Essenziell für gesunde Körperhaltung und gleicht Drückübungen aus. Kräftigt die obere Rückenmuskulatur und verbessert die Schultergesundheit langfristig.',
    muskeln: ['lat', 'trap', 'bicep', 'shoulder'],
    tipps: ['Oberkörper ca. 45° nach vorne neigen, Rücken gerade', 'Ellenbogen eng am Körper führen', 'Stange zum Bauch ziehen, nicht zur Brust', 'Am Ende Schulterblätter kräftig zusammenkneifen', 'Langsam strecken – exzentrische Phase nutzen'],
    fehler: ['Rücken rund – Bandscheiben belastet', 'Mit dem Rücken Schwung holen', 'Stange zu weit oben zur Brust ziehen'],
  },
  'bizeps curl': {
    muskel: 'Bizeps (Brachii)', sekundaer: 'Brachialis · Unterarmbeuger',
    warum: 'Isoliert den Bizeps direkt und ist die effektivste Übung für sichtbaren Armaufbau. Ermöglicht Peak-Kontraktion und maximales Muskelgefühl.',
    muskeln: ['bicep'],
    tipps: ['Ellenbogen bleibt fest am Körper – kein Schwingen', 'Volle Bewegungsamplitude: ganz strecken, ganz beugen', 'Oben 1–2 Sek. halten und anspannen', 'Langsam absenken (2–3 Sek.) – exzentrischer Vorteil'],
    fehler: ['Schwingen mit dem Oberkörper', 'Ellenbogen weg vom Körper – Schulter übernimmt', 'Zu schnell absenken'],
  },
  'trizepsdrücken': {
    muskel: 'Trizeps (Brachii)', sekundaer: 'Unterarmstrecker',
    warum: 'Trizeps macht 2/3 des Armvolumens aus! Isoliert alle 3 Köpfe und ist entscheidend für große Arme und starke Drückbewegungen.',
    muskeln: ['tricep'],
    tipps: ['Ellenbogen zeigen nach vorne-oben, fixiert', 'Nur der Unterarm bewegt sich', 'Volle Streckung am Ende durchdrücken', 'Langsam und kontrolliert zurückführen'],
    fehler: ['Ellenbogen schwingen oder ausweichen', 'Nicht vollständig strecken', 'Zu schweres Gewicht mit Schwung'],
  },
  'beinstrecken': {
    muskel: 'Quadrizeps (4-köpfiger Oberschenkelmuskel)', sekundaer: 'Kniestabilisatoren',
    warum: 'Isoliert den Quadrizeps direkt und hilft bei der Formgebung des Oberschenkels. Ideal für Kniestabilität und als Ergänzung zu Kniebeugen.',
    muskeln: ['quad'],
    tipps: ['Rücken fest an der Lehne, Hüfte nicht heben', 'Volle Streckung – Knie komplett durchdrücken', 'Oben 1–2 Sek. halten und anspannen', 'Langsam absenken (3 Sek.)'],
    fehler: ['Hüfte hebt – Core kompensiert', 'Zu schnell und schwungvoll', 'Knie nicht voll strecken'],
  },
  'beinbeugen': {
    muskel: 'Hamstrings (Rückseite Oberschenkel)', sekundaer: 'Gluteus · Waden',
    warum: 'Trainiert die Hamstrings isoliert, die bei Kniebeugen und Kreuzheben oft vernachlässigt werden. Wichtig für Verletzungsprävention und Beinbalance.',
    muskeln: ['ham', 'glute', 'calf'],
    tipps: ['Hüfte bleibt fest auf der Maschine', 'Volle Beugung – Ferse zur Gesäßfalte', 'Oben kurz halten und anspannen', 'Langsam strecken – exzentrische Phase nutzen'],
    fehler: ['Hüfte hebt sich beim Ziehen', 'Zu schnell und ruckartig', 'Nicht voll strecken in der Ausgangsposition'],
  },
  'laufen': {
    muskel: 'Herz-Kreislauf-System', sekundaer: 'Quadrizeps · Hamstrings · Waden',
    warum: 'Eine der effektivsten Cardio-Formen: verbessert Ausdauer, verbrennt Kalorien, stärkt das Herz und fördert mentale Gesundheit durch Endorphinausschüttung.',
    muskeln: ['quad', 'ham', 'calf'],
    tipps: ['Aufrechte Körperhaltung, Blick geradeaus', 'Schrittfrequenz: 170–180 Schritte/Min', 'Weich auftreten – Mittelfuß bevorzugt', 'Arme entspannt, 90° gebeugt', 'Puls im Zielbereich halten (60–80% max HR)'],
    fehler: ['Zu lange Schritte – Knie belastet', 'Oberkörper zu stark nach vorne beugen', 'Zu schnell starten ohne Aufwärmen'],
  },
  'laufband': {
    muskel: 'Herz-Kreislauf-System', sekundaer: 'Quadrizeps · Hamstrings · Waden',
    warum: 'Kontrolliertes Cardio-Training bei jedem Wetter. Einstellbare Neigung ermöglicht intensiveres Training und besseren Calorie-Burn.',
    muskeln: ['quad', 'ham', 'calf'],
    tipps: ['Neigung 1–2% simuliert Outdoor-Bedingungen', 'Nicht am Handlauf festhalten', 'Puls: 60–80% der max. Herzfrequenz', 'Warmup 3–5 Min langsam beginnen', 'Cooldown: mind. 3 Min langsam gehen'],
    fehler: ['Am Handlauf festhalten – Intensität sinkt', 'Zu schnell für das aktuelle Fitnesslevel', 'Ohne Aufwärmen direkt Vollgas'],
  },
  'fahrrad': {
    muskel: 'Quadrizeps · Waden', sekundaer: 'Hamstrings · Gesäß · Herz-Kreislauf',
    warum: 'Schont die Gelenke und trainiert gleichzeitig Ausdauer und Unterkörperkraft. Ideal für Fettverbrennung und gelenkschonendes Cardio.',
    muskeln: ['quad', 'ham', 'calf', 'glute'],
    tipps: ['Sattel auf Hüfthöhe einstellen', 'Knie leicht gebeugt in unterer Pedalposition', 'Gleichmäßige Trittfrequenz: 80–100 RPM', 'Oberkörper entspannt, kein Verkrampfen'],
    fehler: ['Sattel zu niedrig – Knie überlastet', 'Zu langsame Trittfrequenz mit hohem Widerstand'],
  },
  'plank': {
    muskel: 'Core (Transversus Abdominis)', sekundaer: 'Unterer Rücken · Gesäß · Schultern',
    warum: 'Beste Übung für tiefen Core-Aufbau. Ein starker Core schützt die Wirbelsäule, verbessert Körperhaltung und stabilisiert alle anderen Übungen.',
    muskeln: ['abs', 'lback', 'glute', 'shoulder'],
    tipps: ['Körper bildet eine gerade Linie von Kopf bis Ferse', 'Gesäß nicht hochstrecken oder durchhängen', 'Bauch aktiv einziehen und anspannen', 'Schultern über den Ellenbogen', 'Gleichmäßig atmen – nicht die Luft anhalten'],
    fehler: ['Gesäß hochstrecken – Core wird entlastet', 'Hüfte durchhängen – Lendenwirbel belastet', 'Schultern hochziehen zum Ohr'],
  },
  'dips': {
    muskel: 'Trizeps', sekundaer: 'Brust · Vordere Schulter',
    warum: 'Kraftklassiker für Trizeps und Oberkörper. Je nach Körperneigung Fokus auf Trizeps (aufrecht) oder Brust (geneigt) – sehr vielseitig.',
    muskeln: ['tricep', 'chest', 'shoulder'],
    tipps: ['Aufrecht = mehr Trizeps', 'Nach vorne geneigt = mehr Brust', 'Tief gehen: bis Ellenbogen 90° gebeugt', 'Schultern nicht hochziehen', 'Kontrolliert absenken'],
    fehler: ['Schultern hochziehen – Rotatorenmanschette belastet', 'Zu wenig Tiefe – Muskel nicht vollständig aktiviert'],
  },
  'seitheben': {
    muskel: 'Seitlicher Deltamuskel (Medial)', sekundaer: 'Vorderer Deltamuskel · Trapez',
    warum: 'Formt die Schulterbreite und gibt dem Oberkörper die athletische V-Form. Der seitliche Delta wird bei Drücken kaum trainiert – Seitheben ist deshalb unverzichtbar.',
    muskeln: ['shoulder'],
    tipps: ['Arme seitlich bis Schulterhöhe heben', 'Ellenbogen leicht gebeugt', 'Daumen leicht nach unten (innere Rotation)', 'Keine Schulterhochzüge', 'Sehr langsam und kontrolliert – kein Schwung!'],
    fehler: ['Zu viel Gewicht mit Schwung heben', 'Schultern hochziehen', 'Arme über Schulterniveau heben'],
  },
  'liegestützen': {
    muskel: 'Brust (Pectoralis)', sekundaer: 'Trizeps · Vordere Schulter · Core',
    warum: 'Universellste Oberkörperübung – überall ohne Equipment. Trainiert Brust, Trizeps und Schultern gleichzeitig und stärkt dazu den Core.',
    muskeln: ['chest', 'tricep', 'shoulder', 'abs'],
    tipps: ['Körper wie ein Brett: gerade Linie von Kopf bis Ferse', 'Ellenbogen ca. 45° vom Körper', 'Brust berührt fast den Boden', 'Vollständige Streckung am Ende'],
    fehler: ['Hüfte hängt durch oder ist hochgestreckt', 'Nur halbe Bewegungsamplitude', 'Ellenbogen komplett seitwärts aufspreizen'],
  },
  'latzug': {
    muskel: 'Latissimus (breiter Rückenmuskel)', sekundaer: 'Bizeps · Trapez · hintere Schulter',
    warum: 'Latzug ist die beste Maschinenalternative zu Klimmzügen – ideal für Anfänger und zum gezielten Aufbau des Latissimus. Er erzeugt die charakteristische V-Form des Rückens.',
    muskeln: ['lat', 'bicep', 'trap'],
    tipps: ['Schulterblätter vor dem Ziehen aktiv einziehen', 'Stange zum Schlüsselbein ziehen – nicht zum Bauch', 'Oberkörper leicht nach hinten lehnen', 'Ellenbogen führen nach unten-außen', 'Kontrolliert zur Ausgangsposition strecken (3 Sek.)'],
    fehler: ['Stange hinter den Kopf ziehen (Nackenstress)', 'Zu viel Schwung mit dem Oberkörper', 'Schulterblätter nicht aktivieren vor dem Zug'],
  },
  'rückenstrecker': {
    muskel: 'Rückenstrecker (Erector Spinae)', sekundaer: 'Gesäß · Hamstrings',
    warum: 'Rückenstrecker stärken die tiefe Rückenmuskulatur, die für eine gesunde Wirbelsäule, gute Körperhaltung und sichere Ausführung bei Kreuzheben und Kniebeugen essenziell ist.',
    muskeln: ['lback', 'glute', 'ham'],
    tipps: ['Nur bis zur Körperlinie strecken – nicht überstrecken', 'Langsam absenken (2–3 Sek.)', 'Kopf in neutraler Verlängerung der Wirbelsäule', 'Gesäß und Rücken kontrolliert anspannen', 'Optional: Zusatzgewicht auf der Brust für mehr Intensität'],
    fehler: ['Zu stark überstrecken (Lendenwirbel belastet)', 'Zu schnell und schwungvoll', 'Kopf nach hinten reißen'],
  },
  'beinpresse': {
    muskel: 'Quadrizeps · Gesäß (Gluteus)', sekundaer: 'Hamstrings · Waden',
    warum: 'Beinpresse ermöglicht schweres Beintraining ohne Balanceanforderung – ideal für Masseaufbau. Schont dabei den unteren Rücken im Vergleich zur Kniebeuge.',
    muskeln: ['quad', 'glute', 'ham'],
    tipps: ['Füße schulterbreit, mittig auf der Platte', 'Knie beugen bis 90° – nicht weiter', 'Knie zeigen immer in Richtung Zehen', 'Knie nie vollständig einrasten – immer leicht gebeugt lassen', 'Langsam absenken, explosiv drücken'],
    fehler: ['Knie über 90° beugen (Kniegelenk überlastet)', 'Knie nach innen fallen lassen', 'Vollständig in die Streckung einrasten'],
  },
  'wadenheben': {
    muskel: 'Waden (Gastrocnemius, Soleus)', sekundaer: 'Tibialis anterior',
    warum: 'Wadenheben kräftigt die oft vernachlässigte Wadenmuskulatur, verbessert Sprung- und Laufleistung und verhindert Verletzungen am Sprunggelenk.',
    muskeln: ['calf'],
    tipps: ['Volle Amplitude: ganz absenken, ganz hochdrücken', 'Oben kurz halten und Waden anspannen (1–2 Sek.)', 'Langsam absenken für maximale Dehnung', 'Auf Erhöhung stehen für volle Bewegungsamplitude', 'Variante mit gebeugtem Knie für Soleus'],
    fehler: ['Zu kurze Amplitude', 'Zu schnell und federnd', 'Hüfte oder Knie mitbewegen'],
  },
  'hip thrust': {
    muskel: 'Gesäß (Gluteus Maximus)', sekundaer: 'Hamstrings · Rückenstrecker · Adduktoren',
    warum: 'Hip Thrust ist DIE Übung für maximale Gesäßentwicklung. Studien zeigen eine stärkere Gluteus-Aktivierung als bei Kniebeugen oder Kreuzheben.',
    muskeln: ['glute', 'ham', 'lback'],
    tipps: ['Oberer Rücken auf Bankrand stützen', 'Füße hüftbreit, Knie 90° in der oberen Position', 'Hüfte komplett durchdrücken und Gesäß fest anspannen', 'Oben kurz halten (1–2 Sek.)', 'Langsam absenken ohne Boden zu berühren'],
    fehler: ['Nicht vollständig oben strecken', 'Füße zu weit oder zu nah positionieren', 'Unteren Rücken überstrecken statt Hüfte drücken'],
  },
  'ausfallschritt': {
    muskel: 'Quadrizeps · Gesäß', sekundaer: 'Hamstrings · Core · Adduktoren',
    warum: 'Ausfallschritte trainieren jeden Oberschenkel einzeln, decken Muskelungleichgewichte auf und verbessern Gleichgewicht und Koordination bei hoher Gesäßaktivierung.',
    muskeln: ['quad', 'glute', 'ham', 'abs'],
    tipps: ['Rumpf aufrecht halten', 'Vorderes Knie nicht über den Zeh hinausbeugen', 'Hinteres Knie fast den Boden berühren', 'Aus der Ferse des Vorderbeins hochdrücken', 'Schrittweite groß genug – etwa Hüftbreite'],
    fehler: ['Oberkörper zu weit vorbeugen', 'Knie nach innen einknicken', 'Schrittweite zu klein'],
  },
  'schrägbankdrücken': {
    muskel: 'Obere Brust (Pectoralis, Klavikularbündel)', sekundaer: 'Vordere Schulter · Trizeps',
    warum: 'Schrägbankdrücken betont speziell den oberen Brustbereich und gibt der Brust Fülle und Definition im oberen Bereich – essenziell für eine vollständig entwickelte Brust.',
    muskeln: ['chest', 'shoulder', 'tricep'],
    tipps: ['Neigung 30–45° (steiler = mehr Schulter, weniger Brust)', 'Schulterblätter fest einziehen wie beim normalen Bankdrücken', 'Stange zur oberen Brust führen', 'Ellenbogen ca. 60° vom Körper', 'Vollständige Streckung oben'],
    fehler: ['Neigung über 60° – Schulter dominiert zu stark', 'Schultern hochziehen', 'Inkonsistente Stangenbahn'],
  },
  'butterfly': {
    muskel: 'Brust (Pectoralis Major)', sekundaer: 'Vordere Schulter',
    warum: 'Butterfly/Pec-Deck isoliert die Brust ohne Trizeps-Beteiligung – ideal für maximale Brust-Isolation und den "Peak-Pump". Perfekt als Finisher nach Drückübungen.',
    muskeln: ['chest', 'shoulder'],
    tipps: ['Rücken fest an der Lehne, keine Hohlkreuz', 'Arme leicht gebeugt – Ellenbogen nie vollständig strecken', 'Bewegung kommt aus der Brust, nicht den Schultern', 'Vorne kurz gegeneinanderdrücken und anspannen', 'Weit öffnen für maximale Dehnung'],
    fehler: ['Ellenbogen vollständig strecken (Schultergelenk belastet)', 'Schultern nach vorne rollen', 'Zu viel Gewicht mit Schwung'],
  },
  'crunch': {
    muskel: 'Bauch (Rectus Abdominis)', sekundaer: 'Schräge Bauchmuskulatur',
    warum: 'Crunch isoliert den geraden Bauchmuskel mit weniger Hüftbeuger-Beteiligung als Sit-Ups – direktere und sichere Bauchmuskel-Aktivierung.',
    muskeln: ['abs'],
    tipps: ['Lendenwirbel bleiben am Boden – nur Schultern heben', 'Hände locker an die Schläfen, nicht am Kopf ziehen', 'Kinn leicht zur Brust', 'Oben kurz halten und anspannen', 'Langsam absenken ohne Schultern abzulegen'],
    fehler: ['Am Kopf ziehen (Nackenprobleme)', 'Hüfte mit hochreißen', 'Zu schnell und unkontrolliert'],
  },
  'sit-up': {
    muskel: 'Bauch (Rectus Abdominis)', sekundaer: 'Hüftbeuger · Schräge Bauchmuskulatur',
    warum: 'Sit-Ups trainieren den geraden Bauchmuskel durch volle Bewegungsamplitude und sind eine klassische Core-Übung für Stabilität und Rumpfkraft.',
    muskeln: ['abs'],
    tipps: ['Füße fixiert oder frei je nach Variante', 'Hände locker an den Schläfen – nicht hinter dem Kopf', 'Langsam absenken (2–3 Sek.)', 'Oben kurz halten und anspannen', 'Gleichmäßig atmen'],
    fehler: ['Am Kopf ziehen', 'Zu schnell und schwungvoll', 'Hohlkreuz beim Ablegen'],
  },
  'face pull': {
    muskel: 'Hintere Schulter (Posteriorer Deltoid)', sekundaer: 'Rotatorenmanschette · Trapez · Rhomboid',
    warum: 'Face Pull ist eine der wichtigsten Gesundheitsübungen für Schultern. Stärkt die Rotatorenmanschette und korrigiert Haltungsschäden durch zu viel Drücken.',
    muskeln: ['shoulder', 'trap'],
    tipps: ['Kabel auf Augenhöhe oder leicht darüber', 'Seil zu Ohren/Wangen ziehen – nicht zur Stirn', 'Ellenbogen nach außen-oben führen', 'Außenrotation am Ende der Bewegung', 'Leichtes Gewicht – Qualität wichtiger als Quantität'],
    fehler: ['Zu schwer – Nacken/Trapez übernimmt', 'Ellenbogen fallen lassen', 'Kabel zu tief ansetzen'],
  },
  'trizeps pushdown': {
    muskel: 'Trizeps (Brachii)', sekundaer: 'Unterarmstrecker',
    warum: 'Kabel-Trizepsdrücken hält konstanten Widerstand über die gesamte Bewegung und ist besonders gut für den langen Trizepskopf – ideale Isolationsübung für Arm-Definition.',
    muskeln: ['tricep'],
    tipps: ['Ellenbogen fix an den Seiten – kein Bewegen', 'Nur der Unterarm bewegt sich', 'Volle Streckung am Ende durchdrücken', 'Langsam zurückführen (2–3 Sek.)', 'Handgelenk neutral – kein Abbiegen'],
    fehler: ['Ellenbogen wegschwingen', 'Oberkörper nach vorne beugen', 'Nicht vollständig strecken'],
  },
  'hammer curl': {
    muskel: 'Bizeps (Brachialis)', sekundaer: 'Unterarmmuskeln · Bizeps Brachii',
    warum: 'Hammer Curls mit neutralem Griff trainieren besonders den Brachialis unter dem Bizeps – macht den Arm insgesamt dicker und "hebt" den Bizeps optisch an.',
    muskeln: ['bicep'],
    tipps: ['Neutraler Griff – Daumen zeigen nach oben', 'Ellenbogen fix am Körper halten', 'Volle Amplitude: ganz strecken, ganz beugen', 'Oben kurz halten', 'Beide Arme gleichzeitig oder alternierend'],
    fehler: ['Schwingen mit dem Körper', 'Griff drehen (wird dann normaler Curl)', 'Zu schnell absenken'],
  },
  'rumänisches kreuzheben': {
    muskel: 'Hamstrings · Gesäß', sekundaer: 'Rückenstrecker · Waden',
    warum: 'RDL ist die beste Übung speziell für die Hamstrings. Durch die Hüftbeugung mit fast gestreckten Beinen wird die Rückseite des Oberschenkels maximal gedehnt und belastet.',
    muskeln: ['ham', 'glute', 'lback'],
    tipps: ['Knie leicht gebeugt und konstant halten', 'Rücken gerade – Hüfte nach hinten schieben', 'Stange eng am Körper führen', 'Absenken bis starke Dehnung in Hamstrings spürbar ist', 'Aus der Hüfte aufrichten, nicht aus dem Rücken'],
    fehler: ['Knie zu stark beugen – wird zur Kniebeuge', 'Rundrücken beim Absenken', 'Stange vom Körper wegschwingen'],
  },
  'bulgarian split squat': {
    muskel: 'Quadrizeps · Gesäß', sekundaer: 'Hamstrings · Core · Gleichgewicht',
    warum: 'Bulgarische Kniebeuge ist eine der härtesten und effektivsten Beinübungen. Trainiert jeden Oberschenkel einzeln mit sehr hoher Gesäß- und Quad-Aktivierung.',
    muskeln: ['quad', 'glute', 'ham'],
    tipps: ['Hinterer Fuß auf Bank oder Ablage', 'Vorderer Fuß weit genug vor – Knie nicht über den Zeh', 'Oberkörper aufrecht oder leicht vorgebeugt', 'Langsam absenken (3–4 Sek.)', 'Aus der Ferse des Vorderbeins aufstehen'],
    fehler: ['Vorderer Fuß zu nah an der Bank', 'Knie nach innen einknicken', 'Hüfte dreht oder kippt seitlich'],
  },
  'kabelrudern': {
    muskel: 'Oberer Rücken (Rhomboid, Trapez)', sekundaer: 'Latissimus · Bizeps · hintere Schulter',
    warum: 'Kabelrudern hält konstanten Widerstand über die gesamte Bewegung und ist ideal für Rückendicke und Schultergesundheit als Gegenstück zu Drückübungen.',
    muskeln: ['lat', 'trap', 'bicep', 'shoulder'],
    tipps: ['Oberkörper leicht nach vorne geneigt, Rücken gerade', 'Ellenbogen eng am Körper führen', 'Griff zum Bauch ziehen', 'Am Ende Schulterblätter kräftig zusammenkneifen', 'Langsam strecken – exzentrische Phase nutzen'],
    fehler: ['Rücken rund – Bandscheiben belastet', 'Mit dem Rücken Schwung holen', 'Griff zu weit oben zur Brust ziehen'],
  },
  'rudermaschine': {
    muskel: 'Rücken · Herz-Kreislauf', sekundaer: 'Bizeps · Core · Beine · Schultern',
    warum: 'Rudermaschine ist eines der effektivsten Ganzkörper-Cardiogeräte – aktiviert gleichzeitig ca. 86% der Muskulatur und trainiert Ausdauer und Kraft.',
    muskeln: ['lat', 'trap', 'bicep', 'quad', 'abs'],
    tipps: ['Zugphasen-Reihenfolge: Beine – Rücken – Arme', 'Beine und Rücken machen 60–70% der Arbeit', 'Rücken leicht nach hinten lehnen am Ende des Zugs', 'Griff locker – keine Verkrampfung', 'Gleichmäßiges Tempo: 22–28 Züge/Min für Ausdauer'],
    fehler: ['Mit dem Rücken ziehen statt Beine nutzen', 'Rundrücken', 'Zu hohe Zugrate mit zu wenig Widerstand'],
  },
  'crosstrainer': {
    muskel: 'Herz-Kreislauf-System', sekundaer: 'Quadrizeps · Hamstrings · Gesäß · Arme',
    warum: 'Crosstrainer bietet gelenkschonendes Ganzkörper-Cardio. Durch aktive Armbewegung werden Ober- und Unterkörper gleichzeitig trainiert.',
    muskeln: ['quad', 'ham', 'glute'],
    tipps: ['Aufrechte Körperhaltung, leicht nach vorne lehnen', 'Arme aktiv einsetzen – Schub und Zug wechseln', 'Gleichmäßiger Rhythmus, Puls im Zielbereich', 'Widerstand variieren für unterschiedliche Intensität', 'Vorwärts = mehr Quadrizeps, rückwärts = mehr Gesäß'],
    fehler: ['Arme passiv hängen lassen', 'Zu leichter Widerstand ohne Herausforderung', 'An den Griffen hängen statt aufrecht stehen'],
  },
  'seilspringen': {
    muskel: 'Herz-Kreislauf-System · Koordination', sekundaer: 'Waden · Schultern · Core',
    warum: 'Springseil ist eines der effektivsten Cardio-Tools – verbrennt bis zu 10 kcal/min, verbessert Koordination, Rhythmus und Fußstabilität.',
    muskeln: ['calf', 'shoulder'],
    tipps: ['Auf den Fußballen landen – nicht auf den Fersen', 'Ellenbogen nah am Körper, Handgelenke drehen das Seil', 'Kleiner Sprung reicht – nur wenige Zentimeter hoch', 'Aufrechte Haltung, Blick geradeaus', 'Langsam anfangen und Rhythmus entwickeln'],
    fehler: ['Zu hohe Sprünge (belasten Knie und Gelenke)', 'Mit ganzen Armen schwingen statt Handgelenke', 'Auf den Fersen landen'],
  },
  'beinheben': {
    muskel: 'Unterer Bauch (Rectus Abdominis)', sekundaer: 'Hüftbeuger · Core',
    warum: 'Beinheben aktiviert besonders den unteren Teil des Bauchmuskels, der durch normale Crunches kaum erreicht wird – außerdem Hüftbeuger und Core-Stabilität.',
    muskeln: ['abs'],
    tipps: ['Lendenwirbel fest auf die Bank/Matte drücken', 'Beine gestreckt oder leicht gebeugt', 'Langsam absenken ohne den Boden zu berühren', 'Kontrollierte Bewegung – kein Schwung', 'Hängende Variante an der Klimmzugstange für mehr Intensität'],
    fehler: ['Hohlkreuz beim Absenken', 'Mit Schwung und Hüfte schaukeln', 'Zu schnell und unkontrolliert'],
  },
  'russian twist': {
    muskel: 'Schräge Bauchmuskulatur (Obliques)', sekundaer: 'Gerader Bauchmuskel · Hüftbeuger',
    warum: 'Russian Twist trainiert die schräge Bauchmuskulatur, die für Rotation, Stabilität und eine definierte Taille verantwortlich ist.',
    muskeln: ['abs'],
    tipps: ['Rücken leicht nach hinten geneigt (45°)', 'Füße leicht angehoben für mehr Intensität', 'Rotation kommt aus dem Rumpf – Arme pendeln nicht einfach', 'Jede Seite gleichmäßig abwechseln', 'Mit Zusatzgewicht für mehr Intensität'],
    fehler: ['Arme pendeln statt Rumpf rotieren', 'Zu weit nach hinten lehnen', 'Zu schnell ohne Kontrolle'],
  },
  'arnold press': {
    muskel: 'Schultern (Deltoid, alle 3 Köpfe)', sekundaer: 'Trizeps · Trapez',
    warum: 'Arnold Press mit Rotationsbewegung aktiviert alle drei Schulterköpfe gleichzeitig – entwickelt Schultern rundum und gibt mehr Volumen als normales Schulterdrücken.',
    muskeln: ['shoulder', 'tricep', 'trap'],
    tipps: ['Start: Handflächen zeigen zu dir, Ellenbogen vorne unten', 'Beim Drücken nach außen rotieren', 'Oben: Handflächen zeigen nach vorne wie beim normalen Press', 'Kontrollierte Rotation in beide Richtungen', 'Nicht zu schwer – Technik hat Vorrang'],
    fehler: ['Rotation vernachlässigen – wird normaler Schulterpress', 'Zu viel Schwung', 'Starkes Hohlkreuz'],
  },
  'goblet squat': {
    muskel: 'Quadrizeps · Gesäß', sekundaer: 'Core · Adduktoren · oberer Rücken',
    warum: 'Goblet Squat ist die perfekte Kniebeuge für Anfänger und ideal zum Mobilitätstraining. Der Gegengewicht fördert aufrechte Körperhaltung und tiefere Hocke.',
    muskeln: ['quad', 'glute', 'abs'],
    tipps: ['Kettlebell/Hantel vor der Brust halten', 'Füße schulterbreit, Zehen leicht nach außen', 'Tief in die Hocke – so tief wie möglich', 'Knie drücken nach außen über die Zehen', 'Brust hoch, Rücken gerade'],
    fehler: ['Nicht tief genug gehen', 'Knie nach innen fallen lassen', 'Oberkörper zu weit vorbeugen'],
  },
}

// Alias-Mapping: alternative Namen → kanonischer Schlüssel in UEBUNG_TIPS
const ALIASES: Record<string, string> = {
  'lat pulldown': 'latzug', 'lat-pulldown': 'latzug', 'latziehen': 'latzug', 'latpulldown': 'latzug',
  'hyperextension': 'rückenstrecker', 'hyperextensions': 'rückenstrecker', 'rückenextension': 'rückenstrecker',
  'leg press': 'beinpresse', 'legpress': 'beinpresse', 'bein presse': 'beinpresse',
  'calf raise': 'wadenheben', 'calf raises': 'wadenheben', 'wadenpressen': 'wadenheben', 'standing calf raise': 'wadenheben',
  'beckenheben': 'hip thrust', 'gesäßbrücke': 'hip thrust', 'brücke': 'hip thrust', 'glute bridge': 'hip thrust',
  'lunge': 'ausfallschritt', 'lunges': 'ausfallschritt', 'ausfallschritte': 'ausfallschritt',
  'incline bench': 'schrägbankdrücken', 'incline press': 'schrägbankdrücken', 'schrägbank': 'schrägbankdrücken',
  'pec deck': 'butterfly', 'fliegende': 'butterfly', 'kabel butterfly': 'butterfly', 'chest fly': 'butterfly',
  'sit up': 'sit-up', 'situp': 'sit-up', 'sit ups': 'sit-up', 'situps': 'sit-up',
  'bauchcrunch': 'crunch', 'bauchpresse': 'crunch',
  'face-pull': 'face pull', 'facepull': 'face pull', 'gesichtszug': 'face pull',
  'trizeps-pushdown': 'trizeps pushdown', 'kabel trizeps': 'trizeps pushdown', 'cable pushdown': 'trizeps pushdown', 'trizeps kabelzug': 'trizeps pushdown',
  'rdl': 'rumänisches kreuzheben', 'romanian deadlift': 'rumänisches kreuzheben', 'rumänisches kh': 'rumänisches kreuzheben',
  'bulgarische kniebeuge': 'bulgarian split squat', 'split squat': 'bulgarian split squat',
  'kabelrudern': 'kabelrudern', 'sitzrudern': 'kabelrudern', 'cable row': 'kabelrudern', 'rudermaschine sitzend': 'kabelrudern',
  'rowing': 'rudermaschine', 'rowing machine': 'rudermaschine', 'ruderergometer': 'rudermaschine',
  'ellipsentrainer': 'crosstrainer', 'elliptical': 'crosstrainer',
  'rope jumping': 'seilspringen', 'jump rope': 'seilspringen', 'seil': 'seilspringen', 'skipping': 'seilspringen',
  'leg raise': 'beinheben', 'leg raises': 'beinheben', 'hanging leg raise': 'beinheben',
  'russian twists': 'russian twist',
  'arnold drücken': 'arnold press',
  'squat': 'kniebeuge', 'back squat': 'kniebeuge',
  'deadlift': 'kreuzheben', 'conventional deadlift': 'kreuzheben',
  'bench press': 'bankdrücken', 'flachbank': 'bankdrücken',
  'overhead press': 'schulterdrücken', 'military press': 'schulterdrücken', 'ohp': 'schulterdrücken',
  'barbell row': 'rudern', 'bent over row': 'rudern', 'pendelrudern': 'rudern',
  'curl': 'bizeps curl', 'bizepscurl': 'bizeps curl', 'langhantelcurl': 'bizeps curl',
  'trizeps': 'trizepsdrücken', 'skull crusher': 'trizepsdrücken',
  'leg extension': 'beinstrecken', 'leg extensions': 'beinstrecken',
  'leg curl': 'beinbeugen', 'leg curls': 'beinbeugen', 'lying leg curl': 'beinbeugen',
  'treadmill': 'laufband', 'laufen band': 'laufband',
  'fahrradergometer': 'fahrrad', 'bike': 'fahrrad', 'stationary bike': 'fahrrad',
  'seitliche erhebung': 'seitheben', 'lateral raise': 'seitheben',
  'push up': 'liegestützen', 'push ups': 'liegestützen', 'pushup': 'liegestützen',
  'chin up': 'klimmzug', 'chinup': 'klimmzug', 'pull-up': 'klimmzug',
}

function getTip(name: string): UebungTip | null {
  const key = name.toLowerCase().trim()
  if (UEBUNG_TIPS[key]) return UEBUNG_TIPS[key]
  const alias = ALIASES[key]
  if (alias && UEBUNG_TIPS[alias]) return UEBUNG_TIPS[alias]
  // Partial/fuzzy: any dict key contained in input or vice versa
  const fuzzy = Object.keys(UEBUNG_TIPS).find(k => key.includes(k) || k.includes(key))
  if (fuzzy) return UEBUNG_TIPS[fuzzy]
  const fuzzyAlias = Object.entries(ALIASES).find(([a]) => key.includes(a) || a.includes(key))
  if (fuzzyAlias) return UEBUNG_TIPS[fuzzyAlias[1]]
  return null
}

// ─── Übungspool (deutsch) ─────────────────────────────────────────────────────

async function loadLocalExercises(): Promise<PoolExercise[]> {
  try { return await loadExercises() } catch { return [] }
}

const findLocalExercise = (name: string, list: PoolExercise[]): PoolExercise | null => findBest(name, list) ?? null

// ─── Exercise Tip Modal ───────────────────────────────────────────────────────

const MUSKEL_LABELS: Record<string, string> = {
  chest: 'Brust', shoulder: 'Schultern', bicep: 'Bizeps', tricep: 'Trizeps',
  trap: 'Trapez', lat: 'Latissimus', lback: 'Unterer Rücken', abs: 'Core',
  quad: 'Quadrizeps', ham: 'Hamstrings', glute: 'Gesäß', calf: 'Waden',
}

function UebungTipModal({ name, onClose }: { name: string; onClose: () => void }) {
  const tip = getTip(name)
  const [localEx, setLocalEx] = useState<PoolExercise | null>(null)
  const [localLoading, setLocalLoading] = useState(true)
  const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(name + ' richtige Ausführung Technik')}`

  useEffect(() => {
    setLocalLoading(true)
    setLocalEx(null)
    loadLocalExercises().then(list => {
      setLocalEx(findLocalExercise(name, list))
      setLocalLoading(false)
    })
  }, [name])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-bg-card rounded-2xl border border-border w-full max-w-sm overflow-y-auto"
        style={{ maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-4">
          <div>
            <div className="font-bold text-text-primary capitalize text-base">{name}</div>
            {tip ? (
              <>
                <div className="text-xs text-brand font-medium mt-0.5">{tip.muskel}</div>
                <div className="text-xs text-text-muted">{tip.sekundaer}</div>
              </>
            ) : localEx?.target_de ? (
              <div className="text-xs text-brand font-medium mt-0.5">
                {localEx.target_de}{localEx.body_part_de ? ` · ${localEx.body_part_de}` : ''}
              </div>
            ) : null}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-elevated text-text-muted shrink-0 ml-3"><X size={16} /></button>
        </div>

        <div className="px-5 pb-6 space-y-5">
          {/* GIF from local dataset */}
          {localLoading ? (
            <div className="w-full rounded-xl bg-bg-elevated flex items-center justify-center" style={{ aspectRatio: '4/3' }}>
              <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          ) : localEx ? (
            <div className="w-full rounded-xl overflow-hidden bg-bg-elevated" style={{ aspectRatio: '4/3' }}>
              <img
                src={gifUrl(localEx)} alt="" className="w-full h-full object-contain"
                onError={e => { const img = e.currentTarget; if (!img.dataset.fb) { img.dataset.fb = '1'; img.src = imgUrl(localEx) } }}
              />
            </div>
          ) : null}

          {tip ? (
            <>
              {/* Muscle chips */}
              <div className="flex flex-wrap gap-1.5">
                {tip.muskeln.map(m => (
                  <span key={m} className="text-[11px] px-2.5 py-1 rounded-full bg-brand/20 text-brand font-medium">
                    {MUSKEL_LABELS[m] ?? m}
                  </span>
                ))}
              </div>

              {/* Warum */}
              <div>
                <div className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">Warum diese Übung?</div>
                <p className="text-sm text-text-secondary leading-relaxed">{tip.warum}</p>
              </div>

              {/* Ausführung */}
              <div>
                <div className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">Richtige Ausführung</div>
                <ul className="space-y-2">
                  {tip.tipps.map((t, i) => (
                    <li key={i} className="flex gap-2.5 text-sm text-text-secondary">
                      <span className="w-5 h-5 rounded-full bg-brand/20 text-brand text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Fehler */}
              <div>
                <div className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">Häufige Fehler</div>
                <ul className="space-y-1.5">
                  {tip.fehler.map((f, i) => (
                    <li key={i} className="flex gap-2 text-sm text-text-secondary">
                      <span className="text-danger shrink-0">✕</span>{f}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : localEx?.steps?.length ? (
            <div>
              <div className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">Richtige Ausführung</div>
              <ul className="space-y-2">
                {localEx!.steps.map((step, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-text-secondary">
                    <span className="w-5 h-5 rounded-full bg-brand/20 text-brand text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                    {step}
                  </li>
                ))}
              </ul>
            </div>
          ) : !localLoading ? (
            <p className="text-sm text-text-muted">Für <span className="text-text-primary font-medium">"{name}"</span> sind noch keine Tipps hinterlegt.</p>
          ) : null}

          {/* YouTube */}
          <a href={ytUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-border hover:border-brand/50 hover:bg-brand/5 text-sm text-text-secondary hover:text-brand transition-colors">
            <span>▶</span> Videodemonstration ansehen
          </a>
        </div>
      </div>
    </div>
  )
}

// ─── Exercise Picker Modal ────────────────────────────────────────────────────

function ExercisePickerModal({ onSelect, onClose }: { onSelect: (name: string) => void; onClose: () => void }) {
  const [list, setList] = useState<PoolExercise[]>([])
  const [query, setQuery] = useState('')

  useEffect(() => { loadLocalExercises().then(setList) }, [])

  const keys = useMemo(() => new Map(list.map(e => [e.id, searchKey(e)])), [list])
  const filtered = useMemo(() => {
    const words = norm(query).split(' ').filter(Boolean)
    return list
      .filter(e => !words.length || words.every(w => (keys.get(e.id) ?? '').includes(w)))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'))
      .slice(0, 80)
  }, [list, keys, query])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-bg-card w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col" style={{ maxHeight: '85vh' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
          <Search size={15} className="text-text-muted shrink-0" />
          <input
            autoFocus
            type="search"
            placeholder="Übung suchen…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="flex-1 bg-transparent outline-none text-sm text-text-primary placeholder:text-text-muted"
          />
          <button onClick={onClose} className="text-text-muted hover:text-text-secondary"><X size={16} /></button>
        </div>
        <div className="overflow-y-auto">
          {list.length === 0 ? (
            <div className="py-10 text-center text-sm text-text-muted">Der Übungspool konnte nicht geladen werden.<br />Prüfe deine Internetverbindung.</div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-text-muted">Keine Treffer.</div>
          ) : filtered.map(ex => (
            <button
              key={ex.id}
              onClick={() => { onSelect(ex.name); onClose() }}
              className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-bg-elevated transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-bg-elevated overflow-hidden shrink-0">
                <img src={imgUrl(ex)} alt="" loading="lazy" className="w-full h-full object-cover"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-text-primary truncate">{ex.name}</div>
                <div className="text-xs text-text-muted truncate">{ex.target_de} · {ex.equipment_de}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Exercise Name Input with Autocomplete ────────────────────────────────────

function ExerciseNameInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [suggestions, setSuggestions] = useState<PoolExercise[]>([])
  const [open, setOpen] = useState(false)
  const [allEx, setAllEx] = useState<PoolExercise[]>([])
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadLocalExercises().then(setAllEx) }, [])

  useEffect(() => {
    const words = norm(value).split(' ').filter(Boolean)
    if (norm(value).length < 2 || allEx.length === 0) { setSuggestions([]); return }
    const first = norm(value)
    const res = allEx
      .filter(e => { const k = searchKey(e); return words.every(w => k.includes(w)) })
      .sort((a, b) =>
        (Number((' ' + norm(b.name)).includes(' ' + first)) - Number((' ' + norm(a.name)).includes(' ' + first))) ||
        (b.compound - a.compound) || (equipmentRank(a) - equipmentRank(b)) || a.name.length - b.name.length)
      .slice(0, 7)
    setSuggestions(res)
    setOpen(res.length > 0)
  }, [value, allEx])

  function select(name: string) {
    onChange(name)
    setSuggestions([])
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className="relative flex-1">
      <input
        className="input w-full text-sm py-2"
        placeholder="Übungsname"
        value={value}
        onChange={ev => { onChange(ev.target.value); setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-bg-card border border-border rounded-xl shadow-lg overflow-hidden">
          {suggestions.map(ex => (
            <button
              key={ex.id}
              onMouseDown={() => select(ex.name)}
              className="flex items-center gap-2.5 w-full px-3 py-2 hover:bg-bg-elevated transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-lg bg-bg-elevated overflow-hidden shrink-0">
                <img src={imgUrl(ex)} alt="" loading="lazy" className="w-full h-full object-cover"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-text-primary truncate">{ex.name}</div>
                <div className="text-[10px] text-text-muted truncate">{ex.target_de} · {ex.equipment_de}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Uebung Form ─────────────────────────────────────────────────────────────

type UebungFormEntry = { uebungsname: string; saetze: string; wdh: string; gewicht_kg: string; notizen: string }
function UebungForm({ entries, onChange }: {
  entries: UebungFormEntry[]
  onChange: (entries: UebungFormEntry[]) => void
}) {
  const [tipFor, setTipFor] = useState<string | null>(null)

  function add() {
    onChange([...entries, { uebungsname: '', saetze: '', wdh: '', gewicht_kg: '', notizen: '' }])
  }
  function remove(i: number) {
    onChange(entries.filter((_, idx) => idx !== i))
  }
  function update(i: number, field: string, val: string) {
    const next = [...entries]
    next[i] = { ...next[i], [field]: val }
    onChange(next)
  }

  return (
    <div className="space-y-3">
      {tipFor && <UebungTipModal name={tipFor} onClose={() => setTipFor(null)} />}

      {entries.map((e, i) => (
        <div key={i} className="p-3 bg-bg-elevated rounded-lg space-y-2">
          <div className="flex gap-2">
            <ExerciseNameInput value={e.uebungsname} onChange={v => update(i, 'uebungsname', v)} />
            <button onClick={() => setTipFor(e.uebungsname || null)} title="Tipps anzeigen"
              className="p-2 rounded-lg border border-border hover:bg-brand/10 hover:text-brand text-text-muted transition-colors">
              <HelpCircle size={14} />
            </button>
            <button onClick={() => remove(i)} className="p-2 rounded-lg hover:bg-danger/10 hover:text-danger text-text-muted"><Trash2 size={14} /></button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-text-muted mb-1 block">Sätze</label>
              <input type="number" className="input text-sm py-2" placeholder="3" value={e.saetze} onChange={ev => update(i, 'saetze', ev.target.value)} />
            </div>
            <div>
              <label className="text-xs text-text-muted mb-1 block">Wdh.</label>
              <input type="number" className="input text-sm py-2" placeholder="10" value={e.wdh} onChange={ev => update(i, 'wdh', ev.target.value)} />
            </div>
            <div>
              <label className="text-xs text-text-muted mb-1 block">Gewicht (kg)</label>
              <input type="number" step="0.5" className="input text-sm py-2" placeholder="80" value={e.gewicht_kg} onChange={ev => update(i, 'gewicht_kg', ev.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs text-text-muted mb-1 block">Notiz (optional)</label>
            <input type="text" className="input text-sm py-2" placeholder="z. B. Sitzhöhe 4, linke Schulter zwickt" value={e.notizen} onChange={ev => update(i, 'notizen', ev.target.value)} />
          </div>
        </div>
      ))}
      <button onClick={add} className="btn-secondary w-full text-sm flex items-center justify-center gap-2">
        <Plus size={14} /> Übung hinzufügen
      </button>
    </div>
  )
}

// ─── Active Workout (Strong-style per-set tracking) ──────────────────────────

interface ActiveSet { wdh: string; kg: string; done: boolean }
interface ActiveExercise {
  name: string
  sets: ActiveSet[]
  prevSets: { wdh: number | null; kg: number | null }[]
  note?: string // optionale Notiz zu dieser Übung in diesem Training
  prevNote?: string // letzte Notiz zu dieser Übung als Hinweis
}
interface ActiveWorkoutState { vorlage: any; startTime: number; exercises: ActiveExercise[] }

const REST_SECONDS = 120

const WORKOUT_KEY = 'hlx_activeWorkout'

function ActiveWorkoutView({ workout, onFinish, onAbort }: {
  workout: ActiveWorkoutState
  onFinish: (exercises: ActiveExercise[], elapsedMin: number) => void
  onAbort: () => void
}) {
  const [exercises, setExercises] = useState<ActiveExercise[]>(workout.exercises)
  const [elapsed, setElapsed] = useState(0)
  const [tipFor, setTipFor] = useState<string | null>(null)
  const [rest, setRest] = useState<{ exIdx: number; setIdx: number; remaining: number } | null>(null)
  const [newExName, setNewExName] = useState('')
  const [noteOpen, setNoteOpen] = useState<Record<number, boolean>>({})

  function setNote(exIdx: number, note: string) {
    setExercises(prev => prev.map((e, i) => i === exIdx ? { ...e, note } : e))
  }

  // Persist workout state (including live exercise edits) whenever exercises change
  useEffect(() => {
    localStorage.setItem(WORKOUT_KEY, JSON.stringify({ ...workout, exercises }))
  }, [exercises])

  useEffect(() => {
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - workout.startTime) / 1000)), 1000)
    return () => clearInterval(interval)
  }, [workout.startTime])

  // Rest timer countdown
  useEffect(() => {
    if (!rest) return
    if (rest.remaining <= 0) { setRest(null); return }
    const t = setTimeout(() => setRest(r => r ? { ...r, remaining: r.remaining - 1 } : null), 1000)
    return () => clearTimeout(t)
  }, [rest])

  function updateSet(exIdx: number, setIdx: number, field: 'wdh' | 'kg', value: string) {
    setExercises(prev => {
      const next = prev.map(e => ({ ...e, sets: [...e.sets] }))
      next[exIdx].sets[setIdx] = { ...next[exIdx].sets[setIdx], [field]: value }
      return next
    })
  }

  function toggleDone(exIdx: number, setIdx: number) {
    setExercises(prev => {
      const next = prev.map(e => ({ ...e, sets: [...e.sets] }))
      const wasDone = next[exIdx].sets[setIdx].done
      next[exIdx].sets[setIdx] = { ...next[exIdx].sets[setIdx], done: !wasDone }
      if (!wasDone) setRest({ exIdx, setIdx, remaining: REST_SECONDS })
      else setRest(null)
      return next
    })
  }

  function addSet(exIdx: number) {
    setExercises(prev => {
      const next = prev.map(e => ({ ...e, sets: [...e.sets] }))
      const last = next[exIdx].sets.at(-1)
      next[exIdx].sets.push({ wdh: last?.wdh ?? '', kg: last?.kg ?? '', done: false })
      return next
    })
  }

  function removeExercise(exIdx: number) {
    setExercises(prev => prev.filter((_, i) => i !== exIdx))
  }

  function addExercise() {
    const name = newExName.trim()
    if (!name) return
    setExercises(prev => [...prev, { name, sets: [{ wdh: '', kg: '', done: false }, { wdh: '', kg: '', done: false }, { wdh: '', kg: '', done: false }], prevSets: [], note: '' }])
    setNewExName('')
  }

  const doneCount = exercises.reduce((a, ex) => a + ex.sets.filter(s => s.done).length, 0)
  const totalCount = exercises.reduce((a, ex) => a + ex.sets.length, 0)
  const mm = Math.floor(elapsed / 60).toString().padStart(2, '0')
  const ss = (elapsed % 60).toString().padStart(2, '0')

  return (
    <div className="fixed inset-0 z-40 bg-bg overflow-y-auto">
      {tipFor && <UebungTipModal name={tipFor} onClose={() => setTipFor(null)} />}

      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-bg-card/95 backdrop-blur border-b border-border px-4 py-3 flex items-center justify-between">
        <div>
          <div className="font-bold text-text-primary">{workout.vorlage.name}</div>
          <div className="text-xs text-text-muted flex items-center gap-1.5 mt-0.5">
            <Timer size={11} /> {mm}:{ss} · {doneCount}/{totalCount} Sätze
            {rest && (
              <span className="ml-2 text-brand font-semibold">
                Pause {Math.floor(rest.remaining / 60)}:{String(rest.remaining % 60).padStart(2, '0')}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onAbort} className="btn-secondary text-sm px-3 py-1.5">Abbrechen</button>
          <button
            onClick={() => onFinish(exercises, Math.floor(elapsed / 60))}
            className="btn-primary text-sm px-3 py-1.5 flex items-center gap-1.5"
          >
            <Check size={14} /> Beenden
          </button>
        </div>
      </div>

      {/* Exercise list */}
      <div className="p-4 space-y-4 max-w-lg mx-auto pb-8">
        {exercises.map((ex, exIdx) => {
          const allDone = ex.sets.length > 0 && ex.sets.every(s => s.done)
          return (
            <div key={exIdx} className={`card transition-opacity ${allDone ? 'opacity-50' : ''}`}>
              <div className="flex items-center justify-between mb-4">
                <span className="font-bold text-text-primary text-base">{ex.name}</span>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setTipFor(ex.name)}
                    className="p-1.5 rounded-lg border border-border hover:bg-brand/10 hover:text-brand text-text-muted transition-colors"
                  >
                    <HelpCircle size={14} />
                  </button>
                  <button
                    onClick={() => removeExercise(exIdx)}
                    className="p-1.5 rounded-lg border border-border hover:bg-danger/10 hover:text-danger text-text-muted transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* Column headers */}
              <div className="grid grid-cols-[36px_1fr_76px_76px_40px] gap-2 mb-2 px-1 text-[11px] text-text-muted font-semibold uppercase tracking-wide">
                <span className="text-center">Set</span>
                <span>Vorherige</span>
                <span className="text-center">kg</span>
                <span className="text-center">Wdh.</span>
                <span></span>
              </div>

              {/* Set rows with rest timer between them */}
              {ex.sets.map((set, setIdx) => {
                const prev = ex.prevSets[setIdx]
                const prevLabel = prev?.kg ? `${prev.kg} kg × ${prev.wdh ?? '?'}` : '—'
                const isRestAfter = rest?.exIdx === exIdx && rest?.setIdx === setIdx
                return (
                  <div key={setIdx}>
                    <div
                      className={`grid grid-cols-[36px_1fr_76px_76px_40px] gap-2 items-center py-1 transition-opacity ${set.done ? 'opacity-40' : ''}`}
                    >
                      <span className="w-8 h-8 rounded-lg bg-bg-elevated flex items-center justify-center text-sm font-bold text-text-muted">{setIdx + 1}</span>
                      <span className="text-sm text-text-muted">{prevLabel}</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.5"
                        value={set.kg}
                        onChange={e => updateSet(exIdx, setIdx, 'kg', e.target.value)}
                        placeholder="—"
                        className="input text-center text-sm py-2 font-semibold"
                      />
                      <input
                        type="number"
                        inputMode="numeric"
                        value={set.wdh}
                        onChange={e => updateSet(exIdx, setIdx, 'wdh', e.target.value)}
                        placeholder="10"
                        className="input text-center text-sm py-2 font-semibold"
                      />
                      <button
                        onClick={() => toggleDone(exIdx, setIdx)}
                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                          set.done ? 'bg-success text-bg' : 'bg-bg-elevated text-text-muted hover:bg-success/20 hover:text-success'
                        }`}
                      >
                        <Check size={16} />
                      </button>
                    </div>
                    {/* Rest timer separator */}
                    {setIdx < ex.sets.length - 1 && (
                      <div className="flex items-center gap-2 my-1 px-1">
                        <div className="flex-1 h-px bg-border" />
                        <span className={`text-xs font-semibold ${isRestAfter ? 'text-brand' : 'text-text-muted'}`}>
                          {isRestAfter
                            ? `${Math.floor(rest!.remaining / 60)}:${String(rest!.remaining % 60).padStart(2, '0')}`
                            : '2:00'}
                        </span>
                        <div className="flex-1 h-px bg-border" />
                      </div>
                    )}
                  </div>
                )
              })}

              <button
                onClick={() => addSet(exIdx)}
                className="mt-3 w-full py-2.5 rounded-xl bg-bg-elevated text-sm text-text-muted hover:text-text-primary hover:bg-border transition-colors flex items-center justify-center gap-1.5"
              >
                <Plus size={14} /> Satz hinzufügen (2:00)
              </button>

              {/* Notiz (optional) */}
              {ex.prevNote && !(noteOpen[exIdx] ?? !!ex.note) && (
                <p className="mt-3 text-xs text-text-muted flex items-start gap-1.5">
                  <StickyNote size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>Letztes Mal: {ex.prevNote}</span>
                </p>
              )}
              {(noteOpen[exIdx] ?? !!ex.note) ? (
                <div className="mt-3">
                  <label htmlFor={`note-${exIdx}`} className="text-xs text-text-muted mb-1 flex items-center gap-1.5">
                    <StickyNote size={12} aria-hidden="true" /> Notiz zu dieser Übung
                  </label>
                  <textarea
                    id={`note-${exIdx}`} rows={2} className="input text-sm resize-none"
                    placeholder={ex.prevNote ? `Letztes Mal: ${ex.prevNote}` : 'z. B. Sitzhöhe 4, Schulter zwickt, nächstes Mal mehr Gewicht'}
                    value={ex.note ?? ''} onChange={e => setNote(exIdx, e.target.value)}
                  />
                </div>
              ) : (
                <button
                  onClick={() => setNoteOpen(o => ({ ...o, [exIdx]: true }))}
                  className="mt-2 text-xs text-brand hover:text-brand/80 flex items-center gap-1.5 transition-colors"
                >
                  <StickyNote size={12} aria-hidden="true" /> Notiz hinzufügen
                </button>
              )}
            </div>
          )
        })}

        {/* Add new exercise */}
        <div className="card">
          <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Übung hinzufügen</div>
          <div className="flex gap-2">
            <input
              className="input flex-1 text-sm"
              placeholder="Übungsname…"
              value={newExName}
              onChange={e => setNewExName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addExercise()}
            />
            <button
              onClick={addExercise}
              disabled={!newExName.trim()}
              className="btn-primary px-4 text-sm flex items-center gap-1.5 disabled:opacity-40"
            >
              <Plus size={14} /> Hinzufügen
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


export function TrainingLog({ embedded = false, onOpenVorlagen, startVorlageId, onStartHandled }: {
  embedded?: boolean
  onOpenVorlagen?: () => void
  /** Aus dem Kalender: Workout dieser Vorlage direkt starten */
  startVorlageId?: string
  onStartHandled?: () => void
}) {
  const { user } = useAuth()
  const { colors } = useTheme()
  const navigate = useNavigate()
  const [entries, setEntries] = useState<TrainingWithExercises[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [vorlagen, setVorlagen] = useState<any[]>([])
  const [vorlagenLoaded, setVorlagenLoaded] = useState(false)
  const startedFor = useRef<string | null>(null)
  const [selectedVorlage, setSelectedVorlage] = useState('')
  const [activeWorkout, setActiveWorkout] = useState<ActiveWorkoutState | null>(null)
  const [savedWorkout, setSavedWorkout] = useState<ActiveWorkoutState | null>(null)
  const [form, setForm] = useState({
    datum: todayISO(), trainingstyp: 'Kraft', dauer_h: '0', dauer_m: '0', avg_puls: '', kalorien_verbrannt: '', notizen: '',
  })
  const [uebungen, setUebungen] = useState<{ uebungsname: string; saetze: string; wdh: string; gewicht_kg: string; notizen: string }[]>([])

  async function load() {
    if (!user) return
    const { data } = await supabase.from('training').select('*').eq('user_id', user.id).order('datum', { ascending: false })
    const trainings = (data ?? []) as TrainingWithExercises[]
    // Load exercises for each training
    const ids = trainings.map(t => t.id)
    if (ids.length) {
      const { data: ex } = await supabase.from('uebungen').select('*').in('training_id', ids)
      const exMap = (ex ?? []).reduce<Record<string, UebungEntry[]>>((acc, e) => {
        if (!acc[e.training_id]) acc[e.training_id] = []
        acc[e.training_id].push(e)
        return acc
      }, {})
      trainings.forEach(t => { t.uebungen = exMap[t.id] ?? [] })
    }
    setEntries(trainings)
    setLoading(false)
  }

  async function loadVorlagen() {
    if (!user) return
    const { data: vData } = await supabase.from('training_vorlagen').select('*').eq('user_id', user.id)
    if (!vData?.length) { setVorlagenLoaded(true); return }
    const { data: uData } = await supabase.from('vorlagen_uebungen').select('*').in('vorlage_id', vData.map((v: any) => v.id)).order('reihenfolge')
    const uMap = (uData ?? []).reduce<Record<string, any[]>>((acc, u: any) => {
      if (!acc[u.vorlage_id]) acc[u.vorlage_id] = []
      acc[u.vorlage_id].push(u)
      return acc
    }, {})
    setVorlagen(vData.map((v: any) => ({ ...v, uebungen: uMap[v.id] ?? [] })))
    setVorlagenLoaded(true)
  }

  function applyVorlage(vorlageId: string) {
    const v = vorlagen.find(x => x.id === vorlageId)
    if (!v) return
    setForm(f => ({ ...f, trainingstyp: v.trainingstyp ?? f.trainingstyp }))
    setUebungen(v.uebungen.map((u: any) => ({
      uebungsname: u.uebungsname,
      saetze: String(u.saetze ?? ''),
      wdh: String(u.wdh ?? ''),
      gewicht_kg: String(u.gewicht_kg ?? ''),
      notizen: '',
    })))
    setSelectedVorlage(vorlageId)
  }

  async function startWorkout(vorlage: any) {
    if (!user) return
    const names: string[] = (vorlage.uebungen ?? []).map((u: any) => u.uebungsname).filter(Boolean)
    const prevMap: Record<string, { wdh: number | null; kg: number | null }[]> = {}
    const noteMap: Record<string, string> = {}

    if (names.length) {
      const { data: lastEx } = await supabase
        .from('uebungen')
        .select('uebungsname, saetze_log, saetze, wdh, gewicht_kg, notizen')
        .eq('user_id', user.id)
        .in('uebungsname', names)
        .order('created_at', { ascending: false })

      for (const u of (lastEx ?? [])) {
        if (u.notizen && !noteMap[u.uebungsname]) noteMap[u.uebungsname] = u.notizen
        if (prevMap[u.uebungsname]) continue
        if (Array.isArray(u.saetze_log) && u.saetze_log.length > 0) {
          prevMap[u.uebungsname] = u.saetze_log
        } else if (u.saetze) {
          prevMap[u.uebungsname] = Array.from({ length: u.saetze }, () => ({ wdh: u.wdh ?? null, kg: u.gewicht_kg ?? null }))
        }
      }
    }

    const exercises: ActiveExercise[] = (vorlage.uebungen ?? []).map((u: any) => {
      const n = parseInt(u.saetze) || 3
      const prev = prevMap[u.uebungsname] ?? []
      return {
        name: u.uebungsname,
        sets: Array.from({ length: n }, (_, i) => ({
          wdh: String(prev[i]?.wdh ?? u.wdh ?? ''),
          kg: String(prev[i]?.kg ?? u.gewicht_kg ?? ''),
          done: false,
        })),
        prevSets: prev,
        note: '',
        prevNote: noteMap[u.uebungsname] ?? '',
      }
    })

    setSavedWorkout(null)
    setActiveWorkout({ vorlage, startTime: Date.now(), exercises })
  }

  // Vom Kalender geöffnet (?start=<Vorlage>): Workout sofort starten
  useEffect(() => {
    if (!startVorlageId || !vorlagenLoaded || startedFor.current === startVorlageId) return
    startedFor.current = startVorlageId
    const v = vorlagen.find(x => x.id === startVorlageId)
    if (v) void startWorkout(v)
    onStartHandled?.()
  }, [startVorlageId, vorlagenLoaded, vorlagen])

  async function finishWorkout(exercises: ActiveExercise[], elapsedMin: number) {
    if (!user || !activeWorkout) return
    const count = entries.length
    const einheit_id = `E-${String(count + 1).padStart(3, '0')}`
    const { data: training } = await supabase.from('training').insert({
      user_id: user.id, einheit_id,
      datum: todayISO(),
      trainingstyp: activeWorkout.vorlage.trainingstyp ?? 'Kraft',
      dauer_min: elapsedMin > 0 ? elapsedMin : null,
    }).select().single()

    if (training) {
      const uebungenRows = exercises
        .filter(ex => ex.sets.some(s => s.done || s.wdh || s.kg) || ex.note?.trim())
        .map(ex => {
          const tracked = ex.sets.filter(s => s.done || s.wdh || s.kg)
          return {
            user_id: user.id,
            training_id: training.id,
            uebungsname: ex.name,
            saetze: tracked.length,
            wdh: tracked[0] ? (parseInt(tracked[0].wdh) || null) : null,
            gewicht_kg: tracked[0] ? (parseFloat(tracked[0].kg) || null) : null,
            saetze_log: tracked.map(s => ({ wdh: parseInt(s.wdh) || null, kg: parseFloat(s.kg) || null })),
            notizen: ex.note?.trim() || null,
          }
        })
      if (uebungenRows.length) await supabase.from('uebungen').insert(uebungenRows)
    }

    localStorage.removeItem(WORKOUT_KEY)
    setSavedWorkout(null)
    setActiveWorkout(null)
    await load()
  }

  useEffect(() => {
    load()
    loadVorlagen()
    const raw = localStorage.getItem(WORKOUT_KEY)
    if (raw) {
      try { setSavedWorkout(JSON.parse(raw)) } catch {}
    }
  }, [user])

  async function analyzePhoto(file: File) {
    setAnalyzing(true)
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1]
      setPhotoPreview(reader.result as string)
      try {
        const { data } = await supabase.functions.invoke('analyze-screenshot', {
          body: { imageBase64: base64, mimeType: file.type, context: 'training' },
        })
        if (data?.result) {
          const r = data.result
          setForm(f => ({
            ...f,
            dauer_h: r.dauer_min ? String(Math.floor(r.dauer_min / 60)) : f.dauer_h,
            dauer_m: r.dauer_min ? String(r.dauer_min % 60) : f.dauer_m,
            avg_puls: r.avg_puls ? String(r.avg_puls) : f.avg_puls,
            kalorien_verbrannt: r.kalorien_verbrannt ? String(r.kalorien_verbrannt) : f.kalorien_verbrannt,
            trainingstyp: r.trainingstyp && TRAINING_TYPES.includes(r.trainingstyp) ? r.trainingstyp : f.trainingstyp,
            notizen: r.notizen || f.notizen,
          }))
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : ''
        alert(msg.includes('429') ? 'Zu viele Anfragen – bitte kurz warten und erneut versuchen.' : 'Foto-Analyse fehlgeschlagen. Bitte erneut versuchen.')
      }
      setAnalyzing(false)
    }
    reader.readAsDataURL(file)
  }

  function toggleExpand(id: string) {
    setEntries(e => e.map(t => t.id === id ? { ...t, expanded: !t.expanded } : t))
  }

  function openEdit(t: TrainingWithExercises) {
    setEditingId(t.id)
    setForm({
      datum: t.datum,
      trainingstyp: t.trainingstyp ?? 'Kraft',
      dauer_h: t.dauer_min ? String(Math.floor(t.dauer_min / 60)) : '0',
      dauer_m: t.dauer_min ? String(t.dauer_min % 60) : '0',
      avg_puls: t.avg_puls ? String(t.avg_puls) : '',
      kalorien_verbrannt: t.kalorien_verbrannt ? String(t.kalorien_verbrannt) : '',
      notizen: t.notizen ?? '',
    })
    setUebungen(t.uebungen?.map(u => ({
      uebungsname: u.uebungsname,
      saetze: u.saetze ? String(u.saetze) : '',
      wdh: u.wdh ? String(u.wdh) : '',
      gewicht_kg: u.gewicht_kg ? String(u.gewicht_kg) : '',
      notizen: u.notizen ?? '',
    })) ?? [])
    setPhotoPreview(null)
    setOpen(true)
  }

  function closeModal() {
    setOpen(false)
    setEditingId(null)
    setPhotoPreview(null)
    setForm({ datum: todayISO(), trainingstyp: 'Kraft', dauer_h: '0', dauer_m: '0', avg_puls: '', kalorien_verbrannt: '', notizen: '' })
    setUebungen([])
  }

  async function handleSave() {
    if (!user) return
    setSaving(true)
    const totalMin = (parseInt(form.dauer_h || '0') * 60) + parseInt(form.dauer_m || '0')

    const payload = {
      datum: form.datum,
      trainingstyp: form.trainingstyp || null,
      dauer_min: totalMin > 0 ? totalMin : null,
      avg_puls: form.avg_puls ? parseInt(form.avg_puls) : null,
      kalorien_verbrannt: form.kalorien_verbrannt ? parseInt(form.kalorien_verbrannt) : null,
      notizen: form.notizen || null,
    }

    let trainingId: string

    if (editingId) {
      await supabase.from('training').update(payload).eq('id', editingId)
      trainingId = editingId
      // Replace exercises: delete old, insert new
      await supabase.from('uebungen').delete().eq('training_id', editingId)
    } else {
      const count = entries.length
      const einheit_id = `E-${String(count + 1).padStart(3, '0')}`
      const { data: training } = await supabase.from('training').insert({
        user_id: user.id, einheit_id, ...payload,
      }).select().single()
      trainingId = training!.id
    }

    if (uebungen.filter(u => u.uebungsname).length > 0) {
      await supabase.from('uebungen').insert(
        uebungen.filter(u => u.uebungsname).map(u => ({
          user_id: user.id,
          training_id: trainingId,
          uebungsname: u.uebungsname,
          saetze: u.saetze ? parseInt(u.saetze) : null,
          wdh: u.wdh ? parseInt(u.wdh) : null,
          gewicht_kg: u.gewicht_kg ? parseFloat(u.gewicht_kg) : null,
          notizen: u.notizen || null,
        }))
      )
    }

    await load()
    closeModal()
    setSaving(false)
  }

  async function handleDelete(id: string) {
    await supabase.from('uebungen').delete().eq('training_id', id)
    await supabase.from('training').delete().eq('id', id)
    setEntries(e => e.filter(x => x.id !== id))
  }

  const chartData = [...entries].reverse().slice(-14).map(t => ({
    datum: formatDate(t.datum, 'dd.MM'),
    dauer: t.dauer_min ?? 0,
  }))

  const totalDauer = entries.reduce((a, t) => a + (t.dauer_min ?? 0), 0)
  const avgPuls = entries.filter(t => t.avg_puls).length
    ? Math.round(entries.reduce((a, t) => a + (t.avg_puls ?? 0), 0) / entries.filter(t => t.avg_puls).length)
    : null

  if (activeWorkout) {
    return (
      <ActiveWorkoutView
        workout={activeWorkout}
        onFinish={finishWorkout}
        onAbort={() => setActiveWorkout(null)}
      />
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        {!embedded && (
          <div>
            <h1 className="section-title text-2xl">Training</h1>
            <p className="text-text-secondary text-sm mt-0.5">Einheiten & Übungslog</p>
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          {!embedded && (
            <button onClick={() => (onOpenVorlagen ? onOpenVorlagen() : navigate('/training?tab=vorlagen'))} className="btn-secondary flex items-center gap-2">
              <BookOpen size={16} /> Vorlagen
            </button>
          )}
          <button onClick={() => { setEditingId(null); setForm({ datum: todayISO(), trainingstyp: 'Kraft', dauer_h: '0', dauer_m: '0', avg_puls: '', kalorien_verbrannt: '', notizen: '' }); setUebungen([]); setPhotoPreview(null); setOpen(true) }} className="btn-secondary flex items-center gap-2">
            <Plus size={18} /> Manuell eintragen
          </button>
        </div>
      </div>

      {/* Resume banner for interrupted workout */}
      {savedWorkout && (
        <div className="card border-brand/40 bg-brand/5 flex items-center justify-between gap-4 p-4">
          <div className="min-w-0">
            <div className="font-semibold text-text-primary">Workout pausiert: {savedWorkout.vorlage?.name}</div>
            <div className="text-xs text-text-muted mt-0.5">{savedWorkout.exercises.length} Übungen · Fortsetzen oder verwerfen</div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => { setSavedWorkout(null); localStorage.removeItem(WORKOUT_KEY) }}
              className="btn-secondary text-sm px-3 py-1.5"
            >
              Verwerfen
            </button>
            <button
              onClick={() => { setActiveWorkout(savedWorkout); setSavedWorkout(null) }}
              className="btn-primary text-sm px-3 py-1.5 flex items-center gap-1.5"
            >
              <Play size={14} /> Fortsetzen
            </button>
          </div>
        </div>
      )}

      {/* Quick-start: workout templates */}
      {vorlagen.length > 0 && (
        <div>
          <h2 className="section-title mb-3 text-base">Workout starten</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {vorlagen.map((v: any) => (
              <div key={v.id} className="card flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-text-primary truncate">{v.name}</div>
                  <div className="text-xs text-text-muted mt-0.5">
                    {v.trainingstyp ?? 'Kraft'} · {(v.uebungen ?? []).length} Übungen
                  </div>
                </div>
                <button
                  onClick={() => startWorkout(v)}
                  className="btn-primary flex items-center gap-1.5 text-sm px-3 py-1.5 shrink-0"
                >
                  <Play size={14} /> Starten
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card text-center">
          <div className="text-2xl font-bold text-text-primary">{entries.length}</div>
          <div className="text-xs text-text-muted mt-1">Einheiten gesamt</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-text-primary">{totalDauer > 0 ? `${Math.round(totalDauer / 60)}h` : '--'}</div>
          <div className="text-xs text-text-muted mt-1">Trainingszeit gesamt</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-text-primary">{avgPuls ? `${avgPuls} bpm` : '--'}</div>
          <div className="text-xs text-text-muted mt-1">Ø Herzfrequenz</div>
        </div>
      </div>

      {/* Chart */}
      {entries.length > 1 && (
        <div className="card">
          <h2 className="section-title mb-6">Trainingsdauer (letzte 14 Einheiten)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
              <XAxis dataKey="datum" tick={{ fill: colors.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: colors.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar isAnimationActive={false} dataKey="dauer" fill={colors.brand} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Training List */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : entries.length === 0 ? (
          <div className="card">
            <EmptyState icon={Dumbbell} title="Noch keine Trainingseinheiten" description="Trage deine erste Trainingseinheit ein." />
          </div>
        ) : entries.map(t => (
          <div key={t.id} className="card">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
                <Dumbbell size={18} className="text-brand" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-text-primary">{t.trainingstyp ?? 'Training'}</span>
                  <span className="text-xs text-text-muted">{formatDate(t.datum)}</span>
                </div>
                <div className="flex items-center gap-4 mt-1 text-xs text-text-secondary">
                  {t.dauer_min && <span className="flex items-center gap-1"><Timer size={12} /> {t.dauer_min >= 60 ? `${Math.floor(t.dauer_min / 60)}h ${t.dauer_min % 60 > 0 ? `${t.dauer_min % 60}min` : ''}`.trim() : `${t.dauer_min} min`}</span>}
                  {t.avg_puls && <span className="flex items-center gap-1"><Activity size={12} /> {t.avg_puls} bpm</span>}
                  {t.kalorien_verbrannt && <span className="flex items-center gap-1"><Flame size={12} /> {t.kalorien_verbrannt} kcal</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(t.uebungen?.length ?? 0) > 0 && (
                  <button onClick={() => toggleExpand(t.id)} className="p-1.5 rounded-lg hover:bg-bg-elevated text-text-muted hover:text-text-primary transition-colors">
                    {t.expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                )}
                <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg hover:bg-brand/10 hover:text-brand text-text-muted transition-colors">
                  <Pencil size={16} />
                </button>
                <button onClick={() => handleDelete(t.id)} className="p-1.5 rounded-lg hover:bg-danger/10 hover:text-danger text-text-muted transition-colors">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            {t.expanded && t.uebungen && t.uebungen.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border">
                <div className="text-xs font-medium text-text-muted mb-3">Übungen</div>
                <div className="space-y-2">
                  {t.uebungen.map(u => {
                    const satzLog = (u as any).saetze_log as { wdh: number | null; kg: number | null }[] | null
                    return (
                      <div key={u.id} className="p-2 rounded-lg bg-bg-elevated">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-text-primary text-sm">{u.uebungsname}</span>
                          {(!satzLog || satzLog.length === 0) && (
                            <span className="text-text-secondary text-xs">{u.saetze}×{u.wdh}{u.gewicht_kg ? ` @ ${u.gewicht_kg}kg` : ''}</span>
                          )}
                        </div>
                        {u.notizen && (
                          <p className="mt-1.5 text-xs text-text-secondary flex items-start gap-1.5">
                            <StickyNote size={12} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
                            <span>{u.notizen}</span>
                          </p>
                        )}
                        {satzLog && satzLog.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {satzLog.map((s, i) => (
                              <span key={i} className="text-[11px] bg-bg px-2 py-0.5 rounded text-text-secondary">
                                S{i + 1}: {s.wdh ?? '?'}×{s.kg ?? '?'}kg
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <Modal open={open} onClose={closeModal} title={editingId ? 'Trainingseinheit bearbeiten' : 'Trainingseinheit eintragen'} size="lg">
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Photo AI */}
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={e => { if (e.target.files?.[0]) analyzePhoto(e.target.files[0]) }} />
          <div
            onClick={() => fileRef.current?.click()}
            className={`relative flex items-center gap-3 p-3 rounded-xl border-2 border-dashed cursor-pointer transition-all
              ${photoPreview ? 'border-brand/50 bg-brand/5' : 'border-border hover:border-brand/40 hover:bg-brand/5'}`}
          >
            {photoPreview ? (
              <>
                <img src={photoPreview} alt="Workout" className="w-14 h-14 rounded-lg object-cover shrink-0" />
                <div className="flex-1 min-w-0">
                  {analyzing ? (
                    <div className="flex items-center gap-2 text-sm text-brand"><Spinner size={14} /><span>Analysiere Workout...</span></div>
                  ) : (
                    <div className="text-sm text-success font-medium flex items-center gap-1.5"><Sparkles size={14} />Daten automatisch ausgefüllt</div>
                  )}
                  <div className="text-xs text-text-muted mt-0.5">Anderes Bild wählen</div>
                </div>
                <button onClick={e => { e.stopPropagation(); setPhotoPreview(null) }}
                  className="p-1 rounded hover:bg-danger/10 hover:text-danger text-text-muted transition-colors shrink-0">
                  <X size={14} />
                </button>
              </>
            ) : (
              <>
                <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
                  <Camera size={18} className="text-brand" />
                </div>
                <div>
                  <div className="text-sm font-medium text-text-primary flex items-center gap-1.5">
                    <Sparkles size={13} className="text-accent" />
                    Apple Watch Screenshot analysieren
                  </div>
                  <div className="text-xs text-text-muted">Dauer, Kalorien & Herzfrequenz werden automatisch erkannt</div>
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Datum</label>
              <input type="date" className="input" value={form.datum} onChange={e => setForm(f => ({ ...f, datum: e.target.value }))} />
            </div>
            <div>
              <label className="label">Trainingstyp</label>
              <input
                className="input"
                list="training-types-list"
                value={form.trainingstyp}
                onChange={e => setForm(f => ({ ...f, trainingstyp: e.target.value }))}
                placeholder="z.B. Kraft, Cardio, eigener Typ…"
              />
              <datalist id="training-types-list">
                {TRAINING_TYPES.map(t => <option key={t} value={t} />)}
              </datalist>
            </div>
            <div>
              <label className="label">Dauer</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input type="number" min="0" max="23" className="input pr-8" placeholder="0" value={form.dauer_h} onChange={e => setForm(f => ({ ...f, dauer_h: e.target.value }))} />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-text-muted pointer-events-none">h</span>
                </div>
                <div className="relative flex-1">
                  <input type="number" min="0" max="59" className="input pr-10" placeholder="0" value={form.dauer_m} onChange={e => setForm(f => ({ ...f, dauer_m: e.target.value }))} />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-text-muted pointer-events-none">min</span>
                </div>
              </div>
            </div>
            <div>
              <label className="label">Ø Puls (bpm)</label>
              <input type="number" className="input" placeholder="140" value={form.avg_puls} onChange={e => setForm(f => ({ ...f, avg_puls: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="label">Kalorien verbrannt</label>
              <input type="number" className="input" placeholder="450" value={form.kalorien_verbrannt} onChange={e => setForm(f => ({ ...f, kalorien_verbrannt: e.target.value }))} />
              {!form.avg_puls && !form.kalorien_verbrannt && (
                <button type="button" onClick={() => {
                  const totalMin = (parseInt(form.dauer_h || '0') * 60) + parseInt(form.dauer_m || '0')
                  const kcalPerMin: Record<string, number> = {
                    'Kraft': 6, 'Cardio': 9, 'HIIT': 12, 'Laufen': 10,
                    'Radfahren': 7, 'Schwimmen': 8, 'Yoga': 3, 'Stretching': 2, 'Sonstiges': 6,
                  }
                  const pulsMap: Record<string, number> = {
                    'Kraft': 110, 'Cardio': 145, 'HIIT': 165, 'Laufen': 150,
                    'Radfahren': 135, 'Schwimmen': 130, 'Yoga': 85, 'Stretching': 75, 'Sonstiges': 120,
                  }
                  const rate = kcalPerMin[form.trainingstyp] ?? 6
                  const kcal = totalMin > 0 ? Math.round(totalMin * rate) : 0
                  const puls = pulsMap[form.trainingstyp] ?? 120
                  setForm(f => ({ ...f, kalorien_verbrannt: kcal > 0 ? String(kcal) : f.kalorien_verbrannt, avg_puls: String(puls) }))
                }}
                  className="mt-1.5 text-xs text-brand hover:text-brand/80 flex items-center gap-1 transition-colors">
                  <Sparkles size={11} /> Von KI schätzen lassen
                </button>
              )}
            </div>
            <div>
              <label className="label">Notizen</label>
              <input type="text" className="input" placeholder="Optionale Notizen" value={form.notizen} onChange={e => setForm(f => ({ ...f, notizen: e.target.value }))} />
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <div className="text-sm font-medium text-text-primary mb-3">Übungen (optional)</div>
            <UebungForm entries={uebungen} onChange={setUebungen} />
          </div>

          <div className="flex gap-3 pt-2 border-t border-border">
            <button onClick={() => setOpen(false)} className="btn-secondary flex-1">Abbrechen</button>
            <button onClick={handleSave} className="btn-primary flex-1 flex items-center justify-center gap-2" disabled={saving}>
              {saving && <Spinner size={16} />}
              Speichern
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
