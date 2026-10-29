import type { GuideBook } from './types';

export const es: GuideBook = {
  school: {
    title: 'Aula',
    summary:
      'Todas tus clases en un solo lugar. El docente crea una clase, los estudiantes se unen con un código y todo lo de la materia está dentro: avisos, tareas, materiales, asistencia y notas.',
    steps: [
      'Docente: abre Aula y elige «Nueva clase». Ponle nombre y materia; el código de acceso se crea solo.',
      'Comparte el código (o el enlace de invitación) con tus estudiantes. El estudiante abre Aula, elige «Unirse a una clase» y escribe el código.',
      'El Tablón es el muro de la clase: publica avisos y preguntas; los estudiantes pueden comentar.',
      'Trabajo de clase contiene tareas y cuestionarios con fecha de entrega. Los estudiantes entregan ahí; el docente califica y deja comentarios.',
      'Materiales contiene archivos y enlaces. La IA de la clase también los lee para responder a los estudiantes.',
      'Asistencia permite marcar presente, tarde, ausente o justificado en cada sesión.',
      'Indicadores y «Quién necesita ayuda» muestran a los estudiantes que se quedan atrás (tareas sin entregar, notas bajas, poco tiempo de estudio) para actuar a tiempo.',
    ],
    tips: [
      'Configura primero la «Calificación de la materia» en los ajustes de la clase, para que cada nota cuente en el total correcto.',
      'Puedes importar clases de Google Classroom desde la página Aula.',
      'Los padres vinculados a un estudiante ven sus tareas, asistencia y notas, pero no publican en la clase.',
      'Con una rúbrica, los estudiantes reciben comentarios de la IA sobre su borrador y tú niveles sugeridos; «Comprobar copias» compara las entregas entre sí y con tus materiales.',
    ],
    roles: {
      student: 'Únete con el código, entrega a tiempo y revisa Mis notas para ver tu resultado en cada materia.',
      teacher: 'Solo el docente de la clase (y los codocentes) califican, pasan lista y cambian ajustes.',
      parent: 'Los padres no se unen a clases: siguen a su hijo desde la página Familia.',
    },
  },
  grades: {
    title: 'Calificación por materia y boletín',
    summary:
      'Cada clase puede calificarse como una materia real: un código, un total (sobre 60, 80, 100…), una nota mínima para aprobar y partes como tareas, exámenes mensuales y examen final. El boletín lo suma todo.',
    steps: [
      'Docente: abre la clase y ve a Ajustes → Calificación de la materia.',
      'Escribe el código de la materia (por ejemplo MATH-301), el periodo, el total (por ejemplo 60) y la nota para aprobar (por ejemplo 30).',
      'Divide el total en partes, por ejemplo tareas 10 + exámenes mensuales 20 + examen final 30 = 60.',
      'Elige de dónde saca sus notas cada parte: las tareas (su promedio), la asistencia (el porcentaje de asistencia) o notas que escribes tú.',
      'Al crear una tarea, elige a qué parte pertenece. El trabajo nunca entregado cuenta como cero después de la fecha límite.',
      'La pestaña Notas muestra las notas de cada estudiante por parte y el total de la materia. Escribe las partes manuales y exporta un CSV.',
      'El estudiante ve su resultado en la clase y su boletín completo en Mis notas; los padres vinculados ven el mismo boletín.',
    ],
    tips: [
      'Desactiva «Cuenta en el total general» para materias fuera del total, como religión o actividades.',
      'Calificaciones: 85 % o más Sobresaliente, 75 % Notable, 65 % Bien, desde la nota mínima Aprobado, por debajo Suspenso.',
      'Las ausencias justificadas no restan en la nota de asistencia; llegar tarde cuenta como presente.',
    ],
    roles: {
      student: 'Solo ves tus notas. Si una nota parece incorrecta, escribe a tu docente desde la clase.',
      teacher: 'Solo tú y tus codocentes veis el libro de notas completo.',
      parent: 'Abre Mis notas o la página Familia para leer el boletín de cada hijo vinculado.',
    },
  },
  family: {
    title: 'Cuenta de padres',
    summary:
      'Una cuenta de padres se vincula a uno o varios estudiantes. Sigue el tiempo de estudio, las tareas, la asistencia, los cuestionarios y el boletín, decide qué puede hacer un hijo menor de 18 años y puede escribir a sus docentes. No publica en las clases ni lee mensajes privados.',
    steps: [
      'Crea una cuenta y elige el tipo «Padre o madre» (hay que tener 18 años o más).',
      'Vincula a tu hijo de dos formas: el estudiante te invita desde Ajustes → Familia (por correo), o abres Familia → «Vincular a un hijo» y escribes su correo o nombre de usuario.',
      'La otra persona acepta la solicitud. Mientras tanto aparece como pendiente en ambas cuentas.',
      'Abre Familia y elige a un hijo para ver su tiempo de estudio de la semana, las próximas tareas, la asistencia, los cuestionarios y el boletín.',
      'Para un hijo menor de 18, ajusta los controles: quién puede escribirle (solo compañeros y docentes, o personas conocidas), publicaciones públicas, grupos e IA.',
      'Usa «Escribir al docente» junto a una clase para contactarle directamente.',
      'Para recibir informes en tu teléfono: Ajustes → Familia → WhatsApp y SMS. Escribe tu número, introduce el código de 6 dígitos que recibas y elige el informe semanal y/o las alertas inmediatas (ausencia, nota por debajo de la mitad).',
    ],
    tips: [
      'Los menores de 13 empiezan con la configuración más segura (mensajes solo de la clase, sin publicaciones públicas) hasta que un padre la cambie.',
      'Un estudiante vinculado no puede cambiar su curso escolar por sí mismo; se lo pide al padre o madre.',
      'Cualquiera de los dos puede quitar el vínculo en cualquier momento desde la página Familia.',
    ],
    roles: {
      student: 'Invita a tu padre o madre desde Ajustes → Familia. Verás exactamente qué controles se te aplican.',
      teacher: 'Los padres de tus estudiantes pueden escribirte. No ves a sus otros hijos.',
      parent: 'Ves el progreso, no los chats privados ni los borradores, y no puedes entregar tareas por tu hijo.',
    },
  },
  safety: {
    title: 'Protección por edad y etapas escolares',
    summary:
      'Cada estudiante elige su curso, desde 1.º de primaria hasta la universidad. Los menores de 18 reciben protección extra automáticamente, y los más pequeños (menores de 13) la configuración más estricta.',
    steps: [
      'Al registrarte, elige tu curso (primaria 1–6, secundaria 1–3, bachillerato 1–3, universidad). También puedes añadir tu año de nacimiento.',
      'Qubedu aplica lo más estricto: si el año de nacimiento o el curso indica menos de 13 años, se aplican las reglas de menores de 13.',
      'Menores de 13: mensajes solo de compañeros y docentes, sin publicaciones públicas, ocultos para desconocidos en la búsqueda, y algunas funciones esperan a un padre.',
      'De 13 a 17: mensajes de personas conocidas (compañeros, docentes, seguimiento mutuo); publicaciones públicas permitidas salvo que un padre las desactive.',
      'Un estudiante menor de 18 no puede cambiar su cuenta a docente o padre.',
      'Cualquiera puede denunciar una publicación, comentario, mensaje o perfil. Las denuncias que implican a un menor se muestran primero a los moderadores.',
    ],
    tips: [
      'Docentes y padres deben ser adultos; su edad se toma solo del año de nacimiento.',
      'Bloquear a alguien os oculta mutuamente y detiene sus mensajes al instante.',
    ],
    roles: {
      student: 'Ajustes → Privacidad muestra qué está permitido para tu cuenta y por qué.',
      teacher: 'Siempre puedes escribir a los estudiantes de tus clases.',
      parent: 'Puedes relajar o endurecer cada control para tu hijo desde la página Familia.',
    },
  },
  verification: {
    title: 'Verificación de docentes y quién puede hacer qué',
    summary:
      'Cualquiera puede crear una cuenta de docente y dar clases privadas. Los poderes públicos —publicar o vender cursos, abrir clases en directo públicas, publicar en la biblioteca sin revisión y la insignia de «docente verificado»— requieren la verificación de los administradores.',
    steps: [
      'Abre Ajustes → Cuenta → Verificación de docente.',
      'Indica tu centro, la materia que enseñas y un enlace de prueba (por ejemplo tu perfil en la web del colegio o un título). Añade una nota si ayuda.',
      'Envía la solicitud. Los administradores la aprueban o explican por qué la rechazan.',
      'Tras la aprobación aparece una marca junto a tu nombre, tus respuestas se marcan como verificadas y puedes publicar y vender cursos y abrir clases en directo públicas.',
      'Si te rechazan, lee el motivo, completa lo que falte y envía una nueva solicitud.',
    ],
    tips: [
      'Estudiantes: aprender, unirse a clases, preguntar y responder, hacer cuestionarios. Docentes: todo eso, más crear clases, cuestionarios, notas y asistencia.',
      'Padres: seguir a los hijos vinculados y escribir a sus docentes; no se unen a clases ni publican por un hijo.',
      'La tabla completa está en el centro de ayuda, en «Quién puede hacer qué».',
    ],
    roles: {
      student: 'Una marca junto al nombre de un docente significa que los administradores lo verificaron.',
      teacher: 'Sin verificación conservas todas las herramientas de aula para tus propias clases.',
      parent: 'Los docentes que te contactan sobre tu hijo son los de sus clases.',
    },
  },
  classes: {
    title: 'Clases en directo',
    summary: 'Enseña o asiste a una clase en directo con cámara, micrófono, pantalla compartida, pizarra compartida, chat, mano levantada y grabación.',
    steps: [
      'Docente: desde una clase elige «Nueva sala en directo», o abre Clases en directo. Elige quién puede entrar: solo la clase o cualquiera (las salas abiertas requieren un docente verificado).',
      'Elige qué pueden usar los estudiantes: cámara, micrófono, pantalla compartida y chat.',
      'Inicia la sala a la hora de la clase. Los estudiantes reciben una notificación y entran con un toque.',
      'Los estudiantes entran con el micrófono silenciado y la cámara apagada. Levanta la mano para pedir la palabra; el docente ve cuántas manos hay levantadas.',
      'Usa la pizarra para explicar y Grabar para guardar la clase para quien faltó.',
      'Durante la clase usa «Preguntas y encuestas» para una pregunta rápida (marca la correcta para hacer un cuestionario), «Trabajo en grupos» para dividir a los estudiantes y «Asistencia» para ver quién está. Al terminar, la asistencia se registra sola.',
    ],
    tips: [
      'Si el audio o el vídeo no arrancan, permite la cámara y el micrófono para el sitio en tu navegador.',
      'Con mala conexión, apaga tu cámara: seguirás viendo y oyendo al docente.',
    ],
    roles: {
      student: 'Llega a tiempo: el docente puede pasar lista durante la clase.',
      teacher: 'Tú decides qué pueden usar los estudiantes y puedes cerrar la sala para todos.',
      parent: 'Los padres no entran en las clases en directo.',
    },
  },
  academic: {
    title: 'Mi estudio',
    summary:
      'Tu espacio personal de estudio: plan semanal, sesiones, cuentas atrás de exámenes, tarjetas con repetición espaciada, temporizador de concentración y dominio por materia. Todo cuenta para tu racha y tus XP.',
    steps: [
      'Añade tus exámenes con su fecha: Qubedu muestra cuentas atrás y puede exportarlos a tu calendario.',
      'Crea un plan semanal con materias y horarios. El plan de hoy aparece en tu inicio.',
      'Inicia una sesión de concentración (Pomodoro) al estudiar. Los minutos cuentan para tu meta diaria y tu racha, igual que las lecciones y los cuestionarios.',
      'Crea mazos de tarjetas y repasa cada día las pendientes: las que fallas vuelven antes.',
      'Las palabras que pronuncias mal en el Laboratorio de pronunciación pueden convertirse en tarjetas automáticamente.',
      'Dominio muestra tu nivel en cada materia según cuestionarios y repasos, para saber qué repasar después.',
    ],
    tips: ['Diez minutos de tarjetas al día valen más que dos horas una vez por semana.', 'Fija una meta diaria realista; puedes cambiarla cuando quieras.'],
    roles: {
      student: 'Tu padre o madre ve tu tiempo de estudio, no tus apuntes ni tus tarjetas.',
      teacher: 'Puedes usar las mismas herramientas para tu propio aprendizaje.',
      parent: 'Anima la racha diaria: crea el hábito.',
    },
  },
  assistant: {
    title: 'Qubedu AI',
    summary:
      'Dos ayudantes: el asistente de Qubedu responde preguntas sobre el uso del sitio y sobre tus materias, y el Tutor resuelve matemáticas paso a paso y responde a partir de los materiales de tus clases, con fuentes.',
    steps: [
      'Abre Qubedu AI y escribe tu pregunta en tu idioma.',
      'Para preguntas sobre el sitio («¿cómo me uno a una clase?»), el asistente responde con las guías de ayuda y te enlaza a la página correcta.',
      'Para preguntas de la materia, busca en los materiales de tus clases y muestra la fuente (archivo y página) bajo la respuesta.',
      'Matemáticas: escribe el problema (por ejemplo 2x + 3 = 11) y obtén el resultado con pasos numerados.',
      'Valora las respuestas con pulgar arriba o abajo: docentes y administradores lo usan para mejorar la base de conocimiento.',
    ],
    tips: [
      'Los docentes alimentan la IA subiendo materiales a la clase; los administradores añaden preguntas frecuentes y respuestas en la consola de moderación.',
      'Hay un límite diario de preguntas por cuenta.',
      'Para menores de 18, un padre o madre puede desactivar la IA.',
      'Marca «Guíame (pistas, no respuestas)» para aprender paso a paso. Durante un examen la IA se pausa hasta que entregues.',
    ],
    roles: {
      student: 'La IA solo lee materiales de tus propias clases.',
      teacher: 'Los estudiantes solo ven los materiales que hiciste visibles.',
      parent: 'Puedes activar o desactivar la IA para tu hijo desde la página Familia.',
    },
  },
  quiz: {
    title: 'Cuestionarios y exámenes',
    summary: 'Cuestionarios de práctica, exámenes con tiempo y práctica adaptativa, corregidos en el servidor con resultado inmediato y explicaciones.',
    steps: [
      'Abre Cuestionarios y elige uno, o «Práctica adaptativa» para preguntas de tu nivel.',
      'Responde; los exámenes con tiempo muestran una cuenta atrás y se entregan solos al final.',
      'Mira tu puntuación, las respuestas correctas y las explicaciones.',
      'Docente: elige «Nuevo cuestionario», añade preguntas (una respuesta, varias respuestas, verdadero/falso o respuesta corta), fija la duración y una hora de inicio opcional, y vincúlalo a una clase.',
      'Los resultados pueden contar en una parte de la calificación de la clase.',
      'Abre las estadísticas de un cuestionario para ver las preguntas más difíciles.',
    ],
    tips: [
      'Tu mejor puntuación aparece en cada cuestionario.',
      'La corrección se hace en el servidor, así que las respuestas no se ven antes de entregar.',
      'Fórmulas: escribe $x^2$ o $\\frac{1}{2}$ entre signos de dólar, o toca los botones de símbolos (fracción, potencia, raíz). También funcionan en publicaciones y respuestas.',
    ],
    roles: {
      student: 'Repite los cuestionarios de práctica cuanto quieras; se guarda tu mejor puntuación.',
      teacher: 'Cualquiera puede crear cuestionarios de práctica; los de una clase solo los ve esa clase.',
      parent: 'Ves los resultados de tu hijo en la página Familia.',
    },
  },
  schools: {
    title: 'Colegios: personas, grupos y boletines',
    summary:
      'Un administrador da de alta todo el colegio de una vez desde una hoja de cálculo, crea las asignaturas de cada grupo con sus docentes e imprime los boletines oficiales.',
    steps: [
      'Un docente verificado abre Colegios → Nuevo colegio y escribe el nombre, el plan de estudios y la dirección.',
      'Personas → Añadir desde una hoja de cálculo: guarda la lista como CSV (name, role, grade, class, number, email, parent email), elige el archivo y revisa la vista previa.',
      'Las cuentas nuevas reciben una primera contraseña que se muestra una sola vez: descárgala o imprímela.',
      'Quien ya tiene cuenta recibe una invitación y solo se une si la acepta.',
      'Grupos → Nueva asignatura de grupo: grupo, asignatura, código, docente y nota máxima. Todos los estudiantes del grupo se añaden.',
      'Boletines → elige un grupo → Imprimir / PDF: una página oficial por estudiante.',
    ],
    tips: [
      'Un administrador puede dar una contraseña nueva a un estudiante cuya cuenta creó el colegio.',
      'Las familias creadas junto con su hijo quedan vinculadas; una familia que ya tenía cuenta confirma primero.',
    ],
    roles: {
      student: 'Abre Colegios para unirte y ver tu boletín oficial.',
      teacher: 'Los grupos del colegio aparecen en Clase; tus notas van a los boletines.',
      parent: 'Abre Colegios para ver el boletín oficial de tu hijo.',
    },
  },
  curriculum: {
    title: 'Temario y tu plan',
    summary:
      'El temario oficial de tu curso, materia por materia: unidades, lecciones y los objetivos que debes dominar. Qubedu mide tu dominio de cada objetivo con tus cuestionarios y crea un plan personal.',
    steps: [
      'Abre Temario, elige el temario (por ejemplo Egipto) y tu curso, y abre una materia.',
      'Haz la prueba de nivel: dos preguntas por objetivo, para saber lo que ya dominas.',
      'Tu plan muestra los próximos objetivos, los más débiles primero, con las lecciones y cuestionarios vinculados.',
      'Pulsa Practicar en un objetivo, una lección o una unidad para recibir diez preguntas.',
      'Cada cuestionario actualiza tu dominio: un objetivo se pone verde al dominarlo (80 % o más con suficientes preguntas).',
    ],
    tips: [
      'Los docentes etiquetan sus preguntas con objetivos: cuantas más clases y bancos, más práctica.',
      'Los administradores añaden o importan el temario oficial; los docentes le vinculan lecciones y cuestionarios.',
    ],
    roles: {
      student: 'Empieza por la prueba de nivel y sigue «Estudia a continuación» un poco cada día.',
      teacher: 'Etiqueta cada pregunta con un objetivo y vincula tus lecciones y cuestionarios al temario: tus estudiantes los verán en su plan.',
      parent: 'Pide a tu hijo que te enseñe su plan: indica qué objetivos aún necesita trabajar.',
    },
  },
  banks: {
    title: 'Bancos de preguntas y exámenes justos',
    summary:
      'Guarda tus preguntas en bancos, etiquetadas por objetivo, dificultad y nivel de pensamiento. Crea exámenes con reglas para que cada estudiante reciba preguntas distintas y lee el análisis de cada pregunta.',
    steps: [
      'Cuestionarios → Bancos de preguntas → Nuevo banco. Añade preguntas con un objetivo, una dificultad y un nivel de pensamiento (recordar, comprender, aplicar…).',
      'Crea un examen y activa «Crear desde bancos de preguntas». Elige los bancos y añade reglas, por ejemplo 5 fáciles del objetivo A y 3 difíciles de la unidad 2.',
      'Activa «Mezclar las respuestas» para que los compañeros no compartan letras.',
      'Activa el modo examen: se pide pantalla completa y ves cuántas veces cada uno salió de la página.',
      'Después, abre las estadísticas: cada pregunta muestra cuántos acertaron y si distingue a fuertes de débiles; corrige las marcadas «A revisar».',
    ],
    tips: [
      'Un estudiante recibe siempre las mismas preguntas si reabre el examen, y solo puede hacerlo una vez.',
      'Las preguntas de un banco usado por un examen nunca aparecen en la práctica, así no se filtran antes.',
      'Solo puedes crear exámenes desde tus propios bancos.',
    ],
    roles: {
      student: 'En modo examen, quédate en la página hasta entregar: las salidas quedan registradas.',
      teacher: 'Reutiliza los mismos bancos cada periodo: las estadísticas se acumulan.',
      parent: 'Los resultados aparecen en el boletín cuando el examen cuenta en la calificación de la materia.',
    },
  },
  catalog: {
    title: 'Catálogo, cursos de pago y certificados',
    summary:
      'Un docente verificado puede publicar una clase en el catálogo público, gratis o con precio. Los estudiantes se inscriben, estudian y pueden obtener un certificado verificable con un enlace.',
    steps: [
      'Docente: verifícate primero (Ajustes → Cuenta → Verificación de docente).',
      'Abre la clase → Ajustes y activa «Mostrar en el catálogo público». Fija un precio (0 = gratis) y una moneda.',
      'Crea vales para regalar plazas, por ejemplo a un colegio.',
      'Para cobrar directamente, añade tu dirección de InstaPay, número de monedero o cuenta bancaria en los mismos ajustes. El estudiante sube el comprobante; lo apruebas en «Solicitudes de pago» y entra al curso.',
      'Los estudiantes abren el catálogo, leen la descripción y se inscriben (o pagan, o canjean un vale).',
      'Cuando un estudiante termina el curso, emite un certificado desde los ajustes de la clase. Tiene un enlace público de verificación.',
    ],
    tips: ['Los pagos con tarjeta van por Stripe o Paymob (Egipto: Meeza, Visa, Mastercard y monederos móviles); Qubedu nunca guarda datos de tarjetas.'],
    roles: {
      student: 'Tus certificados están en Yo → Certificados.',
      teacher: 'Solo los docentes verificados pueden publicar o vender cursos.',
      parent: 'Puedes explorar el catálogo para encontrar un curso para tu hijo.',
    },
  },
  tools: {
    title: 'Herramientas de estudio',
    summary:
      'Herramientas rápidas que abres desde cualquier lugar: calculadora de notas, horario de clases, temporizador de concentración, tarjetas y organizador. Están conectadas entre sí y con tus clases.',
    steps: [
      'Abre Todas las herramientas (icono de cuadrícula) para verlas en un solo lugar.',
      'Calculadora de notas: escribe la nota y el total de cada parte para ver el porcentaje, la calificación y lo que necesitas en el examen final para aprobar o llegar a tu meta.',
      'Horario: añade tus clases semanales con horas y aulas. Las clases de hoy aparecen en tu inicio.',
      'Temporizador: estudia en bloques de 25 minutos; los minutos cuentan para tu racha.',
      'Organizador: tareas con prioridades y notas de colores, ligadas a fechas de entrega.',
    ],
    tips: ['Las herramientas también funcionan en el móvil, en Yo → Herramientas.'],
    roles: {
      student: 'La calculadora puede partir de tus notas reales en una clase.',
      teacher: 'Comparte el horario con tu clase para avisar de cambios de aula.',
      parent: 'Usa el horario para conocer la jornada de tu hijo.',
    },
  },
  home: {
    title: 'Inicio',
    summary: 'Tu panel: meta diaria, racha, plan y clases de hoy, tareas próximas y sugerencias.',
    steps: [
      'Revisa el plan de hoy y lo que tienes que entregar.',
      'Toca una tarjeta para ir directo a la clase, el cuestionario o la lección.',
      'Mantén la racha estudiando unos minutos cada día.',
    ],
  },
  feed: {
    title: 'Preguntas y publicaciones',
    summary: 'Pregunta, comparte apuntes y comenta lecciones. Las respuestas de docentes verificados están marcadas.',
    steps: [
      'Elige «Hacer una pregunta», la materia, y explica claramente lo que intentaste.',
      'Marca la respuesta más útil como mejor respuesta.',
      'Usa el filtro «Sin respuesta» para ayudar a otros y ganar XP.',
    ],
  },
  watch: {
    title: 'Lecciones en vídeo',
    summary: 'Lecciones con capítulos, subtítulos, cuestionario de control y tus notas con marca de tiempo.',
    steps: [
      'Elige una lección; usa los capítulos para saltar a una parte.',
      'Añade una nota en cualquier momento: se guarda el instante.',
      'Responde el cuestionario de control para comprobar que entendiste.',
    ],
  },
  shorts: {
    title: 'Lecciones rápidas',
    summary: 'Lecciones cortas en vertical, una idea cada una.',
    steps: ['Desliza para la siguiente lección.', 'Guarda las que quieras repasar.', 'Abre la lección completa desde el enlace si lo hay.'],
  },
  lab: {
    title: 'Laboratorio de pronunciación',
    summary: 'Escucha, repite y obtén una puntuación de tu pronunciación en árabe, inglés, francés y español.',
    steps: ['Elige un idioma y una lista de palabras o frases.', 'Escucha, pulsa el micrófono y repite.', 'Las palabras que falles pueden ir a tus tarjetas.'],
  },
  library: {
    title: 'Biblioteca',
    summary: 'Libros, resúmenes y exámenes anteriores compartidos por docentes.',
    steps: [
      'Busca o filtra por categoría.',
      'Descarga o abre un recurso.',
      'Los docentes añaden recursos; los de docentes sin verificar se revisan antes de aparecer.',
    ],
  },
  events: {
    title: 'Talleres',
    summary: 'Sesiones y eventos programados en los que puedes inscribirte.',
    steps: ['Explora los próximos talleres.', 'Inscríbete para recibir un recordatorio.', 'Añádelo a tu calendario.'],
  },
  chat: {
    title: 'Mensajes',
    summary: 'Mensajes privados y de grupo con respuestas, reacciones y adjuntos.',
    steps: [
      'Empieza un chat desde un perfil o una clase.',
      'Mantén pulsado (o pasa el ratón) un mensaje para responder o reaccionar.',
      'Denuncia o bloquea desde el menú del chat si algo va mal.',
    ],
  },
  groups: {
    title: 'Grupos de estudio',
    summary: 'Grupos pequeños para estudiar juntos: debates, chat, recursos compartidos y repaso en directo.',
    steps: ['Crea un grupo o únete a uno.', 'Comparte archivos y preguntas en el grupo.', 'Inicia un repaso en directo con los miembros.'],
  },
  communities: {
    title: 'Comunidades',
    summary: 'Espacios grandes por materia, con canales y avisos.',
    steps: ['Únete a la comunidad de tu materia.', 'Lee primero el canal de avisos.', 'Pregunta en el canal adecuado.'],
  },
  people: {
    title: 'Personas',
    summary: 'Encuentra compañeros y docentes con quienes aprender, y mira la clasificación semanal.',
    steps: ['Busca por nombre o usuario.', 'Sigue a personas para ver sus publicaciones.', 'Mira la clasificación para saber quién estudió más esta semana.'],
  },
  league: {
    title: 'Ligas',
    summary: 'Ligas semanales con estudiantes de tu nivel. Gana XP para subir; la semana se reinicia el lunes.',
    steps: ['Estudia, haz cuestionarios y ayuda a otros para ganar XP.', 'Los primeros suben y los últimos bajan.', 'Tu liga aparece en tu perfil.'],
  },
  review: {
    title: 'Repaso diario',
    summary: 'Las tarjetas de hoy y las preguntas falladas, programadas justo antes de que las olvides.',
    steps: [
      'Abre el repaso diario: lista lo que toca hoy y cuánto tarda.',
      'Da la vuelta a cada tarjeta y valora cuánto la sabías; responde cada pregunta fallada y comprueba.',
      'Una pregunta fallada vuelve mañana; cada acierto la aleja más.',
      'La pestaña «Errores repetidos» muestra las preguntas falladas dos o más veces, con un botón para practicar el tema.',
      'El modo concentración (en la misma página) silencia las notificaciones push mientras estudias.',
    ],
  },
  'study-pack': {
    title: 'Pack de estudio',
    summary: 'Pega una lección o elige una nota y obtén términos clave, mapa mental, tarjetas y preguntas de práctica.',
    steps: [
      'Pega el texto (o elige una nota) y pulsa «Crear el pack».',
      'Lee los términos y el mapa mental y prueba las preguntas.',
      'Elige una materia y «Guardar tarjetas y términos» para añadirlos a tu repaso y a tu glosario.',
    ],
    tips: ['Funciona mejor con textos que incluyen definiciones («La fotosíntesis es el proceso…»).'],
  },
  glossary: {
    title: 'Glosario',
    summary: 'Los términos de cada materia con su significado: los tuyos y los que comparten los profesores.',
    steps: [
      'Añade un término con su materia y significado.',
      'Busca o filtra por materia.',
      'Con «Encontrar términos en un texto» detectas definiciones de una lección pegada y las añades de una vez.',
      'Un profesor puede compartir un término con toda su clase.',
    ],
  },
  mentors: {
    title: 'Mentores',
    summary: 'Estudiantes mayores que ofrecen ayuda en una materia, para que los más jóvenes sepan a quién preguntar.',
    steps: [
      'Abre Mentores y elige una materia para ver quién ofrece ayuda.',
      'Haz tu pregunta en la sala de estudio como pregunta e indica la materia. Los mentores responden en público, donde todos aprenden y los profesores ven.',
      'Los estudiantes de los dos últimos cursos de secundaria y de la universidad pueden ofrecer ayuda: añade tus materias y guarda.',
      'Cuando el autor elige tu respuesta como la mejor, ganas XP y cuenta en tus «respuestas elegidas».',
    ],
  },
  'teacher-tools': {
    title: 'Herramientas del profesor',
    summary: 'Planifica clases, corrige con una foto, compara clases, crea hojas por niveles, comparte plantillas en tu centro y escribe notas personales.',
    steps: [
      'Plan de clase: elige un objetivo del currículo y la duración para obtener un guion (calentamiento, explicación, práctica, comprobación y cierre) con los cuestionarios, vídeos y preguntas ya enlazados.',
      'Corregir un examen: elige la clase y el alumno, haz o sube una foto (el texto se lee si el servidor lo permite; si no, escríbelo), escribe la clave, revisa las notas sugeridas y guarda la nota aprobada en un componente manual.',
      'Comparar clases: elige dos o más clases para ver su promedio por objetivo.',
      'Hojas de trabajo: elige un objetivo para obtener preguntas de nivel básico, medio y avanzado, y guárdalas como tres cuestionarios.',
      'Plantillas compartidas: comparte un cuestionario o una tarea con los demás profesores del centro y usa las suyas.',
      'Notas a alumnos: obtén una nota personal sugerida a partir de los resultados, edítala y envíala al alumno y a sus padres.',
    ],
    tips: ['Las notas de una foto son solo sugerencias: puedes cambiar cualquier nota antes de guardar.'],
  },
  fees: {
    title: 'Cuotas escolares',
    summary: 'Tus cuotas escolares en un solo lugar, para ti y para tus hijos.',
    steps: [
      'Abre Cuotas escolares para ver cada plazo con su fecha y estado.',
      'Paga con tarjeta o monedero móvil si el centro lo activó, o envía una transferencia (InstaPay, monedero o banco): escribe la referencia y adjunta una foto del justificante.',
      'El centro revisa la transferencia y la marca como pagada; recibes una notificación. Si se rechaza, verás el motivo para volver a enviarla.',
      'Te avisamos unos días antes del vencimiento y de nuevo si se retrasa; las familias también pueden recibirlo por WhatsApp.',
      'Abre un plazo pagado para imprimir su recibo.',
    ],
  },
  'school-admin': {
    title: 'Gestionar un centro',
    summary: 'Las pestañas propias del centro: panel del director, cuotas, noticias y calendario, horario y encuestas.',
    steps: [
      'Panel (administradores): asistencia, notas medias y aprobados por clase y materia; imprímelo o guárdalo en PDF.',
      'Cuotas: crea una cuota, divídela en plazos mensuales para todos los alumnos (o una sección), indica cómo pagan las familias por transferencia y aprueba las transferencias recibidas.',
      'Noticias y calendario: publica anuncios para todos, alumnos, profesores o familias (también en su teléfono); añade festivos, exámenes y reuniones al calendario. Todos ven también las tareas de sus clases.',
      'Horario: añade las clases de cada grupo, detecta choques (mismo profesor, aula o sección dos veces a la vez) y asigna una clase a otro profesor.',
      'Encuestas: haz unas preguntas a alumnos, familias o profesores (valoraciones y comentarios). Las respuestas son anónimas y el centro solo ve medias y comentarios.',
    ],
  },
  meetings: {
    title: 'Reuniones familia-profesor',
    summary: 'Los profesores publican franjas libres; las familias reservan una para un hijo.',
    steps: [
      'Profesor: elige el inicio, el final y la duración de cada franja y publica. Las franjas libres aparecen a las familias de tus alumnos.',
      'Familia: abre Reuniones, elige un profesor de tu hijo, una franja libre y el hijo, escribe de qué quieres hablar y reserva.',
      'Os avisamos un día y una hora antes; las familias también pueden recibir el recordatorio por WhatsApp.',
      'Cualquiera puede cancelar; el otro recibe un aviso, y si cancela la familia la franja vuelve a quedar libre.',
    ],
  },
  'parent-tools': {
    title: 'En contacto con el colegio',
    summary: 'Alerta temprana, notas de conducta, «vi la tarea» y un resumen semanal hablado para las familias.',
    steps: [
      'Alerta temprana: cuando un hijo se queda atrás (tareas pendientes, notas bajas, faltas, inactividad), la familia y los profesores reciben un aviso, como máximo una vez por semana.',
      'Tareas: en la página Familia pulsa «Ya la vi» en cada tarea; el profesor ve qué familias la vieron.',
      'Conducta: los profesores pueden felicitar o señalar una preocupación; el alumno y la familia reciben un aviso y leen las notas en Notas y Familia.',
      'Resumen semanal: pulsa Escuchar en la página Familia y el teléfono lee la semana en voz alta en tu idioma.',
    ],
  },
  saved: {
    title: 'Guardados',
    summary: 'Lecciones, preguntas y recursos guardados, organizados en colecciones que puedes compartir.',
    steps: [
      'Toca el marcador para guardar.',
      'Agrupa lo guardado en colecciones.',
      'Comparte una colección con un enlace.',
      'Toca la campana de un elemento guardado para que te lo recordemos más tarde (en una hora, mañana, la semana que viene o cuando quieras). El recordatorio llega como notificación y abre el elemento.',
    ],
  },
  organizer: {
    title: 'Organizador',
    summary: 'Tareas con prioridades y fechas, y notas de colores.',
    steps: ['Añade una tarea con prioridad y fecha.', 'Márcala al terminar.', 'Usa las notas para ideas rápidas.'],
  },
  forms: {
    title: 'Formularios',
    summary: 'Crea encuestas, inscripciones y formularios calificados, y lee las respuestas.',
    steps: ['Crea un formulario y añade preguntas.', 'Comparte el enlace.', 'Lee las respuestas y expórtalas.'],
  },
  workspace: {
    title: 'Espacio de trabajo',
    summary: 'Documentos, hojas de cálculo, presentaciones y pizarras en la nube.',
    steps: ['Crea o importa un archivo.', 'Compártelo para trabajar juntos.', 'Expórtalo cuando necesites una copia.'],
  },
  certificates: {
    title: 'Certificados',
    summary: 'Tus certificados, cada uno con un enlace que cualquiera puede usar para verificarlo.',
    steps: [
      'Abre un certificado para verlo o descargarlo.',
      'Copia el enlace de verificación para compartirlo.',
      'Los certificados vienen de cursos completados.',
    ],
  },
  studio: {
    title: 'Estudio',
    summary: 'Tus lecciones subidas y sus estadísticas.',
    steps: ['Sube un vídeo de lección.', 'Añade capítulos y subtítulos.', 'Mira las visualizaciones y cuánto se vio.'],
  },
  settings: {
    title: 'Ajustes',
    summary: 'Apariencia, idioma, privacidad, notificaciones, vínculos familiares y tu cuenta.',
    steps: [
      'Cambia el idioma y el tema en Apariencia.',
      'Elige quién puede escribirte en Privacidad.',
      'Gestiona tu curso, vínculos familiares y cuenta en Cuenta.',
    ],
  },
};
