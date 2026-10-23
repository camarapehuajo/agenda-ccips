/************************************************************
 *  CCIPS Pehuajó — Sincroniza la Agenda CD con Google Calendar
 *  Incluye actividades públicas + privadas.
 *  Se pega en script.google.com y corre solo (trigger diario/horario).
 *  Requiere que exista el calendario "Agenda CD".
 ************************************************************/

var DATOS_URL  = "https://camarapehuajo.github.io/agenda-ccips/cd/agenda.json";
var CALENDARIO = "Agenda CD";       // nombre exacto del calendario
var MARCA      = "ccipsidcd";       // etiqueta oculta para reconocer los eventos de este script

function sincronizarAgendaCD() {
  var cals = CalendarApp.getCalendarsByName(CALENDARIO);
  if (!cals.length) {
    Logger.log("No encontré el calendario '" + CALENDARIO + "'. Creálo o revisá el nombre exacto.");
    return;
  }
  var cal = cals[0];

  // 1) Descargar todas las actividades (públicas + privadas)
  var resp = UrlFetchApp.fetch(DATOS_URL + "?t=" + new Date().getTime(), { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) {
    Logger.log("Error al leer los datos (HTTP " + resp.getResponseCode() + ")");
    return;
  }
  var acts = JSON.parse(resp.getContentText());

  // 2) Borrar los eventos que puso este script antes
  var desde = new Date(2000, 0, 1);
  var hasta = new Date(2100, 0, 1);
  cal.getEvents(desde, hasta).forEach(function (ev) {
    var d = ev.getDescription() || "";
    if (ev.getTag(MARCA) || d.indexOf(MARCA + ":") >= 0) ev.deleteEvent();
  });

  // 3) Crear los eventos actuales (todas, sin filtrar privadas)
  var n = 0;
  acts.forEach(function (a) {
    if (!a.fecha) return;
    var desc = (a.descripcion ? a.descripcion + "\n\n" : "") + "Agenda CD - CCIPS Pehuajó";
    var ev;
    if (a.hora) {
      var ini = new Date(a.fecha + "T" + a.hora + ":00-03:00");   // hora de Argentina (UTC-3)
      var fin = new Date(ini.getTime() + 60 * 60 * 1000);         // 1 hora de duración
      ev = cal.createEvent(a.nombre, ini, fin, { description: desc, location: a.lugar || "" });
    } else {
      var p = a.fecha.split("-");
      var dia = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
      ev = cal.createAllDayEvent(a.nombre, dia, { description: desc, location: a.lugar || "" });
    }
    ev.setTag(MARCA, a.id);                                       // marca oculta
    ev.setTransparency(CalendarApp.EventTransparency.TRANSPARENT); // "Disponible"
    n++;
  });

  Logger.log("Listo: " + n + " eventos sincronizados en '" + CALENDARIO + "'.");
}
