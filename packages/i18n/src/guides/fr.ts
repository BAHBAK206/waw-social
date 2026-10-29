import type { GuideBook } from './types';

export const fr: GuideBook = {
  school: {
    title: 'Classe',
    summary:
      'Toutes vos classes au même endroit. L’enseignant crée une classe, les élèves la rejoignent avec un code, et tout ce qui concerne la matière s’y trouve : annonces, devoirs, documents, présences et notes.',
    steps: [
      'Enseignant : ouvrez Classe et choisissez « Nouvelle classe ». Donnez un nom et une matière ; un code d’accès est créé automatiquement.',
      'Partagez le code (ou le lien d’invitation) avec vos élèves. L’élève ouvre Classe, choisit « Rejoindre une classe » et saisit le code.',
      'Le Flux est le mur de la classe : publiez des annonces et des questions ; les élèves peuvent commenter.',
      'Travaux contient les devoirs et les quiz avec leur échéance. Les élèves rendent leur travail ici ; l’enseignant le note et laisse un commentaire.',
      'Documents contient les fichiers et les liens. L’IA de la classe les lit aussi pour répondre aux élèves.',
      'Présences permet de noter présent, en retard, absent ou excusé pour chaque séance.',
      'Indicateurs et « Qui a besoin d’aide » montrent les élèves en difficulté (travaux manqués, notes faibles, peu de temps d’étude) pour agir tôt.',
    ],
    tips: [
      'Configurez d’abord la « Notation de la matière » dans les paramètres de la classe, pour que chaque note compte dans le bon total.',
      'Vous pouvez importer vos classes Google Classroom depuis la page Classe.',
      'Les parents liés à un élève voient ses devoirs, présences et notes, mais ne publient pas dans la classe.',
      'Avec une grille, les élèves obtiennent un avis de l’IA sur leur brouillon et vous des niveaux suggérés ; « Vérifier le plagiat » compare les copies entre elles et avec vos documents.',
    ],
    roles: {
      student: 'Rejoignez avec le code, rendez vos travaux avant l’échéance et consultez Mes notes pour votre résultat par matière.',
      teacher: 'Seuls l’enseignant de la classe et les co-enseignants notent, font l’appel et modifient les paramètres.',
      parent: 'Les parents ne rejoignent pas les classes : ils suivent leur enfant depuis la page Famille.',
    },
  },
  grades: {
    title: 'Notation des matières et bulletin',
    summary:
      'Chaque classe peut être notée comme une vraie matière : un code, un total (sur 60, 80, 100…), une note de passage et des parties comme les devoirs, les contrôles mensuels et l’examen final. Le bulletin additionne le tout.',
    steps: [
      'Enseignant : ouvrez la classe, puis Paramètres → Notation de la matière.',
      'Saisissez le code de la matière (par exemple MATH-301), le trimestre, le total (par exemple 60) et la note de passage (par exemple 30).',
      'Répartissez le total en parties, par exemple devoirs 10 + contrôles 20 + examen final 30 = 60.',
      'Choisissez la source de chaque partie : les devoirs (leur moyenne), les présences (le taux de présence) ou des notes saisies par vous.',
      'En créant un devoir, choisissez sa partie. Un travail jamais rendu compte zéro après l’échéance.',
      'L’onglet Notes affiche les notes de chaque élève par partie et le total de la matière. Saisissez les parties manuelles et exportez un CSV.',
      'L’élève voit son résultat dans la classe et son bulletin complet dans Mes notes ; les parents liés voient le même bulletin.',
    ],
    tips: [
      'Désactivez « Compte dans le total général » pour les matières hors total, comme la religion ou les activités.',
      'Mentions : 85 % et plus Excellent, 75 % Très bien, 65 % Bien, au-dessus de la note de passage Passable, en dessous Échec.',
      'Les absences excusées ne pénalisent pas la note de présence ; un retard compte comme présent.',
    ],
    roles: {
      student: 'Vous ne voyez que vos notes. Si une note semble fausse, écrivez à votre enseignant depuis la classe.',
      teacher: 'Seuls vous et vos co-enseignants voyez le carnet de notes complet.',
      parent: 'Ouvrez Mes notes ou la page Famille pour lire le bulletin de chaque enfant lié.',
    },
  },
  family: {
    title: 'Compte parent',
    summary:
      'Un compte parent est lié à un ou plusieurs élèves. Le parent suit le temps d’étude, les devoirs, les présences, les quiz et le bulletin, choisit ce qu’un enfant de moins de 18 ans peut faire et peut écrire à ses enseignants. Il ne publie pas dans les classes et ne lit pas les messages privés.',
    steps: [
      'Créez un compte et choisissez le type « Parent » (il faut avoir 18 ans ou plus).',
      'Liez votre enfant de deux façons : l’élève vous invite depuis Paramètres → Famille (par e-mail), ou vous ouvrez Famille → « Lier un enfant » et saisissez son e-mail ou son nom d’utilisateur.',
      'L’autre personne accepte la demande. En attendant, elle apparaît « en attente » sur les deux comptes.',
      'Ouvrez Famille et choisissez un enfant pour voir son temps d’étude de la semaine, ses prochains devoirs, ses présences, ses quiz et son bulletin.',
      'Pour un enfant de moins de 18 ans, réglez les contrôles : qui peut lui écrire (classe et enseignants seulement, ou personnes connues), publications publiques, groupes et IA.',
      'Utilisez « Écrire à l’enseignant » à côté d’une classe pour le contacter directement.',
      'Pour recevoir les bilans sur votre téléphone : Réglages → Famille → WhatsApp et SMS. Saisissez votre numéro, puis le code à 6 chiffres reçu, et choisissez le bilan hebdomadaire et/ou les alertes immédiates (absence, note sous la moyenne).',
    ],
    tips: [
      'Les moins de 13 ans démarrent avec les réglages les plus sûrs (messages de la classe seulement, pas de publication publique) jusqu’à ce qu’un parent les change.',
      'Un élève lié ne peut pas changer lui-même son niveau scolaire ; il le demande au parent.',
      'Chacun peut supprimer le lien à tout moment depuis la page Famille.',
    ],
    roles: {
      student: 'Invitez votre parent depuis Paramètres → Famille. Vous voyez exactement les contrôles qui s’appliquent à vous.',
      teacher: 'Les parents de vos élèves peuvent vous écrire. Vous ne voyez pas leurs autres enfants.',
      parent: 'Vous voyez les progrès, pas les discussions privées ni les brouillons, et vous ne pouvez pas rendre de devoir à la place de votre enfant.',
    },
  },
  safety: {
    title: 'Protection selon l’âge et niveaux scolaires',
    summary:
      'Chaque élève choisit son niveau, du CP (primaire 1) à l’université. Les moins de 18 ans sont protégés automatiquement, et les plus jeunes (moins de 13 ans) ont les réglages les plus stricts.',
    steps: [
      'À l’inscription, choisissez votre niveau (primaire 1–6, collège 1–3, lycée 1–3, université). Vous pouvez aussi indiquer votre année de naissance.',
      'Qubedu retient le plus strict des deux : si l’année de naissance ou le niveau indique moins de 13 ans, les règles des moins de 13 ans s’appliquent.',
      'Moins de 13 ans : messages de la classe et des enseignants seulement, pas de publication publique, invisible des inconnus dans la recherche, et certaines fonctions attendent un parent.',
      'De 13 à 17 ans : messages des personnes connues (classe, enseignants, abonnements mutuels), publications publiques autorisées sauf si un parent les désactive.',
      'Un élève de moins de 18 ans ne peut pas passer en compte enseignant ou parent.',
      'Chacun peut signaler une publication, un commentaire, un message ou un profil. Les signalements impliquant un mineur passent en premier chez les modérateurs.',
    ],
    tips: [
      'Les enseignants et les parents doivent être majeurs ; leur âge vient seulement de l’année de naissance.',
      'Bloquer une personne vous rend invisibles l’un pour l’autre et arrête ses messages immédiatement.',
    ],
    roles: {
      student: 'Paramètres → Confidentialité indique ce qui est permis pour votre compte et pourquoi.',
      teacher: 'Vous pouvez toujours écrire aux élèves de vos classes.',
      parent: 'Vous pouvez assouplir ou renforcer chaque contrôle depuis la page Famille.',
    },
  },
  verification: {
    title: 'Vérification des enseignants et qui peut faire quoi',
    summary:
      'Tout le monde peut créer un compte enseignant et gérer des classes privées. Les pouvoirs publics — lister ou vendre des cours, ouvrir des cours en direct publics, publier dans la bibliothèque sans relecture et le badge « enseignant vérifié » — demandent une vérification par les administrateurs.',
    steps: [
      'Ouvrez Paramètres → Compte → Vérification enseignant.',
      'Indiquez votre établissement, la matière enseignée et un lien de preuve (page de l’école, diplôme…). Ajoutez une note si utile.',
      'Envoyez la demande. Les administrateurs l’approuvent ou expliquent le refus.',
      'Une fois approuvé, une coche apparaît à côté de votre nom, vos réponses sont marquées vérifiées, et vous pouvez lister et vendre des cours et ouvrir des cours en direct publics.',
      'En cas de refus, lisez la raison, complétez ce qui manque et renvoyez une demande.',
    ],
    tips: [
      'Élèves : apprendre, rejoindre des classes, poser et répondre aux questions, passer des quiz. Enseignants : tout cela, plus créer des classes, des quiz, des notes et l’appel.',
      'Parents : suivre les enfants liés et écrire à leurs enseignants ; ils ne rejoignent pas de classe et ne publient pas pour un enfant.',
      'Le tableau complet est dans le centre d’aide, rubrique « Qui peut faire quoi ».',
    ],
    roles: {
      student: 'Une coche à côté du nom d’un enseignant signifie que les administrateurs l’ont vérifié.',
      teacher: 'Sans vérification, vous gardez tous les outils de classe pour vos propres classes.',
      parent: 'Les enseignants qui vous contactent au sujet de votre enfant sont ceux de ses classes.',
    },
  },
  classes: {
    title: 'Cours en direct',
    summary: 'Enseignez ou suivez un cours en direct avec caméra, micro, partage d’écran, tableau blanc partagé, chat, main levée et enregistrement.',
    steps: [
      'Enseignant : depuis une classe, choisissez « Nouvelle salle en direct », ou ouvrez Cours en direct. Choisissez qui peut entrer : la classe seulement ou tout le monde (les salles ouvertes demandent un enseignant vérifié).',
      'Choisissez ce que les élèves peuvent utiliser : caméra, micro, partage d’écran et chat.',
      'Démarrez la salle à l’heure du cours. Les élèves de la classe reçoivent une notification et entrent en un clic.',
      'Les élèves entrent micro coupé et caméra éteinte. Levez la main pour demander la parole ; l’enseignant voit le nombre de mains levées.',
      'Utilisez le tableau blanc pour expliquer, et Enregistrer pour garder le cours pour les absents.',
      'Pendant le cours : « Questions et sondages » pour une question rapide (indiquez la bonne réponse pour en faire un quiz), « Travail en groupes » pour répartir les élèves, « Présence » pour voir qui est là. À la fin, la présence est notée automatiquement.',
    ],
    tips: [
      'Si le son ou l’image ne démarre pas, autorisez la caméra et le micro pour le site dans votre navigateur.',
      'Avec une connexion lente, coupez votre caméra : vous continuez à voir et entendre l’enseignant.',
    ],
    roles: {
      student: 'Arrivez à l’heure : l’enseignant peut faire l’appel pendant le cours.',
      teacher: 'Vous décidez de ce que les élèves peuvent utiliser et pouvez fermer la salle pour tous.',
      parent: 'Les parents ne participent pas aux cours en direct.',
    },
  },
  academic: {
    title: 'Mes études',
    summary:
      'Votre espace d’étude personnel : planning hebdomadaire, sessions, comptes à rebours des examens, cartes mémoire avec répétition espacée, minuteur de concentration et maîtrise par matière. Tout compte pour votre série et vos XP.',
    steps: [
      'Ajoutez vos examens avec leur date : Qubedu affiche les comptes à rebours et peut les exporter vers votre agenda.',
      'Construisez un planning hebdomadaire : matières et horaires. Le plan du jour s’affiche sur votre accueil.',
      'Lancez une session de concentration (Pomodoro) pour étudier. Les minutes comptent pour l’objectif quotidien et la série, tout comme les leçons et les quiz.',
      'Créez des paquets de cartes mémoire et révisez chaque jour celles qui sont dues : les cartes ratées reviennent plus vite.',
      'Les mots mal prononcés dans le Labo de prononciation peuvent devenir des cartes automatiquement.',
      'La maîtrise montre votre niveau par matière d’après les quiz et les révisions, pour savoir quoi réviser ensuite.',
    ],
    tips: [
      'Dix minutes de cartes chaque jour valent mieux que deux heures une fois par semaine.',
      'Fixez un objectif quotidien réaliste ; vous pouvez le changer à tout moment.',
    ],
    roles: {
      student: 'Votre parent voit votre temps d’étude, pas vos notes personnelles ni vos cartes.',
      teacher: 'Vous pouvez utiliser les mêmes outils pour votre propre apprentissage.',
      parent: 'Encouragez la série quotidienne : elle crée l’habitude.',
    },
  },
  assistant: {
    title: 'Qubedu AI',
    summary:
      'Deux aides : l’assistant Qubedu répond aux questions sur l’utilisation du site et sur vos matières, et le Tuteur résout les maths étape par étape et répond à partir des documents de vos classes, avec les sources.',
    steps: [
      'Ouvrez Qubedu AI et posez votre question dans votre langue.',
      'Pour les questions sur le site (« comment rejoindre une classe ? »), l’assistant répond avec les guides d’aide et un lien vers la bonne page.',
      'Pour les questions de cours, il cherche dans les documents de vos classes et affiche la source (fichier et page) sous la réponse.',
      'Maths : écrivez le problème (par exemple 2x + 3 = 11) pour obtenir la réponse avec des étapes numérotées.',
      'Notez les réponses (pouce levé ou baissé) : enseignants et administrateurs s’en servent pour améliorer la base de connaissances.',
    ],
    tips: [
      'Les enseignants nourrissent l’IA en ajoutant des documents à la classe ; les administrateurs ajoutent questions et réponses fréquentes dans la console de modération.',
      'Le nombre de questions par jour est limité pour chaque compte.',
      'Pour les moins de 18 ans, un parent peut désactiver l’IA.',
      'Cochez « Guide-moi (indices, pas de réponses) » pour apprendre pas à pas. Pendant un examen, l’IA se met en pause jusqu’à la remise.',
    ],
    roles: {
      student: 'L’IA ne lit que les documents de vos propres classes.',
      teacher: 'Les élèves ne voient que les documents que vous leur avez rendus visibles.',
      parent: 'Vous pouvez activer ou désactiver l’IA pour votre enfant depuis la page Famille.',
    },
  },
  quiz: {
    title: 'Quiz et examens',
    summary: 'Quiz d’entraînement, examens chronométrés et entraînement adaptatif, corrigés sur le serveur avec résultat immédiat et explications.',
    steps: [
      'Ouvrez Quiz et choisissez-en un, ou « Entraînement adaptatif » pour des questions à votre niveau.',
      'Répondez ; les examens chronométrés affichent un compte à rebours et sont rendus automatiquement à la fin.',
      'Consultez votre score, les bonnes réponses et les explications.',
      'Enseignant : choisissez « Nouveau quiz », ajoutez des questions (une réponse, plusieurs réponses, vrai/faux ou réponse courte), fixez la durée et une heure de début facultative, et liez-le à une classe.',
      'Les résultats peuvent compter dans une partie de la notation de la classe.',
      'Ouvrez les statistiques d’un quiz pour voir les questions les plus difficiles.',
    ],
    tips: [
      'Votre meilleur score s’affiche sur chaque quiz.',
      'La correction se fait sur le serveur : les réponses ne sont pas visibles avant l’envoi.',
      'Formules : écrivez $x^2$ ou $\\frac{1}{2}$ entre dollars, ou touchez les boutons de symboles (fraction, puissance, racine). Elles marchent aussi dans les publications et les réponses.',
    ],
    roles: {
      student: 'Refaites les quiz d’entraînement autant que vous voulez ; votre meilleur score est gardé.',
      teacher: 'Tout le monde peut créer des quiz d’entraînement ; ceux d’une classe ne sont visibles que par elle.',
      parent: 'Vous voyez les résultats de votre enfant sur la page Famille.',
    },
  },
  schools: {
    title: 'Écoles : personnes, classes et bulletins',
    summary:
      'Un administrateur ajoute toute l’école d’un coup depuis un tableur, crée les matières de chaque classe avec leurs enseignants et imprime les bulletins officiels.',
    steps: [
      'Un enseignant vérifié ouvre Écoles → Nouvelle école et saisit le nom, le programme et le directeur.',
      'Personnes → Ajouter depuis un tableur : enregistrez la liste en CSV (name, role, grade, class, number, email, parent email), choisissez le fichier et vérifiez l’aperçu.',
      'Les nouveaux comptes reçoivent un premier mot de passe affiché une seule fois : téléchargez ou imprimez la liste.',
      'Les personnes qui ont déjà un compte sont invitées et ne rejoignent qu’en acceptant.',
      'Classes → Nouvelle matière de classe : classe, matière, code, enseignant et barème. Tous les élèves de la classe y sont ajoutés.',
      'Bulletins → choisissez une classe → Imprimer / PDF : une page officielle par élève.',
    ],
    tips: [
      'Un administrateur peut donner un nouveau mot de passe à un élève dont le compte a été créé par l’école.',
      'Les parents créés avec leur enfant sont liés automatiquement ; un parent déjà inscrit confirme d’abord.',
    ],
    roles: {
      student: 'Ouvrez Écoles pour rejoindre votre école et voir votre bulletin.',
      teacher: 'Les classes de l’école apparaissent dans Classe ; vos notes vont sur les bulletins.',
      parent: 'Ouvrez Écoles pour voir le bulletin de votre enfant.',
    },
  },
  curriculum: {
    title: 'Programme et plan personnel',
    summary:
      'Le programme officiel de votre année, matière par matière : unités, leçons et objectifs à maîtriser. Qubedu mesure votre maîtrise de chaque objectif à partir de vos quiz et construit un plan personnel.',
    steps: [
      'Ouvrez Programme, choisissez le programme (par exemple Égypte) et votre année, puis une matière.',
      'Passez le test de positionnement : deux questions par objectif, pour savoir ce que vous maîtrisez déjà.',
      'Votre plan montre les prochains objectifs à travailler, les plus faibles d’abord, avec les leçons et quiz liés.',
      'Appuyez sur S’entraîner sur un objectif, une leçon ou une unité pour dix questions dessus.',
      'Chaque quiz met à jour votre maîtrise : un objectif passe au vert quand il est maîtrisé (80 % ou plus avec assez de questions).',
    ],
    tips: [
      'Les enseignants associent leurs questions aux objectifs : plus il y a de classes et de banques, plus il y a d’entraînement.',
      'Les administrateurs ajoutent ou importent le programme officiel ; les enseignants y rattachent leçons et quiz.',
    ],
    roles: {
      student: 'Commencez par le test de positionnement, puis suivez « À étudier ensuite » un peu chaque jour.',
      teacher: 'Associez chaque question à un objectif et rattachez vos leçons et quiz au programme : vos élèves les trouveront depuis leur plan.',
      parent: 'Demandez à votre enfant de vous montrer son plan : il indique les objectifs encore à travailler.',
    },
  },
  banks: {
    title: 'Banques de questions et examens équitables',
    summary:
      'Rangez vos questions dans des banques, par objectif, difficulté et niveau de réflexion. Construisez des examens à partir de règles pour que chaque élève ait des questions différentes, puis lisez l’analyse de chaque question.',
    steps: [
      'Quiz → Banques de questions → Nouvelle banque. Ajoutez des questions avec un objectif, une difficulté et un niveau de réflexion (se souvenir, comprendre, appliquer…).',
      'Créez un examen et activez « Construire à partir des banques ». Choisissez les banques et ajoutez des règles, par exemple 5 questions faciles sur l’objectif A et 3 difficiles de l’unité 2.',
      'Activez « Mélanger les réponses » pour que les voisins n’aient pas les mêmes lettres.',
      'Activez le mode examen : l’élève passe en plein écran et vous voyez combien de fois il a quitté la page.',
      'Après l’examen, ouvrez les statistiques : chaque question indique le taux de réussite et si elle sépare bons et faibles élèves ; corrigez celles marquées « À revoir ».',
    ],
    tips: [
      'Un élève retrouve toujours les mêmes questions s’il rouvre l’examen, et ne le passe qu’une fois.',
      'Les questions d’une banque utilisée par un examen ne servent jamais à l’entraînement : elles ne fuitent pas avant l’examen.',
      'Vous ne pouvez construire un examen qu’à partir de vos propres banques.',
    ],
    roles: {
      student: 'En mode examen, restez sur la page jusqu’à l’envoi : les sorties sont enregistrées.',
      teacher: 'Réutilisez les mêmes banques chaque trimestre : les statistiques s’accumulent.',
      parent: 'Les résultats apparaissent au bulletin quand l’examen compte dans la notation de la matière.',
    },
  },
  catalog: {
    title: 'Catalogue, cours payants et certificats',
    summary:
      'Un enseignant vérifié peut publier une classe dans le catalogue public, gratuitement ou à un prix. Les élèves s’inscrivent, étudient et peuvent obtenir un certificat vérifiable par lien.',
    steps: [
      'Enseignant : faites-vous d’abord vérifier (Paramètres → Compte → Vérification enseignant).',
      'Ouvrez la classe → Paramètres et activez « Afficher dans le catalogue public ». Fixez un prix (0 = gratuit) et une devise.',
      'Créez des bons pour offrir des places, par exemple à une école.',
      'Pour être payé directement, ajoutez votre adresse InstaPay, numéro de portefeuille ou compte bancaire dans les mêmes réglages. L’élève envoie le reçu ; vous l’acceptez dans « Demandes de paiement » et il rejoint le cours.',
      'Les élèves ouvrent le catalogue, lisent la description et s’inscrivent (ou paient, ou utilisent un bon).',
      'Quand un élève termine le cours, délivrez un certificat depuis les paramètres de la classe. Il a un lien de vérification public.',
    ],
    tips: [
      'Les paiements par carte passent par Stripe ou Paymob (Égypte : Meeza, Visa, Mastercard et portefeuilles mobiles) ; Qubedu ne stocke jamais les cartes.',
    ],
    roles: {
      student: 'Vos certificats sont dans Moi → Certificats.',
      teacher: 'Seuls les enseignants vérifiés peuvent lister ou vendre des cours.',
      parent: 'Vous pouvez parcourir le catalogue pour trouver un cours pour votre enfant.',
    },
  },
  tools: {
    title: 'Outils d’étude',
    summary:
      'Des outils rapides accessibles partout : calculateur de notes, emploi du temps, minuteur de concentration, cartes mémoire et organiseur. Ils sont reliés entre eux et à vos classes.',
    steps: [
      'Ouvrez Tous les outils (icône grille) pour tout voir au même endroit.',
      'Calculateur de notes : saisissez la note et le total de chaque partie pour voir le pourcentage, la mention et ce qu’il vous faut à l’examen final pour réussir ou atteindre un objectif.',
      'Emploi du temps : ajoutez vos cours de la semaine avec horaires et salles. Les cours du jour s’affichent sur l’accueil.',
      'Minuteur : étudiez par blocs de 25 minutes ; les minutes comptent pour votre série.',
      'Organiseur : tâches avec priorités et notes colorées, liées aux échéances.',
    ],
    tips: ['Les outils fonctionnent aussi sur téléphone, dans Moi → Outils.'],
    roles: {
      student: 'Le calculateur peut partir de vos vraies notes dans une classe.',
      teacher: 'Partagez l’emploi du temps avec la classe pour signaler les changements de salle.',
      parent: 'Utilisez l’emploi du temps pour connaître la journée de votre enfant.',
    },
  },
  home: {
    title: 'Accueil',
    summary: 'Votre tableau de bord : objectif du jour, série, plan et cours du jour, devoirs à rendre bientôt et suggestions.',
    steps: [
      'Regardez le plan du jour et ce qui est à rendre.',
      'Touchez une carte pour aller directement à la classe, au quiz ou à la leçon.',
      'Gardez votre série en étudiant quelques minutes chaque jour.',
    ],
  },
  feed: {
    title: 'Questions et publications',
    summary: 'Posez des questions, partagez vos fiches et discutez des leçons. Les réponses des enseignants vérifiés sont signalées.',
    steps: [
      'Choisissez « Poser une question », la matière, et expliquez clairement ce que vous avez essayé.',
      'Marquez la réponse la plus utile comme meilleure réponse.',
      'Utilisez le filtre « Sans réponse » pour aider les autres et gagner des XP.',
    ],
  },
  watch: {
    title: 'Leçons vidéo',
    summary: 'Leçons avec chapitres, sous-titres, quiz de contrôle et vos notes horodatées.',
    steps: [
      'Choisissez une leçon ; utilisez les chapitres pour aller à une partie.',
      'Ajoutez une note à tout moment : l’instant est enregistré.',
      'Répondez au quiz de contrôle pour vérifier votre compréhension.',
    ],
  },
  shorts: {
    title: 'Leçons express',
    summary: 'Courtes leçons verticales, une idée chacune.',
    steps: ['Faites glisser pour la leçon suivante.', 'Enregistrez celles à revoir.', 'Ouvrez la leçon complète depuis le lien s’il existe.'],
  },
  lab: {
    title: 'Labo de prononciation',
    summary: 'Écoutez, répétez et obtenez une note de prononciation en arabe, anglais, français et espagnol.',
    steps: [
      'Choisissez une langue et une liste de mots ou de phrases.',
      'Écoutez, puis appuyez sur le micro et répétez.',
      'Les mots ratés peuvent être envoyés vers vos cartes mémoire.',
    ],
  },
  library: {
    title: 'Bibliothèque',
    summary: 'Livres, résumés et anciens examens partagés par les enseignants.',
    steps: [
      'Cherchez ou filtrez par catégorie.',
      'Téléchargez ou ouvrez une ressource.',
      'Les enseignants ajoutent des ressources ; celles des enseignants non vérifiés sont relues avant publication.',
    ],
  },
  events: {
    title: 'Ateliers',
    summary: 'Séances et événements programmés auxquels vous pouvez vous inscrire.',
    steps: ['Parcourez les ateliers à venir.', 'Inscrivez-vous pour recevoir un rappel.', 'Ajoutez-le à votre agenda.'],
  },
  chat: {
    title: 'Messages',
    summary: 'Messages privés et de groupe avec réponses, réactions et pièces jointes.',
    steps: [
      'Démarrez une discussion depuis un profil ou une classe.',
      'Appui long (ou survol) sur un message pour répondre ou réagir.',
      'Signalez ou bloquez depuis le menu de la discussion en cas de problème.',
    ],
  },
  groups: {
    title: 'Groupes d’étude',
    summary: 'Petits groupes pour étudier ensemble : discussions, chat, ressources partagées et révisions en direct.',
    steps: ['Créez un groupe ou rejoignez-en un.', 'Partagez fichiers et questions dans le groupe.', 'Lancez une révision en direct avec les membres.'],
  },
  communities: {
    title: 'Communautés',
    summary: 'Grands espaces par matière, avec canaux et annonces.',
    steps: ['Rejoignez la communauté de votre matière.', 'Lisez d’abord le canal des annonces.', 'Posez votre question dans le bon canal.'],
  },
  people: {
    title: 'Personnes',
    summary: 'Trouvez camarades et enseignants, et consultez le classement de la semaine.',
    steps: [
      'Cherchez par nom ou nom d’utilisateur.',
      'Abonnez-vous pour voir leurs publications.',
      'Consultez le classement pour voir qui a le plus étudié cette semaine.',
    ],
  },
  league: {
    title: 'Ligues',
    summary: 'Ligues hebdomadaires avec des élèves de votre niveau. Gagnez des XP pour monter ; la semaine repart le lundi.',
    steps: [
      'Étudiez, passez des quiz et aidez les autres pour gagner des XP.',
      'Le haut de la ligue monte, le bas descend.',
      'Votre ligue s’affiche sur votre profil.',
    ],
  },
  review: {
    title: 'Révision du jour',
    summary: 'Les cartes du jour et les questions de quiz ratées, programmées juste avant que vous ne les oubliiez.',
    steps: [
      'Ouvrez la révision du jour : elle liste ce qui est dû et le temps approximatif.',
      'Retournez chaque carte et notez votre connaissance ; répondez aux questions ratées puis vérifiez.',
      'Une question ratée revient demain ; à chaque réussite elle revient plus tard.',
      'L’onglet « Erreurs répétées » montre les questions ratées au moins deux fois, avec un bouton pour travailler le sujet.',
      'Le mode concentration (sur la même page) coupe les notifications push pendant que vous étudiez.',
    ],
  },
  'study-pack': {
    title: 'Fiche de révision',
    summary: 'Collez un cours ou choisissez une note pour obtenir termes clés, carte mentale, cartes et questions d’entraînement.',
    steps: [
      'Collez le texte (ou choisissez une note) puis « Créer la fiche ».',
      'Lisez les termes clés et la carte mentale, essayez les questions.',
      'Choisissez une matière et « Enregistrer cartes et termes » pour les ajouter à votre révision et à votre glossaire.',
    ],
    tips: ['Fonctionne mieux avec des textes qui contiennent des définitions (« La photosynthèse est le processus… »).'],
  },
  glossary: {
    title: 'Glossaire',
    summary: 'Les termes de chaque matière avec leur sens : les vôtres et ceux partagés par les enseignants.',
    steps: [
      'Ajoutez un terme avec sa matière et son sens.',
      'Recherchez ou filtrez par matière.',
      'Avec « Trouver des termes dans un texte », repérez les définitions d’un cours collé et ajoutez-les d’un coup.',
      'Un enseignant peut partager un terme avec toute sa classe.',
    ],
  },
  saved: {
    title: 'Enregistrés',
    summary: 'Leçons, questions et ressources enregistrées, classées en collections partageables.',
    steps: [
      'Touchez le signet pour enregistrer.',
      'Rangez les éléments en collections.',
      'Partagez une collection avec un lien.',
      'Touchez la cloche d’un élément enregistré pour être prévenu plus tard (dans une heure, demain matin, la semaine prochaine ou à l’heure de votre choix). Le rappel arrive en notification et ouvre l’élément.',
    ],
  },
  organizer: {
    title: 'Organiseur',
    summary: 'Tâches avec priorités et échéances, plus des notes colorées.',
    steps: ['Ajoutez une tâche avec priorité et échéance.', 'Cochez-la une fois terminée.', 'Utilisez les notes pour les idées rapides.'],
  },
  forms: {
    title: 'Formulaires',
    summary: 'Créez sondages, inscriptions et formulaires notés, et lisez les réponses.',
    steps: ['Créez un formulaire et ajoutez des questions.', 'Partagez le lien.', 'Lisez les réponses et exportez-les.'],
  },
  workspace: {
    title: 'Espace de travail',
    summary: 'Documents, tableurs, présentations et tableaux blancs dans le cloud.',
    steps: ['Créez ou importez un fichier.', 'Partagez-le pour travailler ensemble.', 'Exportez-le quand vous avez besoin d’une copie.'],
  },
  certificates: {
    title: 'Certificats',
    summary: 'Vos certificats, chacun avec un lien de vérification utilisable par tous.',
    steps: [
      'Ouvrez un certificat pour le voir ou le télécharger.',
      'Copiez le lien de vérification pour le partager.',
      'Les certificats viennent des cours terminés.',
    ],
  },
  studio: {
    title: 'Studio',
    summary: 'Vos leçons publiées et leurs statistiques.',
    steps: ['Publiez une vidéo de leçon.', 'Ajoutez chapitres et sous-titres.', 'Consultez les vues et la durée de visionnage.'],
  },
  settings: {
    title: 'Paramètres',
    summary: 'Apparence, langue, confidentialité, notifications, liens familiaux et compte.',
    steps: [
      'Changez la langue et le thème dans Apparence.',
      'Choisissez qui peut vous écrire dans Confidentialité.',
      'Gérez votre niveau, vos liens familiaux et votre compte dans Compte.',
    ],
  },
};
