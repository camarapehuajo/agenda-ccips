/* ============================================================
   ACTIVIDADES — ARCHIVO DE DATOS
   ============================================================
   Este archivo es GENERADO automáticamente por el conector
   (n8n / Make / Zapier) a partir de Notion.

   NO lo edites a mano: cada vez que el conector corre, lo
   sobreescribe con los datos actualizados de Notion.

   El único requisito es que defina:  window.ACTIVIDADES = [...]

   Formato de cada actividad:
   {
     id:             string único, en minúsculas sin espacios (ej: "charla-impuestos")
     nombre:         título del evento
     fecha:          "YYYY-MM-DD"
     hora:           "19:00"  (opcional; si va vacío, el evento es de día completo)
     lugar:          "Salón de la Cámara"  (opcional)
     tipo:           "Charla" | "Curso" | "Evento" | "Asamblea" | "Feria" | ...
     imagen:         url de la foto, o "" si no hay  (opcional)
     descripcion:    texto libre  (opcional)
     linkInscripcion: url del formulario, o ""  (opcional)
     ubicacion:      url de Google Maps, o "" si no hay  (opcional; muestra "Ver en mapa")
     privado:        true = NO aparece en la agenda (solo por link #id)
   }
   ============================================================ */

window.ACTIVIDADES = [
  {
    id: "charla-impuestos-2026",
    nombre: "Charla: Impuestos 2026 para comercios",
    fecha: "2026-10-01",
    hora: "19:00",
    lugar: "Salón de la Cámara",
    tipo: "Charla",
    imagen: "",
    descripcion: "Repaso práctico de los cambios impositivos 2026 para pequeños y medianos comercios. A cargo de un contador invitado. Cupo limitado.",
    linkInscripcion: "https://example.com/inscripcion-charla-impuestos",
    ubicacion: "https://maps.google.com/?q=Pehuajó",
    privado: false
  },
  {
    id: "marketing-digital-pymes",
    nombre: "Capacitación: Marketing digital para pymes",
    fecha: "2026-10-10",
    hora: "18:30",
    lugar: "Aula Taller",
    tipo: "Curso",
    imagen: "",
    descripcion: "Taller práctico: redes sociales, Google Mi Negocio y publicidad online para comercios locales.",
    linkInscripcion: "https://example.com/inscripcion-marketing",
    ubicacion: "",
    privado: false
  },
  {
    id: "expo-pehuajo-2026",
    nombre: "Expo Pehuajó 2026",
    fecha: "2026-10-22",
    hora: "",
    lugar: "Predio Ferial",
    tipo: "Feria",
    imagen: "",
    descripcion: "La gran feria anual de la ciudad. Stands, gastronomía y espectáculos. Entrada libre y gratuita.",
    linkInscripcion: "",
    ubicacion: "https://maps.google.com/?q=Predio Ferial Pehuajó",
    privado: false
  },
  {
    id: "asamblea-general-nov",
    nombre: "Asamblea General Ordinaria",
    fecha: "2026-11-05",
    hora: "20:00",
    lugar: "Salón de la Cámara",
    tipo: "Asamblea",
    imagen: "",
    descripcion: "Asamblea general ordinaria de socios. Se tratará el orden del día publicado.",
    linkInscripcion: "",
    ubicacion: "https://maps.google.com/?q=Pehuajó",
    privado: false
  },
  {
    id: "taller-whatsapp-business",
    nombre: "Taller: Cómo vender por WhatsApp Business",
    fecha: "2026-11-12",
    hora: "18:00",
    lugar: "Online",
    tipo: "Curso",
    imagen: "",
    descripcion: "Aprendé a usar WhatsApp Business: catálogo, mensajes automáticos y etiquetas para vender más.",
    linkInscripcion: "https://example.com/inscripcion-whatsapp",
    ubicacion: "",
    privado: false
  },
  {
    id: "reunion-cd-privada",
    nombre: "Reunión de Comisión Directiva",
    fecha: "2026-10-15",
    hora: "19:30",
    lugar: "Sala de reuniones",
    tipo: "Reunión",
    imagen: "",
    descripcion: "Reunión interna de la Comisión Directiva.",
    linkInscripcion: "",
    ubicacion: "",
    privado: true
  }
];
