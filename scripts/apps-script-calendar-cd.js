/************************************************************
 *  CCIPS Pehuajó — Agenda CD en Google Calendar
 *  Públicas + privadas. Se ejecuta sola con un disparador.
 ************************************************************/

var DATOS_URL = "https://camarapehuajo.github.io/agenda-ccips/cd/agenda.json";
var CALENDARIO_ID = "c_36ade96c8d25155a4b278c41a2213c0f7f742f528fc03da904e8899bef1c5a85@group.calendar.google.com";
var MARCA = "ccipsidcd";

function sincronizarAgendaCD() {
  var cal = CalendarApp.getCalendarById(CALENDARIO_ID);
  if (!cal) {
    var cals = CalendarApp.getCalendarsByName("Agenda CD");
    if (cals.length > 0) {
      cal = cals[0];
    }
  }
  if (!cal) {
    Logger.log("No encontré el calendario. Revisá el ID y que la cuenta tenga acceso.");
    return;
  }

  var resp = UrlFetchApp.fetch(DATOS_URL + "?t=" + new Date().getTime(), { muteHttpExceptions: true });
  if (resp.getResponseCode() != 200) {
    Logger.log("Error al leer los datos: HTTP " + resp.getResponseCode());
    return;
  }
  var acts = JSON.parse(resp.getContentText());

  var eventos = cal.getEvents(new Date(2000, 0, 1), new Date(2100, 0, 1));
  for (var i = 0; i < eventos.length; i++) {
    if (eventos[i].getTag(MARCA)) {
      eventos[i].deleteEvent();
    }
  }

  var n = 0;
  for (var j = 0; j < acts.length; j++) {
    var a = acts[j];
    if (!a.fecha) continue;
    var privado = !!a.privado;
    var titulo = (privado ? "🔒 " : "") + a.nombre;
    var desc = (a.descripcion ? a.descripcion + "\n\n" : "") + "Agenda CD - CCIPS Pehuajó";
    if (privado) desc += "\n\nEvento privado - Comisión Directiva";
    var ev;
    if (a.hora) {
      var ini = new Date(a.fecha + "T" + a.hora + ":00-03:00");
      var fin = new Date(ini.getTime() + 3600000);
      ev = cal.createEvent(titulo, ini, fin, { description: desc, location: a.lugar || "" });
    } else {
      var p = a.fecha.split("-");
      var dia = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
      ev = cal.createAllDayEvent(titulo, dia, { description: desc, location: a.lugar || "" });
    }
    try { ev.setColor(privado ? "#8E24AA" : "#039BE5"); } catch (e) {}
    ev.setTag(MARCA, a.id);
    ev.setTransparency(CalendarApp.EventTransparency.TRANSPARENT);
    n++;
  }

  Logger.log("Listo: " + n + " eventos sincronizados.");
}
