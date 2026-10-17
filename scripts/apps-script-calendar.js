/************************************************************
 *  CCIPS Pehuajó — Sincroniza la Agenda (web) con un Google Calendar
 *  Se pega en script.google.com y corre solo, 1 vez por día.
 *  Cada evento incluye: título + día/hora + lugar + descripción
 *  + link a la web. Figuran como "Disponible".
 ************************************************************/

var DATOS_URL  = "https://camarapehuajo.github.io/agenda-ccips/actividades.json";
var CALENDARIO = "Agenda CCIPS";   // nombre exacto del calendario que creaste
var MARCA      = "ccipsid";        // etiqueta oculta para reconocer los eventos de este script
var WEB        = "https://camarapehuajo.github.io/agenda-ccips/#";

function sincronizarAgenda() {
  var cals = CalendarApp.getCalendarsByName(CALENDARIO);
  if (!cals.length) {
    Logger.log("No encontré el calendario '" + CALENDARIO + "'. Revisá el nombre exacto.");
    return;
  }
  var cal = cals[0];

  // 1) Descargar las actividades de la web
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

  // 3) Crear los eventos actuales
  var n = 0;
  acts.forEach(function (a) {
    if (a.privado || !a.fecha) return;          // los privados no van al calendario público
    var desc = (a.descripcion ? a.descripcion + "\n\n" : "") + "Más info: " + WEB + a.id;
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
